// Multi-step AI pipeline for the Admin "Upload Lecture" section.
//
// 5 steps (some merge what were previously separate agents, to cut API calls):
//   Step 1  Analyze lecture                         (Haiku)
//   Step 2  Generate & review questions  [merge]    (Haiku, 8000 tok)
//   Step 3  Humanize                                (Sonnet)
//   Step 4  Explanations & high-yield     [merge]   (Sonnet, per question)
//   Step 5  Flashcards                              (Haiku, parallel off Step 1)
//
// Each step validates the previous step's output before running; on failure it
// shows a reason + a Retry button and never forwards bad data. Prompt caching
// (cache_control: ephemeral) is applied to the large/reused blocks — the PDF and
// the lecture analysis — so retries and same-model reuse get the cache discount.
import { useEffect, useRef, useState } from "react";
import Anthropic from "@anthropic-ai/sdk";
import { supabase } from "../lib/supabase";
import { useLectures } from "../lib/useLectures";
import { colors, gradients, font } from "../theme";

const MODEL_FAST = "claude-haiku-4-5-20251001";
const MODEL_QUALITY = "claude-sonnet-4-6";
const MAX_TOKENS = 4000;
const JSON_RULE = "\n\nReturn ONLY valid JSON. No markdown, no code fences, no prose before or after.";
const CACHE = { type: "ephemeral" };

const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY;
const anthropic = apiKey ? new Anthropic({ apiKey, dangerouslyAllowBrowser: true }) : null;

const diffColor = { easy: colors.green, medium: colors.amber, hard: colors.red };

const STEPS = [
  { id: "s1", n: 1, label: "Analyze lecture", running: "Analyzing lecture…", desc: "Extract every topic, fact and high-yield point" },
  { id: "s2", n: 2, label: "Generate & review questions", running: "Generating & reviewing…", desc: "Comprehensive questions, self-reviewed for accuracy" },
  { id: "s3", n: 3, label: "Humanize", running: "Humanizing…", desc: "Rewrite to sound human-authored" },
  { id: "s4", n: 4, label: "Write explanations & high-yield", running: "Writing explanations & high-yield…", desc: "Per-question explanation + high-yield summary" },
  { id: "s5", n: 5, label: "Flashcards", running: "Building flashcards…", desc: "Flashcards for every key fact" },
];

// ── JSON helpers ─────────────────────────────────────────────────────────────
// Scan from `start` for the matching top-level close bracket (string-aware).
// Returns the balanced slice, or null if the response was cut off before it closed.
function sliceMatched(t, start) {
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < t.length; i++) {
    const ch = t[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === "{" || ch === "[") depth++;
    else if (ch === "}" || ch === "]") {
      depth--;
      if (depth === 0) return t.slice(start, i + 1);
    }
  }
  return null;
}

// Repair a truncated response: rebuild from the latest point where the content
// still forms complete values, then close every still-open bracket. This keeps
// the last complete array element / object property before the cutoff.
function repairTruncated(t, start) {
  const stack = [];
  let inStr = false;
  let esc = false;
  let bestLen = -1;
  let bestStack = null;
  const mark = (len, snapshot) => {
    if (len > bestLen) {
      bestLen = len;
      bestStack = snapshot.slice();
    }
  };
  for (let i = start; i < t.length; i++) {
    const ch = t[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') {
      inStr = true;
    } else if (ch === "{" || ch === "[") {
      stack.push(ch);
    } else if (ch === "}" || ch === "]") {
      stack.pop();
      if (stack.length >= 1) mark(i + 1, stack); // safe point right after a nested close
    } else if (ch === "," && stack.length >= 1) {
      mark(i, stack); // safe point right before a separator (drop the partial next item)
    }
  }
  if (bestLen === -1 || !bestStack || bestStack.length === 0) return null;
  let body = t.slice(start, bestLen).replace(/[\s,]+$/, "");
  for (let k = bestStack.length - 1; k >= 0; k--) body += bestStack[k] === "{" ? "}" : "]";
  return body;
}

function extractJson(text) {
  const t = (text || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  const firstObj = t.indexOf("{");
  const firstArr = t.indexOf("[");
  let start;
  if (firstArr !== -1 && (firstObj === -1 || firstArr < firstObj)) start = firstArr;
  else start = firstObj;
  if (start === -1) throw new Error("No JSON found in the model's response.");

  // 1) Try a clean balanced parse.
  const matched = sliceMatched(t, start);
  if (matched !== null) {
    try {
      return JSON.parse(matched);
    } catch {
      // fall through to truncation repair
    }
  }
  // 2) Truncated (or malformed tail): recover the longest complete prefix.
  const repaired = repairTruncated(t, start);
  if (repaired !== null) {
    try {
      return JSON.parse(repaired);
    } catch {
      // fall through to error
    }
  }
  throw new Error("Could not parse the model's JSON — the response was likely truncated.");
}

async function callClaude(system, content, maxTokens = MAX_TOKENS, model = MODEL_FAST) {
  if (!anthropic) throw new Error("VITE_ANTHROPIC_API_KEY is not set — add it to your .env and restart the dev server.");
  const msg = await anthropic.messages.create({
    model,
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user", content }],
  });
  return (msg.content || [])
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("");
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = () => reject(new Error("Could not read the PDF file."));
    reader.readAsDataURL(file);
  });
}

// ── validators (between-step gates) ──────────────────────────────────────────
function validateAnalysis(a) {
  if (!a || typeof a !== "object") return "Analyzer did not return an object.";
  if (!a.mainTopic) return "Analyzer output is missing 'mainTopic'.";
  if (!Array.isArray(a.topics) || a.topics.length === 0) return "Analyzer output is missing a non-empty 'topics[]'.";
  if (a.topics.some((t) => !t || typeof t.name !== "string" || !t.name.trim())) return "Each topic must have a 'name'.";
  return null;
}

// Keep only well-formed questions (non-empty stem, exactly 5 non-empty options,
// correct_answer 0–4); silently drop the rest. Throws ONLY if none are valid.
// Returns { valid: [...], dropped: number } so one bad item can't sink the batch.
function filterQuestions(arr) {
  if (!Array.isArray(arr)) throw new Error("Expected a JSON array of questions.");
  const valid = [];
  let dropped = 0;
  for (const q of arr) {
    const ok =
      q && typeof q === "object" &&
      typeof q.stem === "string" && q.stem.trim() &&
      Array.isArray(q.options) && q.options.length === 5 &&
      q.options.every((o) => typeof o === "string" && o.trim()) &&
      typeof q.correct_answer === "number" && q.correct_answer >= 0 && q.correct_answer <= 4;
    if (ok) valid.push(q);
    else dropped++;
  }
  if (valid.length === 0) throw new Error("No valid questions were produced (all were malformed).");
  return { valid, dropped };
}

function normDiff(d) {
  const v = String(d || "").toLowerCase();
  return v === "easy" || v === "medium" || v === "hard" ? v : "medium";
}

// ── small UI bits ────────────────────────────────────────────────────────────
const card = { background: "#fff", borderRadius: 16, padding: "22px 24px", boxShadow: "0 1px 6px rgba(0,0,0,0.05)" };
const input = { width: "100%", padding: "10px 12px", borderRadius: 9, border: `1.5px solid ${colors.line}`, fontSize: 14, fontFamily: font, color: colors.text, outline: "none", background: "#fff" };

function Banner({ kind, children }) {
  const p = kind === "ok"
    ? { bg: "#ECFDF5", border: "#BBF7D0", color: "#065F46" }
    : { bg: "#FEF2F2", border: "#FECACA", color: "#991B1B" };
  return <div style={{ background: p.bg, border: `1.5px solid ${p.border}`, color: p.color, borderRadius: 10, padding: "11px 14px", fontSize: 13, marginBottom: 16 }}>{children}</div>;
}

function PrimaryBtn({ children, onClick, disabled, style }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{ background: gradients.accent, color: "#fff", border: "none", borderRadius: 11, padding: "12px 24px", fontSize: 14, fontWeight: 700, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.55 : 1, fontFamily: font, boxShadow: "0 4px 14px rgba(79,142,247,0.3)", ...style }}>
      {children}
    </button>
  );
}

function StatusDot({ status }) {
  if (status === "running") {
    return <div style={{ width: 18, height: 18, borderRadius: "50%", border: `2.5px solid ${colors.line}`, borderTopColor: colors.blue, animation: "spin 0.7s linear infinite" }} />;
  }
  const map = {
    done: { bg: colors.green, ch: "✓" },
    error: { bg: colors.red, ch: "✕" },
    idle: { bg: "#CBD5E1", ch: "" },
  };
  const s = map[status] || map.idle;
  return <div style={{ width: 18, height: 18, borderRadius: "50%", background: s.bg, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800 }}>{s.ch}</div>;
}

// ════════════════════════════════════════════════════════════════════════════
export default function LecturePipeline() {
  const [subjects, setSubjects] = useState([]);
  const [file, setFile] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [running, setRunning] = useState(false);
  const [status, setStatus] = useState(Object.fromEntries(STEPS.map((a) => [a.id, { state: "idle", error: "" }])));
  const [preview, setPreview] = useState(null);
  const [subjectId, setSubjectId] = useState("");
  const [lectureId, setLectureId] = useState("");
  const lectures = useLectures(subjectId);
  const [msg, setMsg] = useState(null);
  const [publishing, setPublishing] = useState(false);

  const fileRef = useRef(null);
  const data = useRef({}); // s1..s5 outputs — source of truth for chaining

  useEffect(() => {
    let active = true;
    (async () => {
      const { data: subs } = await supabase.from("subjects").select("id, name").order("name");
      if (!active) return;
      setSubjects(subs || []);
      if (subs && subs.length) setSubjectId((cur) => cur || subs[0].id);
    })();
    return () => {
      active = false;
    };
  }, []);

  const setStep = (id, patch) => setStatus((s) => ({ ...s, [id]: { ...s[id], ...patch } }));

  // ── steps ────────────────────────────────────────────────────────────────────
  // Each returns true on success (output stored in data.current), false on failure.

  // Step 1 — Analyze (Haiku). PDF block is cached so retries skip re-reading it.
  const runAnalyze = async () => {
    setStep("s1", { state: "running", error: "" });
    try {
      if (!file) throw new Error("No PDF selected.");
      const base64 = await fileToBase64(file);
      const system = "You are a medical education expert analyzing a university lecture for USMLE Step 1 preparation.";
      const task =
        "Extract EVERY topic, disease, concept, and fact from this lecture — including minor details. Miss nothing. For each: name, all key facts, unique features, and what distinguishes it from similar topics. " +
        'Output JSON with this exact shape: { "mainTopic": string, "topics": [{ "name": string, "keyFacts": string[], "uniqueFeatures": string[], "importance": "high"|"medium"|"low" }] }.' +
        JSON_RULE;
      const text = await callClaude(
        system,
        [
          { type: "document", source: { type: "base64", media_type: "application/pdf", data: base64 }, cache_control: CACHE },
          { type: "text", text: task },
        ],
        8000,
        MODEL_FAST
      );
      const out = extractJson(text);
      const err = validateAnalysis(out);
      if (err) throw new Error(err);
      data.current.s1 = out;
      setStep("s1", { state: "done", error: "" });
      return true;
    } catch (e) {
      setStep("s1", { state: "error", error: e.message });
      return false;
    }
  };

  // Step 2 — Generate + self-review questions in one call (Haiku, 8000 tokens).
  // The lecture analysis is sent as a cached block (caches system + analysis).
  const runGenerateReview = async () => {
    const s1 = data.current.s1;
    const gateErr = validateAnalysis(s1);
    if (gateErr) {
      setStep("s2", { state: "error", error: `Cannot run — Step 1 (Analyze) output invalid: ${gateErr}` });
      return false;
    }
    setStep("s2", { state: "running", error: "" });
    try {
      const system = "You are a medical education expert who writes and rigorously reviews USMLE Step 1 questions.";
      const instruction =
        "STEP A — GENERATE: You are creating a COMPLETE study resource that must cover the ENTIRE lecture so students need no other source. Generate enough questions to cover EVERY fact in the analysis — high, medium, AND low importance. Do not skip anything. There is no fixed number.\n" +
        "Rules:\n" +
        "- Each question covers ONE specific fact.\n" +
        "- Cover every topic and every key fact, even minor ones.\n" +
        "- Mix difficulty by importance: high-importance facts get harder clinical questions, low-importance facts get simple direct recall questions.\n" +
        "- Overall mix: roughly 40% easy (direct recall), 40% medium (compare/apply), 20% hard (clinical reasoning).\n" +
        "- Easy: short direct stem. Medium: short scenario. Hard: brief clinical vignette.\n" +
        "- Each question must have exactly 5 options (A–E) and a correct_answer index 0–4.\n" +
        "STEP B — REVIEW: Then review every question you wrote for medical accuracy. Fix factual errors, ensure a single best answer, and make distractors plausible but clearly incorrect.\n" +
        'Output ONLY the final corrected JSON array, each object: { "stem": string, "options": string[5] (5 strings), "correct_answer": number (0-4), "difficulty": "easy"|"medium"|"hard" }.' +
        JSON_RULE;
      const out = extractJson(
        await callClaude(
          system,
          [
            { type: "text", text: "LECTURE ANALYSIS:\n" + JSON.stringify(s1), cache_control: CACHE },
            { type: "text", text: instruction },
          ],
          8000
        )
      );
      const { valid, dropped } = filterQuestions(out);
      if (dropped) console.warn(`Step 2 dropped ${dropped} malformed question(s); kept ${valid.length}.`);
      data.current.s2 = valid;
      setStep("s2", { state: "done", error: "" });
      return true;
    } catch (e) {
      setStep("s2", { state: "error", error: e.message });
      return false;
    }
  };

  // Step 3 — Humanize (Sonnet).
  const runHumanize = async () => {
    const s2 = data.current.s2;
    if (!Array.isArray(s2) || s2.length === 0) {
      setStep("s3", { state: "error", error: "Cannot run — Step 2 (Generate & review) produced no valid questions." });
      return false;
    }
    setStep("s3", { state: "running", error: "" });
    try {
      const system = "You are a medical educator and skilled writer.";
      const task =
        "Rewrite these questions so they read naturally and human-authored — no AI tells, no formulaic phrasing — while preserving the exact medical content and the correct answers. Keep ALL the questions (do not drop or merge any) and the same JSON shape (stem, options[5], correct_answer 0–4, difficulty). " +
        "Return the JSON array.\n\nQUESTIONS:\n" + JSON.stringify(s2) + JSON_RULE;
      const out = extractJson(await callClaude(system, task, MAX_TOKENS, MODEL_QUALITY));
      const { valid, dropped } = filterQuestions(out);
      if (dropped) console.warn(`Step 3 dropped ${dropped} malformed question(s); kept ${valid.length}.`);
      data.current.s3 = valid;
      setStep("s3", { state: "done", error: "" });
      return true;
    } catch (e) {
      setStep("s3", { state: "error", error: e.message });
      return false;
    }
  };

  // Step 4 — Explanation + high-yield per question in one call (Sonnet, 2000 tok).
  // One call per question avoids truncation; the shared instruction is cached.
  const runExplainHighYield = async () => {
    const s3 = data.current.s3;
    if (!Array.isArray(s3) || s3.length === 0) {
      setStep("s4", { state: "error", error: "Cannot run — Step 3 (Humanize) produced no valid questions." });
      return false;
    }
    setStep("s4", { state: "running", error: "" });
    try {
      const system = "You are a medical educator writing clear explanations and high-yield exam pearls.";
      const instruction =
        "For THIS single USMLE Step 1 question, write BOTH: " +
        "(1) 'explanation' — why the correct answer is right, why each distractor is wrong, the underlying mechanism, and a key takeaway, in clear, simple, well-structured paragraphs; and " +
        "(2) 'high_yield' — a concise 2–3 sentence summary of the buzzwords, board traps, and classic pattern for this question. " +
        'Return ONLY a JSON object of the form { "explanation": string, "high_yield": string }.' +
        JSON_RULE;
      const strictInstruction =
        'Return ONLY the JSON object {"explanation": "...", "high_yield": "..."} and nothing else. ' +
        "No prose, no preamble, no explanation of what you are doing, no markdown, no code fences — output must start with { and end with }. " +
        "The 'explanation' covers why the correct answer is right, why each distractor is wrong, the underlying mechanism, and a key takeaway. " +
        "The 'high_yield' is a 2–3 sentence summary of buzzwords, board traps, and the classic pattern for this question.";

      // One attempt for a single question. Throws if the response can't be parsed
      // into an object with a non-empty explanation. `strict` uses a terser, more
      // forceful JSON-only prompt for the retry.
      const askOne = async (q, strict) => {
        const out = extractJson(
          await callClaude(
            system,
            [
              { type: "text", text: strict ? strictInstruction : instruction, cache_control: CACHE },
              { type: "text", text: "QUESTION:\n" + JSON.stringify({ stem: q.stem, options: q.options, correct_answer: q.correct_answer }) },
            ],
            2000,
            MODEL_QUALITY
          )
        );
        const explanation = out && typeof out.explanation === "string" ? out.explanation.trim() : "";
        const high_yield = out && typeof out.high_yield === "string" ? out.high_yield.trim() : "";
        if (!explanation) throw new Error("explanation missing or empty");
        return { explanation, high_yield };
      };

      const results = [];
      const fellBack = [];
      for (let i = 0; i < s3.length; i++) {
        const q = s3[i];
        let res = null;
        try {
          res = await askOne(q, false);
        } catch {
          // One stricter retry before giving up on this question.
          try {
            res = await askOne(q, true);
          } catch {
            res = null;
          }
        }
        if (!res) {
          fellBack.push(i + 1);
          res = { explanation: "Explanation pending review", high_yield: "" };
        }
        results.push(res);
      }
      if (fellBack.length) console.warn(`Step 4 used the fallback for question(s) ${fellBack.join(", ")} (${fellBack.length} of ${s3.length}).`);
      data.current.s4 = results; // aligned 1:1 with s3 questions
      setStep("s4", { state: "done", error: "" });
      return true;
    } catch (e) {
      setStep("s4", { state: "error", error: e.message });
      return false;
    }
  };

  // Step 5 — Flashcards (Haiku), parallel off Step 1. Analysis sent as cached block.
  const runFlashcards = async () => {
    const s1 = data.current.s1;
    const gateErr = validateAnalysis(s1);
    if (gateErr) {
      setStep("s5", { state: "error", error: `Cannot run — Step 1 (Analyze) output invalid: ${gateErr}` });
      return false;
    }
    setStep("s5", { state: "running", error: "" });
    try {
      const system = "You are a medical educator creating high-yield Anki flashcards.";
      const instruction =
        "Create flashcards covering EVERY important fact in the lecture — one fact per card. Cover all topics completely so this is a full study resource. Each card has a front (question/term) and a back (answer). " +
        'Output: a JSON array of objects: { "front": string, "back": string }.' +
        JSON_RULE;
      const out = extractJson(
        await callClaude(system, [
          { type: "text", text: "LECTURE ANALYSIS:\n" + JSON.stringify(s1), cache_control: CACHE },
          { type: "text", text: instruction },
        ])
      );
      if (!Array.isArray(out) || out.length === 0) throw new Error("Expected a JSON array of flashcards.");
      data.current.s5 = out.filter((c) => c && c.front && c.back);
      setStep("s5", { state: "done", error: "" });
      return true;
    } catch (e) {
      setStep("s5", { state: "error", error: e.message });
      return false;
    }
  };

  // ── orchestration ────────────────────────────────────────────────────────────
  // Chain: 2 → 3 → 4 (questions). Flashcards (5) run in parallel off Step 1.
  const chain = [runGenerateReview, runHumanize, runExplainHighYield];
  const chainIds = ["s2", "s3", "s4"];

  const runChainFrom = async (index) => {
    for (let i = index; i < chain.length; i++) {
      const ok = await chain[i]();
      if (!ok) return false;
    }
    return true;
  };

  const buildPreview = () => {
    const s3 = data.current.s3;
    const s4 = data.current.s4 || []; // [{ explanation, high_yield }] aligned to s3
    const s5 = data.current.s5 || [];
    if (!s3) return;
    const questions = s3.map((q, i) => ({
      stem: q.stem,
      options: [...q.options],
      correct_answer: q.correct_answer,
      difficulty: normDiff(q.difficulty),
      explanation: s4[i]?.explanation || "",
      high_yield: s4[i]?.high_yield || "",
      board_trap: "",
    }));
    const flashcards = s5.map((c) => ({ front: c.front, back: c.back }));
    const s1 = data.current.s1;
    setPreview({
      questions,
      flashcards,
      topic: s1?.mainTopic || "",
      topicCount: Array.isArray(s1?.topics) ? s1.topics.length : 0,
    });
  };

  const runAll = async () => {
    setMsg(null);
    setPreview(null);
    data.current = {};
    setStatus(Object.fromEntries(STEPS.map((a) => [a.id, { state: "idle", error: "" }])));
    if (!apiKey) return setMsg({ kind: "error", text: "VITE_ANTHROPIC_API_KEY is not set. Add it to .env and restart the dev server." });
    if (!file) return setMsg({ kind: "error", text: "Please add a lecture PDF first." });

    setRunning(true);
    const okS1 = await runAnalyze();
    if (okS1) {
      // Question chain (2→3→4) runs alongside flashcards (5), which only needs Step 1.
      await Promise.all([runChainFrom(0), runFlashcards()]);
    }
    setRunning(false);
    if (data.current.s3) buildPreview();
  };

  // Retry one step, then re-run whatever depends on it. Never auto-runs siblings.
  const retry = async (id) => {
    setMsg(null);
    setRunning(true);
    if (id === "s1") {
      const ok = await runAnalyze();
      if (ok) await Promise.all([runChainFrom(0), runFlashcards()]);
    } else if (id === "s5") {
      await runFlashcards();
    } else {
      // s2..s4 live in the chain; retrying one re-runs it and its dependents.
      const idx = chainIds.indexOf(id);
      if (idx !== -1) await runChainFrom(idx);
    }
    setRunning(false);
    if (data.current.s3) buildPreview();
  };

  // ── preview editing ──────────────────────────────────────────────────────────
  const editQuestion = (qi, patch) => setPreview((p) => ({ ...p, questions: p.questions.map((q, i) => (i === qi ? { ...q, ...patch } : q)) }));
  const editOption = (qi, oi, val) => setPreview((p) => ({ ...p, questions: p.questions.map((q, i) => (i === qi ? { ...q, options: q.options.map((o, j) => (j === oi ? val : o)) } : q)) }));
  const removeQuestion = (qi) => setPreview((p) => ({ ...p, questions: p.questions.filter((_, i) => i !== qi) }));
  const editCard = (ci, patch) => setPreview((p) => ({ ...p, flashcards: p.flashcards.map((c, i) => (i === ci ? { ...c, ...patch } : c)) }));
  const removeCard = (ci) => setPreview((p) => ({ ...p, flashcards: p.flashcards.filter((_, i) => i !== ci) }));

  // ── publish ──────────────────────────────────────────────────────────────────
  const publish = async () => {
    setMsg(null);
    if (!subjectId) return setMsg({ kind: "error", text: "Choose a subject before publishing." });
    if (!preview) return;
    setPublishing(true);
    try {
      const topic = (preview.topic || "").trim() || null;

      const norm = (s) => String(s || "").trim().toLowerCase().replace(/\s+/g, " ");
      const { data: existing, error: exErr } = await supabase.from("questions").select("stem");
      if (exErr) throw exErr;
      const seen = new Set((existing || []).map((r) => norm(r.stem)));

      const qRows = [];
      let dupes = 0;
      for (const q of preview.questions) {
        const key = norm(q.stem);
        if (seen.has(key)) {
          dupes++;
          continue;
        }
        seen.add(key);
        qRows.push({
          subject_id: subjectId,
          lecture_id: lectureId || null,
          topic,
          difficulty: normDiff(q.difficulty),
          stem: q.stem.trim(),
          options: q.options.map((o) => o.trim()),
          correct_answer: Number(q.correct_answer),
          explanation: q.explanation.trim() || null,
          board_trap: q.board_trap.trim() || null,
          high_yield: q.high_yield.trim() || null,
          published: true,
        });
      }

      let insertedQ = 0;
      if (qRows.length) {
        const { error } = await supabase.from("questions").insert(qRows);
        if (error) throw error;
        insertedQ = qRows.length;
      }

      const cardRows = preview.flashcards
        .filter((c) => c.front.trim() && c.back.trim())
        .map((c) => ({ subject_id: subjectId, lecture_id: lectureId || null, front: c.front.trim(), back: c.back.trim() }));
      let insertedC = 0;
      if (cardRows.length) {
        const { error } = await supabase.from("flashcards").insert(cardRows);
        if (error) throw error;
        insertedC = cardRows.length;
      }

      setMsg({
        kind: "ok",
        text: `Published ${insertedQ} question${insertedQ === 1 ? "" : "s"} and ${insertedC} flashcard${insertedC === 1 ? "" : "s"}.` + (dupes ? ` Skipped ${dupes} duplicate question${dupes === 1 ? "" : "s"}.` : ""),
      });
      setPreview(null);
      setFile(null);
      data.current = {};
      setStatus(Object.fromEntries(STEPS.map((a) => [a.id, { state: "idle", error: "" }])));
    } catch (e) {
      setMsg({ kind: "error", text: e.message });
    } finally {
      setPublishing(false);
    }
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) setFile(f);
  };

  return (
    <div>
      {!apiKey && <Banner kind="error">VITE_ANTHROPIC_API_KEY is not set. Add it to your <code>.env</code> and restart the dev server before running the pipeline.</Banner>}
      {msg && <Banner kind={msg.kind}>{msg.text}</Banner>}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
        {/* Upload */}
        <div style={card}>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>1 · Lecture PDF</div>
          <div
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            style={{ border: `2px dashed ${dragOver ? colors.blue : colors.line}`, background: dragOver ? "rgba(79,142,247,0.06)" : "#F8FAFF", borderRadius: 14, padding: "34px 20px", textAlign: "center", cursor: "pointer", transition: "all 0.15s" }}
          >
            <input ref={fileRef} type="file" accept="application/pdf" hidden onChange={(e) => setFile(e.target.files?.[0] || null)} />
            <div style={{ fontSize: 30, marginBottom: 8 }}>{file ? "📄" : "⬆️"}</div>
            {file ? (
              <div style={{ fontSize: 14, fontWeight: 600, color: colors.text }}>{file.name}</div>
            ) : (
              <>
                <div style={{ fontSize: 14, fontWeight: 600, color: colors.text }}>Drag &amp; drop a lecture PDF</div>
                <div style={{ fontSize: 12, color: colors.textMuted, marginTop: 4 }}>or click to browse</div>
              </>
            )}
          </div>
          <PrimaryBtn style={{ marginTop: 18, width: "100%" }} disabled={running || !file} onClick={runAll}>
            {running ? "Running pipeline…" : "Run AI pipeline →"}
          </PrimaryBtn>
        </div>

        {/* Pipeline progress */}
        <div style={card}>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>2 · AI pipeline</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {STEPS.map((a) => {
              const st = status[a.id];
              return (
                <div key={a.id} style={{ padding: "11px 13px", borderRadius: 11, background: "#F8FAFF", border: `1.5px solid ${st.state === "running" ? colors.blue : st.state === "error" ? "#FECACA" : "transparent"}` }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <StatusDot status={st.state} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 700 }}>Step {a.n}: {a.label}</div>
                      <div style={{ fontSize: 11.5, color: colors.textMuted }}>{st.state === "running" ? a.running : a.desc}</div>
                    </div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: st.state === "done" ? colors.green : st.state === "error" ? colors.red : st.state === "running" ? colors.blue : colors.textMuted }}>
                      {st.state === "done" ? "Complete" : st.state === "error" ? "Failed" : st.state === "running" ? "Running" : "Idle"}
                    </div>
                  </div>
                  {st.state === "error" && (
                    <div style={{ marginTop: 8, paddingLeft: 30 }}>
                      <div style={{ fontSize: 12, color: colors.red, marginBottom: 8 }}>Step {a.n} failed: {st.error}</div>
                      <button onClick={() => retry(a.id)} disabled={running} style={{ border: `1.5px solid ${colors.blue}`, background: "#fff", color: colors.blue, borderRadius: 8, padding: "6px 14px", fontSize: 12, fontWeight: 700, cursor: running ? "not-allowed" : "pointer", fontFamily: font }}>
                        ↻ Retry Step {a.n}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Preview + publish */}
      {preview && (
        <div style={{ ...card, marginTop: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16, marginBottom: 18, flexWrap: "wrap" }}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>3 · Review &amp; publish — {preview.questions.length} question{preview.questions.length === 1 ? "" : "s"}, {preview.flashcards.length} flashcard{preview.flashcards.length === 1 ? "" : "s"}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <select
                value={subjectId}
                onChange={(e) => {
                  setSubjectId(e.target.value);
                  setLectureId("");
                }}
                style={{ ...input, width: 180 }}
              >
                {subjects.length === 0 && <option value="">No subjects — add one first</option>}
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
              <select value={lectureId} onChange={(e) => setLectureId(e.target.value)} style={{ ...input, width: 180 }} disabled={!subjectId}>
                <option value="">— No lecture —</option>
                {lectures.map((l) => (
                  <option key={l.id} value={l.id}>{l.title}</option>
                ))}
              </select>
              <PrimaryBtn disabled={publishing} onClick={publish}>{publishing ? "Publishing…" : "Publish to bank →"}</PrimaryBtn>
            </div>
          </div>

          <div style={{ fontSize: 13, color: colors.textSoft, marginBottom: 16 }}>
            Generated <b style={{ color: colors.navy }}>{preview.questions.length}</b> question{preview.questions.length === 1 ? "" : "s"} covering <b style={{ color: colors.navy }}>{preview.topicCount}</b> topic{preview.topicCount === 1 ? "" : "s"}.
          </div>

          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: colors.text, marginBottom: 6 }}>Topic (applied to all questions)</div>
            <input value={preview.topic} onChange={(e) => setPreview((p) => ({ ...p, topic: e.target.value }))} style={{ ...input, maxWidth: 420 }} />
          </div>

          {/* Questions */}
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {preview.questions.map((q, qi) => (
              <div key={qi} style={{ border: `1.5px solid ${colors.line}`, borderRadius: 12, padding: "16px 18px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: colors.navy }}>Question {qi + 1}</span>
                    <select value={q.difficulty} onChange={(e) => editQuestion(qi, { difficulty: e.target.value })} style={{ ...input, width: "auto", padding: "5px 8px", fontSize: 12, color: diffColor[q.difficulty] }}>
                      <option value="easy">easy</option>
                      <option value="medium">medium</option>
                      <option value="hard">hard</option>
                    </select>
                  </div>
                  <button onClick={() => removeQuestion(qi)} style={{ border: "1.5px solid #FECACA", background: "#fff", color: colors.red, borderRadius: 8, padding: "5px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: font }}>Remove</button>
                </div>

                <div style={{ fontSize: 12, fontWeight: 600, color: colors.textSoft, marginBottom: 4 }}>Stem</div>
                <textarea value={q.stem} onChange={(e) => editQuestion(qi, { stem: e.target.value })} rows={3} style={{ ...input, resize: "vertical", marginBottom: 10 }} />

                <div style={{ fontSize: 12, fontWeight: 600, color: colors.textSoft, marginBottom: 4 }}>Options (select the correct one)</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 10 }}>
                  {q.options.map((opt, oi) => (
                    <label key={oi} style={{ display: "flex", alignItems: "center", gap: 9 }}>
                      <input type="radio" name={`correct-${qi}`} checked={Number(q.correct_answer) === oi} onChange={() => editQuestion(qi, { correct_answer: oi })} style={{ accentColor: colors.green }} />
                      <span style={{ fontSize: 12, fontWeight: 700, color: colors.textMuted, width: 14 }}>{String.fromCharCode(65 + oi)}</span>
                      <input value={opt} onChange={(e) => editOption(qi, oi, e.target.value)} style={input} />
                    </label>
                  ))}
                </div>

                <div style={{ fontSize: 12, fontWeight: 600, color: colors.textSoft, marginBottom: 4 }}>Explanation</div>
                <textarea value={q.explanation} onChange={(e) => editQuestion(qi, { explanation: e.target.value })} rows={3} style={{ ...input, resize: "vertical", marginBottom: 10 }} />

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: colors.tealDeep, marginBottom: 4 }}>High-Yield</div>
                    <textarea value={q.high_yield} onChange={(e) => editQuestion(qi, { high_yield: e.target.value })} rows={2} style={{ ...input, resize: "vertical" }} />
                  </div>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "#92400E", marginBottom: 4 }}>Board Trap (optional)</div>
                    <textarea value={q.board_trap} onChange={(e) => editQuestion(qi, { board_trap: e.target.value })} rows={2} style={{ ...input, resize: "vertical" }} />
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Flashcards */}
          {preview.flashcards.length > 0 && (
            <>
              <div style={{ fontSize: 15, fontWeight: 700, margin: "24px 0 12px" }}>Flashcards ({preview.flashcards.length})</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                {preview.flashcards.map((c, ci) => (
                  <div key={ci} style={{ border: `1.5px solid ${colors.line}`, borderRadius: 12, padding: "14px 16px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, color: colors.navy }}>Card {ci + 1}</span>
                      <button onClick={() => removeCard(ci)} style={{ border: "1.5px solid #FECACA", background: "#fff", color: colors.red, borderRadius: 7, padding: "4px 10px", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: font }}>Remove</button>
                    </div>
                    <input value={c.front} onChange={(e) => editCard(ci, { front: e.target.value })} placeholder="Front" style={{ ...input, marginBottom: 8, fontWeight: 600 }} />
                    <textarea value={c.back} onChange={(e) => editCard(ci, { back: e.target.value })} placeholder="Back" rows={2} style={{ ...input, resize: "vertical" }} />
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

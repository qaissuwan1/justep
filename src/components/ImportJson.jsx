import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { colors, gradients, font } from "../theme";

/* ------------------------------------------------------------------ */
/*  Import JSON — paste questions + flashcards JSON and publish        */
/*  Free workflow: generate JSON in Claude.ai, paste here, publish.   */
/* ------------------------------------------------------------------ */

const DIFFICULTIES = ["easy", "medium", "hard"];

export default function ImportJson() {
  const [subjects, setSubjects] = useState([]);
  const [subjectId, setSubjectId] = useState("");
  const [raw, setRaw] = useState("");
  const [parsed, setParsed] = useState(null); // { questions:[], flashcards:[] }
  const [errors, setErrors] = useState([]);
  const [warnings, setWarnings] = useState([]);
  const [publishing, setPublishing] = useState(false);
  const [result, setResult] = useState(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("subjects").select("id,name").order("name");
      setSubjects(data || []);
    })();
  }, []);

  /* ---------------- parse + validate ---------------- */
  function handleValidate() {
    setResult(null);
    setParsed(null);
    setErrors([]);
    setWarnings([]);

    const errs = [];
    const warns = [];

    if (!subjectId) errs.push("Select a subject before importing.");

    let json;
    try {
      // strip code fences if pasted with them
      let t = raw.trim();
      t = t.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
      json = JSON.parse(t);
    } catch (e) {
      errs.push("Invalid JSON — could not parse. Check for missing commas or brackets. (" + e.message + ")");
      setErrors(errs);
      return;
    }

    // Accept either { questions, flashcards } or a bare array of questions
    let questions;
    let flashcards = [];
    if (Array.isArray(json)) {
      questions = json;
    } else {
      questions = json.questions || [];
      flashcards = json.flashcards || [];
    }

    // validate questions
    const validQuestions = [];
    questions.forEach((q, i) => {
      const where = `Question ${i + 1}`;
      if (!q || typeof q !== "object") {
        warns.push(`${where}: skipped (not an object).`);
        return;
      }
      if (!q.stem || typeof q.stem !== "string" || !q.stem.trim()) {
        warns.push(`${where}: skipped (missing stem).`);
        return;
      }
      if (!Array.isArray(q.options) || q.options.length !== 5 || q.options.some((o) => !o || !String(o).trim())) {
        warns.push(`${where}: skipped (needs exactly 5 non-empty options).`);
        return;
      }
      const ca = Number(q.correct_answer);
      if (!Number.isInteger(ca) || ca < 0 || ca > 4) {
        warns.push(`${where}: skipped (correct_answer must be 0-4).`);
        return;
      }
      let diff = (q.difficulty || "medium").toLowerCase();
      if (!DIFFICULTIES.includes(diff)) diff = "medium";
      validQuestions.push({
        topic: q.topic ? String(q.topic) : null,
        difficulty: diff,
        stem: String(q.stem).trim(),
        options: q.options.map((o) => String(o)),
        correct_answer: ca,
        explanation: q.explanation ? String(q.explanation) : null,
        high_yield: q.high_yield ? String(q.high_yield) : null,
        board_trap: q.board_trap ? String(q.board_trap) : null,
      });
    });

    // validate flashcards
    const validFlashcards = [];
    flashcards.forEach((f, i) => {
      const where = `Flashcard ${i + 1}`;
      if (!f || typeof f !== "object") {
        warns.push(`${where}: skipped (not an object).`);
        return;
      }
      if (!f.front || !String(f.front).trim() || !f.back || !String(f.back).trim()) {
        warns.push(`${where}: skipped (needs front and back).`);
        return;
      }
      validFlashcards.push({ front: String(f.front).trim(), back: String(f.back).trim() });
    });

    if (validQuestions.length === 0 && validFlashcards.length === 0) {
      errs.push("No valid questions or flashcards found in the JSON.");
    }

    if (errs.length) {
      setErrors(errs);
      return;
    }

    setWarnings(warns);
    setParsed({ questions: validQuestions, flashcards: validFlashcards });
  }

  /* ---------------- publish ---------------- */
  async function handlePublish() {
    if (!parsed || !subjectId) return;
    setPublishing(true);
    setResult(null);

    try {
      let qInserted = 0;
      let qSkipped = 0;
      let fInserted = 0;

      // dedup questions by stem within this subject
      if (parsed.questions.length) {
        const { data: existing } = await supabase
          .from("questions")
          .select("stem")
          .eq("subject_id", subjectId);
        const existingStems = new Set((existing || []).map((e) => e.stem.trim().toLowerCase()));

        const toInsert = [];
        parsed.questions.forEach((q) => {
          if (existingStems.has(q.stem.trim().toLowerCase())) {
            qSkipped++;
          } else {
            toInsert.push({
              subject_id: subjectId,
              topic: q.topic,
              difficulty: q.difficulty,
              stem: q.stem,
              options: q.options,
              correct_answer: q.correct_answer,
              explanation: q.explanation,
              high_yield: q.high_yield,
              board_trap: q.board_trap,
              published: true,
            });
          }
        });

        if (toInsert.length) {
          const { error } = await supabase.from("questions").insert(toInsert);
          if (error) throw new Error("Questions insert failed: " + error.message);
          qInserted = toInsert.length;
        }
      }

      // insert flashcards
      if (parsed.flashcards.length) {
        const fRows = parsed.flashcards.map((f) => ({
          subject_id: subjectId,
          front: f.front,
          back: f.back,
        }));
        const { error } = await supabase.from("flashcards").insert(fRows);
        if (error) throw new Error("Flashcards insert failed: " + error.message);
        fInserted = fRows.length;
      }

      setResult({
        ok: true,
        message: `Published ${qInserted} question${qInserted === 1 ? "" : "s"}${
          qSkipped ? ` (${qSkipped} duplicate${qSkipped === 1 ? "" : "s"} skipped)` : ""
        } and ${fInserted} flashcard${fInserted === 1 ? "" : "s"}.`,
      });
      setParsed(null);
      setRaw("");
    } catch (e) {
      setResult({ ok: false, message: e.message });
    } finally {
      setPublishing(false);
    }
  }

  return (
    <div style={{ fontFamily: font, color: colors.text }}>
      <h1 style={{ fontSize: 24, margin: "0 0 4px" }}>Import JSON</h1>
      <p style={{ color: colors.textSoft, margin: "0 0 24px", fontSize: 14 }}>
        Paste questions and flashcards JSON (generated in Claude) and publish them straight to the bank — no API cost.
      </p>

      {/* subject */}
      <div style={card}>
        <label style={label}>1 · Subject</label>
        <select value={subjectId} onChange={(e) => setSubjectId(e.target.value)} style={select}>
          <option value="">— Select subject —</option>
          {subjects.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      {/* paste */}
      <div style={card}>
        <label style={label}>2 · Paste JSON</label>
        <textarea
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          placeholder='{ "questions": [ { "stem": "...", "options": ["A","B","C","D","E"], "correct_answer": 0, "explanation": "...", "high_yield": "...", "difficulty": "medium", "topic": "..." } ], "flashcards": [ { "front": "...", "back": "..." } ] }'
          style={textarea}
          spellCheck={false}
        />
        <button onClick={handleValidate} style={ghostBtn} disabled={!raw.trim()}>
          Validate & preview
        </button>
      </div>

      {/* errors */}
      {errors.length > 0 && (
        <div style={{ ...card, borderLeft: `4px solid ${colors.red}` }}>
          <strong style={{ color: colors.red }}>Cannot import:</strong>
          <ul style={{ margin: "8px 0 0", paddingLeft: 20, color: colors.red, fontSize: 14 }}>
            {errors.map((e, i) => (
              <li key={i} style={{ marginBottom: 4 }}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      {/* preview */}
      {parsed && (
        <div style={card}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <label style={{ ...label, margin: 0 }}>3 · Preview</label>
            <span style={{ fontSize: 14, color: colors.textSoft }}>
              {parsed.questions.length} questions · {parsed.flashcards.length} flashcards
            </span>
          </div>

          {warnings.length > 0 && (
            <div style={{ background: "#FFFBEB", border: `1px solid ${colors.amber}`, borderRadius: 10, padding: 12, marginBottom: 16 }}>
              <strong style={{ color: "#92400E", fontSize: 13 }}>
                {warnings.length} item{warnings.length === 1 ? "" : "s"} skipped:
              </strong>
              <ul style={{ margin: "6px 0 0", paddingLeft: 20, color: "#92400E", fontSize: 12 }}>
                {warnings.slice(0, 8).map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
                {warnings.length > 8 && <li>…and {warnings.length - 8} more</li>}
              </ul>
            </div>
          )}

          {/* question previews */}
          {parsed.questions.slice(0, 3).map((q, i) => (
            <div key={i} style={previewItem}>
              <div style={{ display: "flex", gap: 8, marginBottom: 6 }}>
                <span style={pill}>{q.difficulty}</span>
                {q.topic && <span style={{ ...pill, background: colors.line, color: colors.textSoft }}>{q.topic}</span>}
              </div>
              <div style={{ fontWeight: 600, marginBottom: 8 }}>{q.stem}</div>
              {q.options.map((o, j) => (
                <div
                  key={j}
                  style={{
                    fontSize: 13,
                    padding: "3px 0",
                    color: j === q.correct_answer ? colors.green : colors.textSoft,
                    fontWeight: j === q.correct_answer ? 700 : 400,
                  }}
                >
                  {String.fromCharCode(65 + j)}. {o} {j === q.correct_answer ? "✓" : ""}
                </div>
              ))}
            </div>
          ))}
          {parsed.questions.length > 3 && (
            <p style={{ color: colors.textSoft, fontSize: 13, textAlign: "center", margin: "8px 0" }}>
              …and {parsed.questions.length - 3} more questions
            </p>
          )}

          <button onClick={handlePublish} style={primaryBtn} disabled={publishing}>
            {publishing ? "Publishing…" : `Publish ${parsed.questions.length} questions + ${parsed.flashcards.length} flashcards`}
          </button>
        </div>
      )}

      {/* result */}
      {result && (
        <div
          style={{
            ...card,
            borderLeft: `4px solid ${result.ok ? colors.green : colors.red}`,
          }}
        >
          <strong style={{ color: result.ok ? colors.green : colors.red }}>
            {result.ok ? "Success" : "Failed"}
          </strong>
          <p style={{ margin: "6px 0 0", fontSize: 14 }}>{result.message}</p>
        </div>
      )}
    </div>
  );
}

/* ---------------- styles ---------------- */
const card = {
  background: colors.card,
  borderRadius: 14,
  padding: "18px 20px",
  marginBottom: 16,
  boxShadow: "0 1px 6px rgba(0,0,0,0.05)",
};
const label = {
  display: "block",
  fontSize: 13,
  fontWeight: 700,
  color: colors.text,
  marginBottom: 10,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
};
const select = {
  width: "100%",
  padding: "11px 12px",
  fontSize: 15,
  border: `1px solid ${colors.line}`,
  borderRadius: 10,
  fontFamily: font,
  background: "#fff",
  color: colors.text,
};
const textarea = {
  width: "100%",
  minHeight: 220,
  padding: "12px 14px",
  fontSize: 13,
  fontFamily: "monospace",
  border: `1px solid ${colors.line}`,
  borderRadius: 10,
  resize: "vertical",
  marginBottom: 12,
  boxSizing: "border-box",
  lineHeight: 1.5,
};
const primaryBtn = {
  background: gradients.accent,
  color: "#fff",
  border: "none",
  borderRadius: 10,
  padding: "13px 24px",
  fontSize: 15,
  fontWeight: 700,
  cursor: "pointer",
  fontFamily: font,
  marginTop: 8,
  width: "100%",
};
const ghostBtn = {
  background: "#fff",
  color: colors.navy,
  border: `1.5px solid ${colors.line}`,
  borderRadius: 10,
  padding: "11px 22px",
  fontSize: 14,
  fontWeight: 700,
  cursor: "pointer",
  fontFamily: font,
};
const previewItem = {
  border: `1px solid ${colors.line}`,
  borderRadius: 10,
  padding: 14,
  marginBottom: 10,
};
const pill = {
  fontSize: 11,
  fontWeight: 600,
  padding: "3px 10px",
  borderRadius: 99,
  background: colors.blue,
  color: "#fff",
  textTransform: "capitalize",
};

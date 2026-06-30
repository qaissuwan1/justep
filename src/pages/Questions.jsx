import { useState, useEffect, useRef, useCallback } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import useIsMobile from "../lib/useIsMobile";
import SessionBar, { SESSION_BAR_H } from "../components/SessionBar";
import { goToNextTask } from "../lib/session";

/* ------------------------------------------------------------------ */
/*  JUStep — UWorld-style Question Bank                                */
/*  Phases: setup → running → summary                                 */
/*  5 options (A–E), strike-through, highlight, flag, tutor/timed     */
/* ------------------------------------------------------------------ */

const NAVY = "#0F172A";
const NAVY_2 = "#1E293B";
const BLUE = "#2563EB";
const BLUE_SOFT = "#EFF4FF";
const GREEN = "#16A34A";
const GREEN_SOFT = "#ECFDF3";
const RED = "#DC2626";
const RED_SOFT = "#FEF2F2";
const AMBER = "#F59E0B";
const AMBER_SOFT = "#FFFBEB";
const TEAL = "#0D9488";
const TEAL_SOFT = "#F0FDFA";
const BORDER = "#E2E8F0";
const TEXT = "#0F172A";
const MUTED = "#64748B";
const HEAD = "#1a2b4a"; // section-header navy
const PILL_BORDER = "#BFD7F5"; // count-pill light-blue border

const LETTERS = ["A", "B", "C", "D", "E"];
const SECONDS_PER_Q = 90;

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function fmtTime(s) {
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${String(sec).padStart(2, "0")}`;
}

const shortId = (id) => String(id || "").replace(/-/g, "").slice(0, 8).toUpperCase();
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

export default function Questions() {
  const isMobile = useIsMobile();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const incorrectMode = searchParams.get("mode") === "incorrect";
  const sessionMode = searchParams.get("session") === "1";
  const [phase, setPhase] = useState("setup"); // setup | running | summary

  /* -------- shared data -------- */
  const [systems, setSystems] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [lectures, setLectures] = useState([]);
  const [userQ, setUserQ] = useState([]); // [{ id, subject_id, lecture_id, system_id, status }]
  const [marks, setMarks] = useState(new Set()); // persistent marked question ids
  const [loadingMeta, setLoadingMeta] = useState(true);

  /* -------- setup selections -------- */
  const [pickedSystems, setPickedSystems] = useState([]);
  const [pickedSubjects, setPickedSubjects] = useState([]);
  const [pickedLectures, setPickedLectures] = useState([]);
  const [status, setStatus] = useState(() =>
    incorrectMode
      ? { unused: false, incorrect: true, correct: false, marked: false, omitted: false }
      : { unused: true, incorrect: false, correct: false, marked: false, omitted: false }
  );
  const [numQuestions, setNumQuestions] = useState("40"); // raw string; clamped on blur/generate
  const [mode, setMode] = useState("tutor"); // tutor | timed
  const [starting, setStarting] = useState(false);
  const [setupError, setSetupError] = useState("");
  const [noIncorrect, setNoIncorrect] = useState(false); // incorrect-mode deep-link: empty pool
  const [bannerDismissed, setBannerDismissed] = useState(false);

  /* -------- running state -------- */
  const [questions, setQuestions] = useState([]);
  const [idx, setIdx] = useState(0);
  const [selected, setSelected] = useState({}); // qid -> option index
  const [submitted, setSubmitted] = useState({}); // qid -> true
  const [struck, setStruck] = useState({}); // qid -> Set(option idx)
  const [flagged, setFlagged] = useState({}); // qid -> true
  const [highlights, setHighlights] = useState({}); // qid -> [{start,end}]
  const [timeSpent, setTimeSpent] = useState({}); // qid -> accumulated dwell seconds (timer effect)
  const [answerSecs, setAnswerSecs] = useState({}); // qid -> time-to-answer, frozen at submit (matches DB)
  const [fontSize, setFontSize] = useState(16);
  const [reviewMode, setReviewMode] = useState(false); // from results
  const [splitVertical, setSplitVertical] = useState(false);
  const [testId, setTestId] = useState("");
  const [poolLabel, setPoolLabel] = useState("Custom");

  /* -------- timer -------- */
  const [timeLeft, setTimeLeft] = useState(0);
  const timerRef = useRef(null);
  const omittedDoneRef = useRef(false); // guards one omitted-record per block
  // Live snapshot so finishBlock()/recordOmitted() — which can fire from a stale
  // timer closure in timed mode — always see the latest answers, not block-start.
  const liveRef = useRef({ questions: [], selected: {}, submitted: {}, reviewMode: false, userQ: [] });
  const finishRef = useRef(null); // always points at the latest finishBlock
  const qStartRef = useRef(0); // timestamp the current question was shown (for time_spent)
  const persistedRef = useRef(new Set()); // qids already written to user_progress this block
  const autoStartedRef = useRef(false); // guards the incorrect-mode auto-start to once
  const [elapsed, setElapsed] = useState(0);

  /* ---------------- load meta + progress + marks ----------------
     Re-runs whenever the config screen is shown (phase === "setup"), so that
     answers/flags made during a block are reflected in the status counts when
     the user returns here. The component stays mounted across phases, so a
     once-on-mount load would otherwise go stale. */
  useEffect(() => {
    if (phase !== "setup") return;
    let cancelled = false;
    (async () => {
      setLoadingMeta(true);
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const [{ data: sys }, { data: subj }, { data: lecs }, { data: qrows }, prog, mk] = await Promise.all([
        supabase.from("systems").select("id,name").order("name"),
        supabase.from("subjects").select("id,name,system_id").order("name"),
        supabase.from("lectures").select("id,title,subject_id,order_index").order("order_index"),
        supabase.from("questions").select("id,subject_id,lecture_id").eq("published", true).is("deleted_at", null),
        user
          ? supabase.from("user_progress").select("question_id,is_correct,answered_at").eq("user_id", user.id)
          : Promise.resolve({ data: [] }),
        user ? supabase.from("question_marks").select("question_id").eq("user_id", user.id) : Promise.resolve({ data: [] }),
      ]);

      const subjList = subj || [];
      const sysOf = {};
      subjList.forEach((s) => (sysOf[s.id] = s.system_id || null));

      // latest attempt per question decides Unused / Correct / Incorrect
      const latest = {};
      (prog.data || []).forEach((p) => {
        const prev = latest[p.question_id];
        if (!prev || new Date(p.answered_at) > new Date(prev.answered_at)) latest[p.question_id] = p;
      });

      const uq = (qrows || []).map((q) => {
        const l = latest[q.id];
        let st;
        if (!l) st = "unused";
        else if (l.is_correct === true) st = "correct";
        else if (l.is_correct === false) st = "incorrect";
        else st = "omitted"; // is_correct === null → presented but left unanswered
        return { id: q.id, subject_id: q.subject_id, lecture_id: q.lecture_id || null, system_id: sysOf[q.subject_id] || null, status: st };
      });

      if (cancelled) return;
      setSystems(sys || []);
      setSubjects(subjList);
      setLectures(lecs || []);
      setUserQ(uq);
      setMarks(new Set((mk.data || []).map((m) => m.question_id)));
      setLoadingMeta(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [phase]);

  /* ---------------- deep-link: auto-start "incorrect" review ----------------
     When arriving via /app/questions?mode=incorrect, the status filter is
     already incorrect-only (see status init). Once the setup load resolves,
     build the incorrect pool across all content and jump straight into a block.
     Empty pool → stay on setup with a friendly message. Runs once. */
  useEffect(() => {
    if (!incorrectMode || autoStartedRef.current) return;
    if (phase !== "setup" || loadingMeta) return;
    autoStartedRef.current = true;
    const pool = userQ.filter((q) => q.status === "incorrect").map((q) => q.id);
    // setState lives inside a callback (not the effect body) so we don't trigger
    // a synchronous cascading render.
    (async () => {
      if (!pool.length) {
        setNoIncorrect(true);
        return;
      }
      startBlock(pool, numQuestions);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incorrectMode, phase, loadingMeta, userQ]);

  /* ---------------- timer tick (timed) ---------------- */
  useEffect(() => {
    if (phase !== "running" || mode !== "timed" || reviewMode) return;
    timerRef.current = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          clearInterval(timerRef.current);
          finishRef.current?.();
          return 0;
        }
        return t - 1;
      });
      setElapsed((e) => e + 1);
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [phase, mode, reviewMode]);

  /* ---------------- elapsed for tutor ---------------- */
  useEffect(() => {
    if (phase !== "running" || mode !== "tutor" || reviewMode) return;
    const t = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
  }, [phase, mode, reviewMode]);

  /* ---------------- per-question time tracking ---------------- */
  const current = questions[idx];
  const currentId = current?.id;
  useEffect(() => {
    if (phase !== "running" || reviewMode || !currentId) return;
    const start = Date.now();
    qStartRef.current = start;
    return () => {
      const secs = Math.round((Date.now() - start) / 1000);
      if (secs > 0) setTimeSpent((ts) => ({ ...ts, [currentId]: (ts[currentId] || 0) + secs }));
    };
  }, [currentId, phase, reviewMode]);

  // Keep the live snapshot current after every render.
  useEffect(() => {
    liveRef.current = { questions, selected, submitted, reviewMode, userQ };
  });

  /* ---------------- generate block ---------------- */
  async function startBlock(ids, n) {
    setSetupError("");
    if (!ids.length) {
      setSetupError("No questions match your filters.");
      return;
    }
    const parsed = parseInt(n, 10);
    const take = Math.min(Math.max(1, Number.isNaN(parsed) ? 1 : parsed), ids.length);
    setStarting(true);
    const chosenIds = shuffle(ids).slice(0, take);
    const { data, error } = await supabase.from("questions").select("*").in("id", chosenIds).is("deleted_at", null);
    setStarting(false);
    if (error || !data || data.length === 0) {
      setSetupError("Could not load questions. Try again.");
      return;
    }
    const chosen = shuffle(data);
    const flags = {};
    chosen.forEach((q) => {
      if (marks.has(q.id)) flags[q.id] = true;
    });
    const active = Object.entries(status).filter(([, v]) => v).map(([k]) => cap(k));
    setPoolLabel(active.length === 1 ? active[0] : active.length ? "Custom" : "Custom");
    setTestId((typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : String(Math.random())).slice(0, 8));
    setQuestions(chosen);
    setIdx(0);
    setSelected({});
    setSubmitted({});
    setStruck({});
    setFlagged(flags);
    setHighlights({});
    setTimeSpent({});
    setAnswerSecs({});
    persistedRef.current = new Set();
    setElapsed(0);
    setReviewMode(false);
    omittedDoneRef.current = false;
    if (mode === "timed") setTimeLeft(chosen.length * SECONDS_PER_Q);
    setPhase("running");
  }

  /* ---------------- answering ---------------- */
  const qid = current?.id;
  const answered = qid != null && submitted[qid];
  const reveal = reviewMode || (mode === "tutor" && answered);

  const selectOption = (id, optIdx) => {
    if (submitted[id] || reviewMode) return;
    setSelected((s) => ({ ...s, [id]: optIdx }));
  };

  const toggleStrike = (id, optIdx) => {
    if (submitted[id] || reviewMode) return;
    setStruck((s) => {
      const set = new Set(s[id] || []);
      set.has(optIdx) ? set.delete(optIdx) : set.add(optIdx);
      return { ...s, [id]: set };
    });
  };

  // Seconds on a question so far = accumulated (prior visits) + the current
  // uninterrupted view (the timer effect only flushes accumulated time on leave).
  const answerTime = (id) => {
    const base = timeSpent[id] || 0;
    const live = qStartRef.current ? Math.max(0, Math.round((Date.now() - qStartRef.current) / 1000)) : 0;
    return base + live;
  };

  // Single write for an attempt: { is_correct, selected_answer, time_spent_seconds,
  // confidence }. Guarded by persistedRef so each question is written at most once
  // per block. confidence is always null for now — it's inferred later from
  // time_spent (fast+correct = confident, slow = hesitant, fast+wrong = misconception).
  async function persistAttempt(q) {
    if (!q || persistedRef.current.has(q.id)) return;
    persistedRef.current.add(q.id);
    const t = answerTime(q.id); // time-to-answer, computed once and frozen at submit
    setAnswerSecs((a) => ({ ...a, [q.id]: t })); // same value the UI displays
    const row = {
      question_id: q.id,
      is_correct: selected[q.id] === q.correct_answer,
      selected_answer: selected[q.id] ?? null,
      time_spent_seconds: t,
      confidence: null,
    };
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) await supabase.from("user_progress").insert({ user_id: user.id, ...row });
  }

  async function submitAnswer() {
    const q = current;
    if (q == null || selected[q.id] == null || submitted[q.id]) return;
    setSubmitted((s) => ({ ...s, [q.id]: true }));
    await persistAttempt(q); // both modes; tutor reveals immediately
  }

  // Safety net: if a submitted question is somehow left unwritten, persist it on
  // navigation. persistedRef makes this a no-op once it's already been written.
  function flushCurrent() {
    if (reviewMode) return;
    const q = current;
    if (q && submitted[q.id] && !persistedRef.current.has(q.id)) persistAttempt(q);
  }

  // Flag/Mark — persists to question_marks so the "Marked" filter is real.
  async function toggleFlag(id) {
    const next = !flagged[id];
    setFlagged((f) => ({ ...f, [id]: next }));
    setMarks((m) => {
      const n = new Set(m);
      next ? n.add(id) : n.delete(id);
      return n;
    });
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    if (next) await supabase.from("question_marks").upsert({ user_id: user.id, question_id: id });
    else await supabase.from("question_marks").delete().eq("user_id", user.id).eq("question_id", id);
  }

  /* ---------------- highlight (session only) ---------------- */
  const stemRef = useRef(null);

  const onStemMouseUp = useCallback(() => {
    if (!current) return;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !stemRef.current) return;
    const range = sel.getRangeAt(0);
    if (!stemRef.current.contains(range.commonAncestorContainer)) return;

    const pre = range.cloneRange();
    pre.selectNodeContents(stemRef.current);
    pre.setEnd(range.startContainer, range.startOffset);
    const start = pre.toString().length;
    const end = start + sel.toString().length;
    if (end <= start) return;

    setHighlights((h) => {
      const list = [...(h[current.id] || []), { start, end }];
      return { ...h, [current.id]: mergeRanges(list) };
    });
    sel.removeAllRanges();
  }, [current]);

  const clearHighlights = () => {
    if (!current) return;
    setHighlights((h) => ({ ...h, [current.id]: [] }));
  };

  /* ---------------- navigation ---------------- */
  const goNext = () => { if (idx < questions.length - 1) { flushCurrent(); setIdx(idx + 1); } };
  const goPrev = () => { if (idx > 0) { flushCurrent(); setIdx(idx - 1); } };
  const jumpTo = (i) => { if (i >= 0 && i < questions.length && i !== idx) { flushCurrent(); setIdx(i); } };

  // Record questions that were presented but left unanswered as omitted
  // (user_progress row with is_correct = null). One pass per block.
  async function recordOmitted() {
    const live = liveRef.current;
    if (live.reviewMode || omittedDoneRef.current) return;
    omittedDoneRef.current = true;
    // Dedupe: skip questions whose latest attempt is already null (status
    // "omitted") so repeated skipping doesn't pile up duplicate null rows.
    const alreadyOmitted = new Set((live.userQ || []).filter((q) => q.status === "omitted").map((q) => q.id));
    const omittedIds = live.questions
      .filter((q) => live.selected[q.id] == null && !live.submitted[q.id] && !alreadyOmitted.has(q.id))
      .map((q) => q.id);
    if (!omittedIds.length) return;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    await supabase
      .from("user_progress")
      .insert(omittedIds.map((qid) => ({ user_id: user.id, question_id: qid, is_correct: null })));
  }

  function finishBlock() {
    clearInterval(timerRef.current);
    flushCurrent(); // persist a submitted-but-unrated current question
    recordOmitted();
    setReviewMode(false);
    setPhase("summary");
  }
  // Keep finishRef pointing at the current finishBlock for the timed-mode timer.
  useEffect(() => {
    finishRef.current = finishBlock;
  });

  function openReview(i) {
    setIdx(i);
    setReviewMode(true);
    setPhase("running");
  }

  function newBlock() {
    setPhase("setup");
    setReviewMode(false);
  }

  /* ============================================================ */
  /*  RENDER                                                      */
  /* ============================================================ */

  if (phase === "setup")
    return (
      <>
        {sessionMode && <SessionBar />}
        <div style={{ paddingTop: sessionMode ? SESSION_BAR_H : 0 }}>
      <Setup
        loadingMeta={loadingMeta}
        noIncorrect={noIncorrect}
        systems={systems}
        subjects={subjects}
        lectures={lectures}
        userQ={userQ}
        marks={marks}
        pickedSystems={pickedSystems}
        setPickedSystems={setPickedSystems}
        pickedSubjects={pickedSubjects}
        setPickedSubjects={setPickedSubjects}
        pickedLectures={pickedLectures}
        setPickedLectures={setPickedLectures}
        status={status}
        setStatus={setStatus}
        numQuestions={numQuestions}
        setNumQuestions={setNumQuestions}
        mode={mode}
        setMode={setMode}
        startBlock={startBlock}
        starting={starting}
        setupError={setupError}
      />
        </div>
      </>
    );

  if (phase === "summary")
    return (
      <>
        {sessionMode && <SessionBar />}
        <div style={{ paddingTop: sessionMode ? SESSION_BAR_H : 0 }}>
      <Results
        questions={questions}
        selected={selected}
        flagged={flagged}
        answerSecs={answerSecs}
        elapsed={elapsed}
        mode={mode}
        poolLabel={poolLabel}
        testId={testId}
        subjects={subjects}
        systems={systems}
        openReview={openReview}
        newBlock={newBlock}
        sessionMode={sessionMode}
        onNextTask={() => goToNextTask(navigate)}
      />
        </div>
      </>
    );

  /* -------- running / review (full-screen overlay) -------- */
  if (!current) return null;
  const sel = selected[qid];
  const struckSet = struck[qid] || new Set();
  const atFirst = idx === 0;
  const atLast = idx >= questions.length - 1;
  const isCorrect = sel === current.correct_answer;

  return (
    <>
      {sessionMode && <SessionBar />}
      <div style={{ position: "fixed", top: sessionMode ? SESSION_BAR_H : 0, left: 0, right: 0, bottom: 0, zIndex: 1000, background: "#F8FAFC", display: "flex", flexDirection: "column", color: TEXT }}>
      {/* TOP BAR */}
      <div style={{ background: NAVY, color: "#fff", padding: "8px 16px", display: "flex", alignItems: "center", gap: isMobile ? 8 : 16, flexShrink: 0, flexWrap: isMobile ? "wrap" : "nowrap" }}>
        <div style={{ background: NAVY_2, borderRadius: 8, padding: "6px 12px", fontWeight: 700, fontSize: 14 }}>
          Item: {idx + 1} of {questions.length}
        </div>
        {!isMobile && <span style={{ fontSize: 12, color: "#94A3B8" }}>Question Id: {shortId(qid)}</span>}

        {!isMobile && <div style={{ flex: 1 }} />}

        <button onClick={goPrev} disabled={atFirst} style={navBtn(atFirst)}>← Previous</button>
        <span style={{ fontVariantNumeric: "tabular-nums", minWidth: 56, textAlign: "center" }}>{idx + 1} / {questions.length}</span>
        <button onClick={goNext} disabled={atLast} style={navBtn(atLast)}>Next →</button>

        <div style={{ flex: 1 }} />

        {mode === "timed" && !reviewMode ? (
          <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 700, color: timeLeft < 60 ? "#FCA5A5" : "#fff" }}>⏱ {fmtTime(timeLeft)}</span>
        ) : (
          <span style={{ fontSize: 12, color: "#94A3B8", fontVariantNumeric: "tabular-nums" }}>⏱ {fmtTime(elapsed)}</span>
        )}
      </div>

      {/* DEEP-LINK BANNER (incorrect review) — dismissable */}
      {incorrectMode && !reviewMode && !bannerDismissed && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, background: AMBER_SOFT, borderBottom: `1px solid ${BORDER}`, color: "#92400E", padding: "8px 16px", fontSize: 13, flexShrink: 0 }}>
          <span style={{ flex: 1 }}>Reviewing questions you previously missed</span>
          <button onClick={() => setBannerDismissed(true)} aria-label="Dismiss" style={{ background: "transparent", border: "none", color: "#92400E", cursor: "pointer", fontSize: 18, lineHeight: 1, padding: 0 }}>×</button>
        </div>
      )}

      {/* MIDDLE — rail + panes */}
      <div style={{ flex: 1, display: "flex", flexDirection: isMobile ? "column" : "row", minHeight: 0 }}>
        <QuestionRail questions={questions} idx={idx} selected={selected} submitted={submitted} flagged={flagged} reviewMode={reviewMode} onJump={jumpTo} horizontal={isMobile} />

        <div
          style={{
            flex: 1,
            minWidth: 0,
            display: "flex",
            flexDirection: isMobile || splitVertical ? "column" : "row",
            overflowY: isMobile ? "auto" : "visible",
          }}
        >
          {/* MAIN PANE */}
          <div style={{ flex: 1, minWidth: 0, overflowY: isMobile ? "visible" : "auto", padding: isMobile ? 16 : 24 }}>
            <div style={{ maxWidth: 760, margin: "0 auto" }}>
              {/* Mark Question + font size */}
              <div style={{ display: "flex", alignItems: "center", marginBottom: 18 }}>
                <button
                  onClick={() => toggleFlag(qid)}
                  style={{ display: "flex", alignItems: "center", gap: 8, background: "transparent", border: "none", cursor: "pointer", color: flagged[qid] ? AMBER : MUTED, fontWeight: 600, fontSize: 13, padding: 0 }}
                >
                  <span style={{ width: 16, height: 16, borderRadius: 3, border: `1.5px solid ${flagged[qid] ? AMBER : "#CBD5E1"}`, background: flagged[qid] ? AMBER : "#fff", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800 }}>
                    {flagged[qid] ? "✓" : ""}
                  </span>
                  ⚑ Mark Question
                </button>
                <div style={{ flex: 1 }} />
                <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                  <IconBtn onClick={() => setFontSize((f) => Math.max(14, f - 1))}>A−</IconBtn>
                  <span style={{ fontSize: 12, width: 34, textAlign: "center", color: MUTED }}>{fontSize}px</span>
                  <IconBtn onClick={() => setFontSize((f) => Math.min(22, f + 1))}>A+</IconBtn>
                </div>
              </div>

              {/* stem */}
              <div ref={stemRef} onMouseUp={onStemMouseUp} style={{ fontSize, lineHeight: 1.7, whiteSpace: "pre-wrap", userSelect: "text" }}>
                {renderHighlighted(current.stem, highlights[qid] || [])}
              </div>
              {(highlights[qid]?.length ?? 0) > 0 && !reviewMode && (
                <button onClick={clearHighlights} style={{ marginTop: 8, background: "transparent", border: "none", color: MUTED, fontSize: 12, cursor: "pointer", textDecoration: "underline" }}>
                  Clear highlights
                </button>
              )}

              {/* options */}
              <div style={{ marginTop: 20, display: "flex", flexDirection: "column", gap: 10 }}>
                {Array.isArray(current.options) &&
                  current.options.map((opt, i) => {
                    const optCorrect = i === current.correct_answer;
                    const isPicked = sel === i;
                    const isStruck = struckSet.has(i);

                    let bg = "#fff";
                    let border = BORDER;
                    if (reveal) {
                      if (optCorrect) {
                        bg = GREEN_SOFT;
                        border = GREEN;
                      } else if (isPicked) {
                        bg = RED_SOFT;
                        border = RED;
                      }
                    } else if (isPicked) {
                      bg = BLUE_SOFT;
                      border = BLUE;
                    }

                    return (
                      <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, background: bg, border: `1.5px solid ${border}`, borderRadius: 10, padding: "12px 14px" }}>
                        <button
                          onClick={() => selectOption(qid, i)}
                          aria-label={`Select option ${LETTERS[i]}`}
                          style={{ width: 22, height: 22, borderRadius: "50%", border: `2px solid ${isPicked ? BLUE : "#CBD5E1"}`, background: "#fff", flexShrink: 0, cursor: reveal ? "default" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}
                        >
                          {isPicked && <span style={{ width: 10, height: 10, borderRadius: "50%", background: BLUE }} />}
                        </button>

                        <span
                          onClick={() => selectOption(qid, i)}
                          style={{ flex: 1, fontSize, cursor: reveal ? "default" : "pointer", textDecoration: isStruck ? "line-through" : "none", color: isStruck ? MUTED : TEXT }}
                        >
                          <strong style={{ marginRight: 8 }}>{LETTERS[i]}.</strong>
                          {opt}
                        </span>

                        {reveal && optCorrect && <span style={{ color: GREEN, fontWeight: 700 }}>✓</span>}
                        {reveal && isPicked && !optCorrect && <span style={{ color: RED, fontWeight: 700 }}>✗</span>}

                        {!reveal && (
                          <button
                            onClick={() => toggleStrike(qid, i)}
                            title="Strike out"
                            style={{ flexShrink: 0, background: "transparent", border: `1px solid ${BORDER}`, borderRadius: 6, padding: "3px 7px", cursor: "pointer", color: isStruck ? BLUE : MUTED, fontSize: 12, fontWeight: 700, textDecoration: "line-through" }}
                          >
                            ab
                          </button>
                        )}
                      </div>
                    );
                  })}
              </div>

              {/* submit / next */}
              {!reviewMode && (
                <div style={{ marginTop: 20, display: "flex", gap: 12 }}>
                  {!answered ? (
                    <button onClick={submitAnswer} disabled={sel == null} style={{ background: sel == null ? "#93C5FD" : BLUE, color: "#fff", border: "none", borderRadius: 10, padding: "12px 28px", fontWeight: 700, fontSize: 15, cursor: sel == null ? "not-allowed" : "pointer" }}>
                      Submit Answer
                    </button>
                  ) : !atLast ? (
                    <button onClick={goNext} style={primaryBtn}>Next Question →</button>
                  ) : (
                    <button onClick={finishBlock} style={{ ...primaryBtn, background: GREEN }}>End Block</button>
                  )}
                </div>
              )}

              {/* result box */}
              {reveal && (
                <div style={{ marginTop: 20, border: `1px solid ${BORDER}`, borderRadius: 12, overflow: "hidden" }}>
                  <div style={{ display: "flex", borderBottom: `1px solid ${BORDER}` }}>
                    <ResultCell label={answered || reviewMode ? (isCorrect ? "Correct" : sel == null ? "Omitted" : "Incorrect") : "—"} value="" color={isCorrect ? GREEN : sel == null ? MUTED : RED} big />
                    <ResultCell label="Correct answer" value={LETTERS[current.correct_answer]} />
                    <ResultCell label="% Answered correctly" value="—" />
                    <ResultCell label="Time spent" value={fmtTime(answerSecs[qid] ?? 0)} last />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* EXPLANATION PANE */}
          {reveal && (
            <div style={{ flex: 1, minWidth: 0, overflowY: isMobile ? "visible" : "auto", borderLeft: isMobile || splitVertical ? "none" : `1px solid ${BORDER}`, borderTop: isMobile || splitVertical ? `1px solid ${BORDER}` : "none", background: "#fff", padding: isMobile ? 16 : 24 }}>
              <div style={{ maxWidth: 760, margin: "0 auto" }}>
                <div style={{ display: "inline-block", fontSize: 13, fontWeight: 700, color: BLUE, borderBottom: `2px solid ${BLUE}`, paddingBottom: 6, marginBottom: 16 }}>Explanation</div>
                <p style={{ fontSize, lineHeight: 1.7, color: "#334155", whiteSpace: "pre-wrap", margin: 0 }}>{current.explanation || "No explanation provided."}</p>

                {current.board_trap && (
                  <div style={{ marginTop: 16, background: AMBER_SOFT, border: `1px solid ${AMBER}`, borderRadius: 10, padding: "12px 14px" }}>
                    <strong style={{ color: "#92400E" }}>⚠️ Board Trap</strong>
                    <p style={{ margin: "6px 0 0", color: "#92400E", lineHeight: 1.6 }}>{current.board_trap}</p>
                  </div>
                )}

                {current.high_yield && (
                  <div style={{ marginTop: 16, background: TEAL_SOFT, borderLeft: `4px solid ${TEAL}`, borderRadius: 10, padding: "14px 18px" }}>
                    <strong style={{ color: TEAL, fontSize: 15 }}>⭐ High-Yield</strong>
                    <p style={{ margin: "8px 0 0", color: "#134E4A", lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{current.high_yield}</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* BOTTOM BAR */}
      <div style={{ background: NAVY, color: "#fff", padding: "8px 16px", display: "flex", alignItems: "center", gap: isMobile ? 10 : 16, flexShrink: 0 }}>
        {!isMobile && <span style={{ fontSize: 12, color: "#94A3B8" }}>Test Id: {shortId(testId)}</span>}
        <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", color: AMBER }}>
          {reviewMode ? "REVIEW" : mode === "timed" ? "TIMED" : "TUTOR"}
        </span>
        <div style={{ flex: 1 }} />
        {!isMobile && (
          <button onClick={() => setSplitVertical((v) => !v)} style={navBtn(false)} title="Toggle layout">
            ▤ Layout
          </button>
        )}
        {reviewMode ? (
          <button onClick={() => setPhase("summary")} style={{ ...navBtn(false), background: BLUE, borderColor: BLUE }}>Back to Results</button>
        ) : (
          <button onClick={finishBlock} style={{ ...navBtn(false), background: RED, borderColor: RED }}>End Block</button>
        )}
      </div>
    </div>
    </>
  );
}

/* ================================================================== */
/*  IN-TEST: LEFT RAIL                                                */
/* ================================================================== */
function QuestionRail({ questions, idx, selected, submitted, flagged, reviewMode, onJump, horizontal }) {
  const statusOf = (q, i) => {
    const isAnswered = submitted[q.id] || reviewMode;
    const picked = selected[q.id];
    let glyph = null;
    let color = MUTED;
    if (isAnswered && picked != null) {
      if (picked === q.correct_answer) { glyph = "✓"; color = GREEN; }
      else { glyph = "✗"; color = RED; }
    } else if (isAnswered) {
      glyph = "○";
    } else if (i === idx) {
      glyph = "●";
      color = BLUE;
    }
    return { glyph, color };
  };

  // Mobile: a horizontal scrolling strip of numbered chips instead of a left rail.
  if (horizontal) {
    return (
      <div style={{ display: "flex", gap: 6, overflowX: "auto", padding: "8px 12px", borderBottom: `1px solid ${BORDER}`, background: "#fff", flexShrink: 0 }}>
        {questions.map((q, i) => {
          const { glyph, color } = statusOf(q, i);
          const current = i === idx;
          return (
            <button
              key={q.id}
              onClick={() => onJump(i)}
              aria-label={`Question ${i + 1}`}
              style={{
                position: "relative",
                flexShrink: 0,
                minWidth: 38,
                height: 38,
                borderRadius: 8,
                border: current ? `2px solid ${BLUE}` : `1px solid ${BORDER}`,
                background: current ? BLUE_SOFT : "#fff",
                cursor: "pointer",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                lineHeight: 1,
                padding: "0 6px",
              }}
            >
              <span style={{ fontSize: 12, fontWeight: 700, color: color === MUTED ? TEXT : color }}>{i + 1}</span>
              {glyph && <span style={{ fontSize: 9, color, marginTop: 1 }}>{glyph}</span>}
              {flagged[q.id] && <span style={{ position: "absolute", top: -4, right: -2, color: AMBER, fontSize: 10 }}>⚑</span>}
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div style={{ width: 200, flexShrink: 0, borderRight: `1px solid ${BORDER}`, background: "#fff", overflowY: "auto" }}>
      <div style={{ padding: "12px 14px", fontSize: 11, fontWeight: 700, color: MUTED, textTransform: "uppercase", letterSpacing: "0.05em", borderBottom: `1px solid ${BORDER}`, position: "sticky", top: 0, background: "#fff" }}>
        Question Status
      </div>
      {questions.map((q, i) => {
        const { glyph, color } = statusOf(q, i);
        const current = i === idx;
        return (
          <button
            key={q.id}
            onClick={() => onJump(i)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              width: "100%",
              textAlign: "left",
              padding: "8px 12px",
              border: "none",
              borderBottom: `1px solid ${BORDER}`,
              borderLeft: current ? `3px solid ${BLUE}` : "3px solid transparent",
              background: current ? BLUE_SOFT : "#fff",
              cursor: "pointer",
              fontSize: 13,
              color: TEXT,
            }}
          >
            <span style={{ width: 22, textAlign: "right", color: MUTED, fontVariantNumeric: "tabular-nums" }}>{i + 1}</span>
            <span style={{ flex: 1 }} />
            {flagged[q.id] && <span style={{ color: AMBER, fontSize: 12 }}>⚑</span>}
            <span style={{ color, fontWeight: 700, width: 14, textAlign: "center" }}>{glyph}</span>
          </button>
        );
      })}
    </div>
  );
}

function ResultCell({ label, value, color, big, last }) {
  return (
    <div style={{ flex: 1, padding: "12px 14px", borderRight: last ? "none" : `1px solid ${BORDER}`, textAlign: "center" }}>
      <div style={{ fontSize: 11, color: MUTED, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: big ? 16 : 15, fontWeight: 700, color: color || TEXT }}>{value}</div>
    </div>
  );
}

/* ================================================================== */
/*  SETUP SCREEN — single scrollable config page                     */
/* ================================================================== */
function Setup(props) {
  const {
    loadingMeta, noIncorrect, systems, subjects, lectures, userQ, marks,
    pickedSystems, setPickedSystems,
    pickedSubjects, setPickedSubjects,
    pickedLectures, setPickedLectures,
    status, setStatus,
    numQuestions, setNumQuestions,
    mode, setMode,
    startBlock, starting, setupError,
  } = props;

  const isMobile = useIsMobile();
  const toggleStatus = (k) => setStatus((s) => ({ ...s, [k]: !s[k] }));

  // cascading toggles with locking + child-clearing
  const toggleSystem = (id) => {
    if (pickedSystems.includes(id)) {
      const remSub = subjects.filter((s) => s.system_id === id).map((s) => s.id);
      const remLec = lectures.filter((l) => remSub.includes(l.subject_id)).map((l) => l.id);
      setPickedSystems(pickedSystems.filter((x) => x !== id));
      setPickedSubjects(pickedSubjects.filter((sid) => !remSub.includes(sid)));
      setPickedLectures(pickedLectures.filter((lid) => !remLec.includes(lid)));
    } else {
      setPickedSystems([...pickedSystems, id]);
    }
  };
  const toggleSubject = (id) => {
    if (pickedSubjects.includes(id)) {
      const remLec = lectures.filter((l) => l.subject_id === id).map((l) => l.id);
      setPickedSubjects(pickedSubjects.filter((x) => x !== id));
      setPickedLectures(pickedLectures.filter((lid) => !remLec.includes(lid)));
    } else {
      setPickedSubjects([...pickedSubjects, id]);
    }
  };
  const toggleLecture = (id) => setPickedLectures((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  // --- predicates (data is small → recompute each render) ---
  const passStatus = (q) =>
    (status.unused && q.status === "unused") ||
    (status.incorrect && q.status === "incorrect") ||
    (status.correct && q.status === "correct") ||
    (status.marked && marks.has(q.id)) ||
    (status.omitted && q.status === "omitted");

  const inSys = (q) => !pickedSystems.length || pickedSystems.includes(q.system_id);
  const inSub = (q) => !pickedSubjects.length || pickedSubjects.includes(q.subject_id);
  const inLec = (q) => !pickedLectures.length || (q.lecture_id && pickedLectures.includes(q.lecture_id));
  const cascade = (q) => inSys(q) && inSub(q) && inLec(q);

  // status counts within current cascade scope
  const statusCounts = { unused: 0, incorrect: 0, correct: 0, marked: 0, omitted: 0 };
  userQ.forEach((q) => {
    if (!cascade(q)) return;
    statusCounts[q.status] += 1;
    if (marks.has(q.id)) statusCounts.marked += 1;
  });

  // per-item counts reflect chosen status filter
  const statusPool = userQ.filter(passStatus);
  const sysCount = {};
  const subCount = {};
  const lecCount = {};
  statusPool.forEach((q) => {
    if (q.system_id) sysCount[q.system_id] = (sysCount[q.system_id] || 0) + 1;
    if (q.subject_id) subCount[q.subject_id] = (subCount[q.subject_id] || 0) + 1;
    if (q.lecture_id) lecCount[q.lecture_id] = (lecCount[q.lecture_id] || 0) + 1;
  });

  const shownSubjects = subjects.filter((s) => pickedSystems.includes(s.system_id));
  const shownLectures = lectures.filter((l) => pickedSubjects.includes(l.subject_id));

  const finalPool = userQ.filter((q) => cascade(q) && passStatus(q));
  const N = finalPool.length;
  // numQuestions is a raw string while typing; clamp to [1, N] for display/use.
  const clampNum = (raw) => {
    const n = parseInt(raw, 10);
    if (Number.isNaN(n)) return 1;
    return Math.max(1, Math.min(N || 1, n));
  };
  const take = clampNum(numQuestions);

  const subjectsLocked = pickedSystems.length === 0;
  const lecturesLocked = pickedSubjects.length === 0;

  // master (select-all) checkboxes per cascading section
  const sysAllOn = systems.length > 0 && pickedSystems.length === systems.length;
  const subAllOn = shownSubjects.length > 0 && pickedSubjects.length === shownSubjects.length;
  const lecAllOn = shownLectures.length > 0 && pickedLectures.length === shownLectures.length;
  const toggleSysMaster = () =>
    sysAllOn ? toggleSystemClearAll(setPickedSystems, setPickedSubjects, setPickedLectures) : setPickedSystems(systems.map((s) => s.id));
  const toggleSubMaster = () => {
    if (subAllOn) {
      setPickedSubjects([]);
      setPickedLectures([]);
    } else setPickedSubjects(shownSubjects.map((s) => s.id));
  };
  const toggleLecMaster = () => (lecAllOn ? setPickedLectures([]) : setPickedLectures(shownLectures.map((l) => l.id)));

  return (
    <div style={{ minHeight: "100vh", background: "#F8FAFC", color: TEXT }}>
      <div style={{ maxWidth: 920, margin: "0 auto", padding: isMobile ? "20px 14px 120px" : "32px 20px 110px" }}>
        <h1 style={{ fontSize: 26, margin: "0 0 4px" }}>Create Test</h1>
        <p style={{ color: MUTED, margin: "0 0 28px", fontSize: 14 }}>Build a custom question block.</p>

        {noIncorrect && (
          <div style={{ background: GREEN_SOFT, border: `1px solid ${GREEN}`, color: "#166534", borderRadius: 10, padding: "12px 14px", marginBottom: 24, fontSize: 14, fontWeight: 600 }}>
            No incorrect questions to review — great job!
          </div>
        )}

        {loadingMeta ? (
          <p style={{ color: MUTED }}>Loading…</p>
        ) : (
          <>
            {/* 1. TEST MODE */}
            <Section title="Test Mode">
              <div style={{ display: "flex", gap: 12 }}>
                <ModePill active={mode === "tutor"} onClick={() => setMode("tutor")} label="Tutor" sub="Explanation after each question" />
                <ModePill active={mode === "timed"} onClick={() => setMode("timed")} label="Timed" sub={`${SECONDS_PER_Q}s per question · explanations at the end`} />
              </div>
            </Section>

            {/* 2. QUESTION MODE */}
            <Section title="Question Mode" totalPill={N}>
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "12px 26px" }}>
                <StatusToggle on={status.unused} onClick={() => toggleStatus("unused")} label="Unused" count={statusCounts.unused} />
                <StatusToggle on={status.incorrect} onClick={() => toggleStatus("incorrect")} label="Incorrect" count={statusCounts.incorrect} />
                <StatusToggle on={status.correct} onClick={() => toggleStatus("correct")} label="Correct" count={statusCounts.correct} />
                <StatusToggle on={status.marked} onClick={() => toggleStatus("marked")} label="Marked" count={statusCounts.marked} />
                <StatusToggle on={status.omitted} onClick={() => toggleStatus("omitted")} label="Omitted" count={statusCounts.omitted} />
              </div>
            </Section>

            {/* 3. CASCADING */}
            <Section title="Systems" master={{ on: sysAllOn, onToggle: toggleSysMaster }}>
              {systems.length === 0 ? (
                <Empty>No systems configured yet.</Empty>
              ) : (
                <Grid single={isMobile}>
                  {systems.map((s) => (
                    <CheckRow key={s.id} on={pickedSystems.includes(s.id)} onClick={() => toggleSystem(s.id)} label={s.name} count={sysCount[s.id] || 0} />
                  ))}
                </Grid>
              )}
            </Section>

            <Section title="Subjects" locked={subjectsLocked} master={{ on: subAllOn, onToggle: toggleSubMaster, disabled: subjectsLocked }}>
              {subjectsLocked ? (
                <Locked>Select a system first.</Locked>
              ) : shownSubjects.length === 0 ? (
                <Empty>No subjects for the selected systems.</Empty>
              ) : (
                <Grid single={isMobile}>
                  {shownSubjects.map((s) => (
                    <CheckRow key={s.id} on={pickedSubjects.includes(s.id)} onClick={() => toggleSubject(s.id)} label={s.name} count={subCount[s.id] || 0} />
                  ))}
                </Grid>
              )}
            </Section>

            <Section title="Lectures" locked={lecturesLocked} master={{ on: lecAllOn, onToggle: toggleLecMaster, disabled: lecturesLocked }}>
              {lecturesLocked ? (
                <Locked>Select a subject first.</Locked>
              ) : shownLectures.length === 0 ? (
                <Empty>No lectures for the selected subjects.</Empty>
              ) : (
                <Grid single={isMobile}>
                  {shownLectures.map((l) => (
                    <CheckRow key={l.id} on={pickedLectures.includes(l.id)} onClick={() => toggleLecture(l.id)} label={l.title} count={lecCount[l.id] || 0} />
                  ))}
                </Grid>
              )}
            </Section>
          </>
        )}
      </div>

      {/* FOOTER */}
      {!loadingMeta && (
        <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: "#fff", borderTop: `1px solid ${BORDER}`, padding: "14px 20px", display: "flex", alignItems: "center", gap: 16, justifyContent: "center", flexWrap: "wrap" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <input
              type="number"
              min={1}
              max={N}
              value={numQuestions}
              onChange={(e) => setNumQuestions(e.target.value)}
              onBlur={() => setNumQuestions(String(clampNum(numQuestions)))}
              style={{ width: 90, padding: "10px 12px", fontSize: 16, border: `1px solid ${BORDER}`, borderRadius: 8 }}
            />
            <span style={{ color: MUTED, fontSize: 14 }}>
              of <strong style={{ color: TEXT }}>{N}</strong> selected
            </span>
          </div>
          {setupError && <span style={{ color: RED, fontSize: 13 }}>{setupError}</span>}
          <button
            onClick={() => startBlock(finalPool.map((q) => q.id), numQuestions)}
            disabled={starting || N === 0}
            style={{ ...primaryBtn, padding: "12px 30px", opacity: starting || N === 0 ? 0.6 : 1, cursor: starting || N === 0 ? "not-allowed" : "pointer" }}
          >
            {starting ? "Generating…" : `Generate test${N > 0 ? ` · ${take}` : ""}`}
          </button>
        </div>
      )}
    </div>
  );
}

function toggleSystemClearAll(setSys, setSub, setLec) {
  setSys([]);
  setSub([]);
  setLec([]);
}

/* ---- setup sub-components ---- */
function Section({ title, children, locked, master, totalPill }) {
  return (
    <div style={{ opacity: locked ? 0.4 : 1, padding: "22px 0", borderTop: `0.5px solid ${BORDER}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
        {master && (
          <button
            onClick={master.onToggle}
            disabled={master.disabled}
            aria-label="Select all"
            style={{ background: "transparent", border: "none", padding: 0, cursor: master.disabled ? "default" : "pointer", lineHeight: 0 }}
          >
            <Checkbox on={master.on} />
          </button>
        )}
        <h3 style={{ margin: 0, fontSize: 19, fontWeight: 500, color: HEAD }}>{title}</h3>
        {totalPill != null && <TotalPill n={totalPill} />}
      </div>
      {children}
    </div>
  );
}

function Grid({ children, single }) {
  return <div style={{ display: "grid", gridTemplateColumns: single ? "1fr" : "repeat(2, 1fr)", gap: 14 }}>{children}</div>;
}

function CheckRow({ on, onClick, label, count }) {
  return (
    <button
      onClick={onClick}
      style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", border: `1px solid ${on ? BLUE : BORDER}`, borderRadius: 10, background: on ? BLUE_SOFT : "#fff", cursor: "pointer", textAlign: "left", width: "100%" }}
    >
      <Checkbox on={on} />
      <span style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 14, color: TEXT }}>{label}</span>
        <CountPill n={count} />
      </span>
    </button>
  );
}

// Compact inline status checkbox (UWorld-style row), not a bordered card.
function StatusToggle({ on, onClick, label, count }) {
  return (
    <button onClick={onClick} style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "transparent", border: "none", cursor: "pointer", padding: "2px 0", fontFamily: "inherit" }}>
      <span style={{ width: 18, height: 18, borderRadius: 5, flexShrink: 0, border: `2px solid ${on ? BLUE : "#CBD5E1"}`, background: on ? BLUE : "#fff", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800 }}>
        {on ? "✓" : ""}
      </span>
      <span style={{ fontSize: 14, color: TEXT }}>{label}</span>
      <CountPill n={count} />
    </button>
  );
}

function CountPill({ n }) {
  return (
    <span style={{ color: BLUE, fontSize: 12, fontWeight: 600, border: `1px solid ${PILL_BORDER}`, borderRadius: 999, padding: "1px 9px", flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>
      ({n})
    </span>
  );
}

function TotalPill({ n }) {
  return (
    <span style={{ color: BLUE, fontSize: 13, fontWeight: 700, border: `1px solid ${PILL_BORDER}`, background: BLUE_SOFT, borderRadius: 999, padding: "3px 12px" }}>
      Total Available {n}
    </span>
  );
}

function ModePill({ active, onClick, label, sub }) {
  return (
    <button onClick={onClick} style={{ flex: 1, textAlign: "left", padding: "14px 16px", borderRadius: 10, cursor: "pointer", border: `1.5px solid ${active ? BLUE : BORDER}`, background: active ? BLUE_SOFT : "#fff" }}>
      <div style={{ fontWeight: 700, color: active ? BLUE : TEXT }}>{label}</div>
      <div style={{ fontSize: 12, color: MUTED, marginTop: 3, lineHeight: 1.5 }}>{sub}</div>
    </button>
  );
}

function Checkbox({ on }) {
  return (
    <span style={{ width: 26, height: 26, borderRadius: 7, flexShrink: 0, border: `2px solid ${on ? BLUE : "#CBD5E1"}`, background: on ? BLUE : "#fff", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 800 }}>
      {on ? "✓" : ""}
    </span>
  );
}

function Locked({ children }) {
  return <div style={{ padding: 16, border: `1px dashed ${BORDER}`, borderRadius: 10, color: MUTED, fontStyle: "italic" }}>{children}</div>;
}

/* ================================================================== */
/*  RESULTS SCREEN                                                    */
/* ================================================================== */
function Results({ questions, selected, flagged, answerSecs, elapsed, mode, poolLabel, testId, subjects, systems, openReview, newBlock, sessionMode, onNextTask }) {
  const [tab, setTab] = useState("results");
  const tableRef = useRef(null);

  const subjectName = (id) => subjects.find((s) => s.id === id)?.name || "—";
  const sysOf = {};
  subjects.forEach((s) => (sysOf[s.id] = s.system_id));
  const sysName = {};
  systems.forEach((s) => (sysName[s.id] = s.name));
  const systemName = (subId) => sysName[sysOf[subId]] || "—";

  const total = questions.length;
  const correct = questions.filter((q) => selected[q.id] === q.correct_answer).length;
  const pct = total ? Math.round((correct / total) * 100) : 0;
  const totalTime = Object.values(answerSecs).reduce((a, b) => a + b, 0) || elapsed;

  // per-subject analysis
  const bySubject = {};
  questions.forEach((q) => {
    const k = q.subject_id;
    if (!bySubject[k]) bySubject[k] = { correct: 0, total: 0 };
    bySubject[k].total += 1;
    if (selected[q.id] === q.correct_answer) bySubject[k].correct += 1;
  });

  const scoreColor = pct >= 70 ? GREEN : pct >= 50 ? AMBER : RED;

  return (
    <div style={{ minHeight: "100vh", background: "#F8FAFC", padding: "32px 20px" }}>
      <div style={{ maxWidth: 1000, margin: "0 auto" }}>
        {/* header */}
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 20, flexWrap: "wrap" }}>
          <div>
            <h1 style={{ fontSize: 24, margin: "0 0 2px" }}>Test Name: Custom Test</h1>
            <span style={{ fontSize: 13, color: MUTED }}>Test Id: {shortId(testId)}</span>
          </div>
          <div style={{ flex: 1 }} />
          {sessionMode && <button onClick={onNextTask} style={{ ...primaryBtn, background: GREEN }}>Next task →</button>}
          <button onClick={() => openReview(0)} style={primaryBtn}>Review Test</button>
          <button onClick={() => tableRef.current?.scrollIntoView({ behavior: "smooth" })} style={ghostBtn}>Question List</button>
          <button onClick={newBlock} style={{ ...primaryBtn, background: GREEN }}>New Test</button>
        </div>

        {/* tabs */}
        <div style={{ display: "flex", gap: 4, borderBottom: `1px solid ${BORDER}`, marginBottom: 22 }}>
          <Tab active={tab === "results"} onClick={() => setTab("results")}>Test Results</Tab>
          <Tab active={tab === "analysis"} onClick={() => setTab("analysis")}>Test Analysis</Tab>
        </div>

        {tab === "results" ? (
          <>
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 24 }}>
              {/* score */}
              <div style={{ background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 12, padding: "20px 28px", minWidth: 200 }}>
                <div style={{ fontSize: 13, color: MUTED, marginBottom: 6 }}>Your Score</div>
                <div style={{ fontSize: 48, fontWeight: 800, color: scoreColor, lineHeight: 1 }}>{pct}%</div>
                <div style={{ fontSize: 13, color: MUTED, marginTop: 6 }}>{correct} / {total} correct</div>
              </div>
              {/* settings */}
              <div style={{ background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 12, padding: "20px 28px", minWidth: 220 }}>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12 }}>Test Settings</div>
                <SettingRow label="Mode" value={mode === "timed" ? "Timed" : "Tutored"} />
                <SettingRow label="Question Pool" value={poolLabel} />
                <SettingRow label="Questions" value={String(total)} />
                <SettingRow label="Time" value={fmtTime(totalTime)} />
              </div>
              <Stat label="Correct" value={correct} color={GREEN} />
              <Stat label="Incorrect" value={questions.filter((q) => selected[q.id] != null && selected[q.id] !== q.correct_answer).length} color={RED} />
              <Stat label="Omitted" value={questions.filter((q) => selected[q.id] == null).length} color={MUTED} />
            </div>

            {/* question table */}
            <div ref={tableRef} style={{ background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 14, overflow: "hidden" }}>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: "#F8FAFF", textAlign: "left" }}>
                      {["#", "Id", "Subject", "System", "Topic", "Result", "Time"].map((h) => (
                        <th key={h} style={{ padding: "10px 14px", fontSize: 11, fontWeight: 700, color: MUTED, textTransform: "uppercase", letterSpacing: "0.04em" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {questions.map((q, i) => {
                      const picked = selected[q.id];
                      const ok = picked === q.correct_answer;
                      const answered = picked != null;
                      return (
                        <tr key={q.id} onClick={() => openReview(i)} style={{ cursor: "pointer", borderTop: `1px solid ${BORDER}` }}>
                          <td style={td}>{i + 1}</td>
                          <td style={{ ...td, fontFamily: "monospace", color: MUTED }}>{shortId(q.id)}</td>
                          <td style={td}>{subjectName(q.subject_id)}</td>
                          <td style={td}>{systemName(q.subject_id)}</td>
                          <td style={{ ...td, maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{q.topic || "—"}</td>
                          <td style={td}>
                            {flagged[q.id] && <span style={{ color: AMBER, marginRight: 6 }}>⚑</span>}
                            <span style={{ color: !answered ? MUTED : ok ? GREEN : RED, fontWeight: 700 }}>{!answered ? "○" : ok ? "✓" : "✗"}</span>
                          </td>
                          <td style={{ ...td, color: MUTED, fontVariantNumeric: "tabular-nums" }}>{fmtTime(answerSecs[q.id] ?? 0)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        ) : (
          /* ANALYSIS */
          <div style={{ background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 14, padding: 24 }}>
            <h3 style={{ margin: "0 0 16px", fontSize: 16 }}>Accuracy by subject</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {Object.entries(bySubject).map(([sid, v]) => {
                const p = v.total ? Math.round((v.correct / v.total) * 100) : 0;
                const c = p >= 70 ? GREEN : p >= 50 ? AMBER : RED;
                return (
                  <div key={sid}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 14 }}>
                      <span style={{ fontWeight: 600 }}>{subjectName(sid)}</span>
                      <span style={{ color: MUTED }}>{v.correct}/{v.total} · {p}%</span>
                    </div>
                    <div style={{ height: 8, background: "#F1F5F9", borderRadius: 999 }}>
                      <div style={{ width: `${p}%`, height: "100%", background: c, borderRadius: 999 }} />
                    </div>
                  </div>
                );
              })}
              {Object.keys(bySubject).length === 0 && <p style={{ color: MUTED }}>No data.</p>}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Tab({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      style={{ background: "transparent", border: "none", borderBottom: `2px solid ${active ? BLUE : "transparent"}`, color: active ? BLUE : MUTED, fontWeight: 700, fontSize: 14, padding: "10px 16px", cursor: "pointer", marginBottom: -1 }}
    >
      {children}
    </button>
  );
}

function SettingRow({ label, value }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 16, fontSize: 13, padding: "3px 0" }}>
      <span style={{ color: MUTED }}>{label}</span>
      <span style={{ fontWeight: 600 }}>{value}</span>
    </div>
  );
}

/* ================================================================== */
/*  HELPERS + SMALL COMPONENTS                                        */
/* ================================================================== */
function mergeRanges(list) {
  const sorted = [...list].sort((a, b) => a.start - b.start);
  const out = [];
  for (const r of sorted) {
    const last = out[out.length - 1];
    if (last && r.start <= last.end) last.end = Math.max(last.end, r.end);
    else out.push({ ...r });
  }
  return out;
}

function renderHighlighted(text, ranges) {
  if (!ranges || ranges.length === 0) return text;
  const parts = [];
  let cursor = 0;
  mergeRanges(ranges).forEach((r, i) => {
    if (r.start > cursor) parts.push(text.slice(cursor, r.start));
    parts.push(
      <mark key={i} style={{ background: "#FEF08A", padding: "0 1px" }}>
        {text.slice(r.start, r.end)}
      </mark>
    );
    cursor = r.end;
  });
  if (cursor < text.length) parts.push(text.slice(cursor));
  return parts;
}

const primaryBtn = { background: BLUE, color: "#fff", border: "none", borderRadius: 10, padding: "11px 22px", fontWeight: 700, fontSize: 14, cursor: "pointer" };
const ghostBtn = { background: "#fff", color: TEXT, border: `1px solid ${BORDER}`, borderRadius: 10, padding: "10px 18px", fontWeight: 600, fontSize: 14, cursor: "pointer" };
const navBtn = (disabled) => ({ background: disabled ? "#1E293B" : NAVY_2, color: disabled ? "#475569" : "#fff", border: "1px solid #475569", borderRadius: 8, padding: "6px 12px", cursor: disabled ? "not-allowed" : "pointer", fontWeight: 600, fontSize: 13 });
const td = { padding: "11px 14px", color: TEXT, verticalAlign: "middle" };

function Stat({ label, value, color }) {
  return (
    <div style={{ background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 12, padding: "16px 22px", minWidth: 110 }}>
      <div style={{ fontSize: 26, fontWeight: 800, color }}>{value}</div>
      <div style={{ fontSize: 13, color: MUTED, marginTop: 2 }}>{label}</div>
    </div>
  );
}

function IconBtn({ children, onClick }) {
  return (
    <button onClick={onClick} style={{ background: "#fff", color: TEXT, border: `1px solid ${BORDER}`, borderRadius: 6, padding: "4px 8px", cursor: "pointer", fontSize: 13, fontWeight: 700 }}>
      {children}
    </button>
  );
}

function Empty({ children }) {
  return <div style={{ padding: 16, border: `1px dashed ${BORDER}`, borderRadius: 10, color: MUTED }}>{children}</div>;
}

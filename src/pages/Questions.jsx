import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "../lib/supabase";

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

export default function Questions() {
  const [phase, setPhase] = useState("setup"); // setup | running | summary

  /* -------- shared data -------- */
  const [systems, setSystems] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [loadingMeta, setLoadingMeta] = useState(true);

  /* -------- setup selections -------- */
  const [pickedSystems, setPickedSystems] = useState([]); // system ids
  const [pickedSubjects, setPickedSubjects] = useState([]); // subject ids
  const [counts, setCounts] = useState({ bySubject: {}, bySystem: {} });
  const [numQuestions, setNumQuestions] = useState(10);
  const [mode, setMode] = useState("tutor"); // tutor | timed
  const [starting, setStarting] = useState(false);
  const [setupError, setSetupError] = useState("");

  /* -------- running state -------- */
  const [questions, setQuestions] = useState([]);
  const [idx, setIdx] = useState(0);
  const [selected, setSelected] = useState({}); // qid -> option index
  const [submitted, setSubmitted] = useState({}); // qid -> true
  const [struck, setStruck] = useState({}); // qid -> Set(option idx)
  const [flagged, setFlagged] = useState({}); // qid -> true
  const [highlights, setHighlights] = useState({}); // qid -> [{start,end}]
  const [fontSize, setFontSize] = useState(16);
  const [reviewMode, setReviewMode] = useState(false); // from summary

  /* -------- timer -------- */
  const [timeLeft, setTimeLeft] = useState(0);
  const timerRef = useRef(null);
  const [elapsed, setElapsed] = useState(0);

  const subjectName = (id) => subjects.find((s) => s.id === id)?.name || "—";

  // Effective subjects = picked subjects, optionally constrained to picked systems.
  const effectiveSubjectIds = pickedSubjects.filter((sid) => {
    if (pickedSystems.length === 0) return true;
    const subj = subjects.find((s) => s.id === sid);
    return subj && pickedSystems.includes(subj.system_id);
  });
  const availableCount = effectiveSubjectIds.reduce((sum, sid) => sum + (counts.bySubject[sid] || 0), 0);

  /* ---------------- load systems + subjects ---------------- */
  useEffect(() => {
    (async () => {
      setLoadingMeta(true);
      const [{ data: sys }, { data: subj }, { data: qrows }] = await Promise.all([
        supabase.from("systems").select("id,name").order("name"),
        supabase.from("subjects").select("id,name,system_id").order("name"),
        supabase.from("questions").select("subject_id").eq("published", true),
      ]);
      const bySubject = {};
      (qrows || []).forEach((r) => {
        if (r.subject_id) bySubject[r.subject_id] = (bySubject[r.subject_id] || 0) + 1;
      });
      const subjList = subj || [];
      const bySystem = {};
      subjList.forEach((s) => {
        if (s.system_id) bySystem[s.system_id] = (bySystem[s.system_id] || 0) + (bySubject[s.id] || 0);
      });
      setSystems(sys || []);
      setSubjects(subjList);
      setCounts({ bySubject, bySystem });
      setLoadingMeta(false);
    })();
  }, []);

  /* ---------------- timer tick ---------------- */
  useEffect(() => {
    if (phase !== "running" || mode !== "timed") return;
    timerRef.current = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) {
          clearInterval(timerRef.current);
          finishBlock();
          return 0;
        }
        return t - 1;
      });
      setElapsed((e) => e + 1);
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [phase, mode]);

  /* ---------------- elapsed for tutor ---------------- */
  useEffect(() => {
    if (phase !== "running" || mode !== "tutor") return;
    const t = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
  }, [phase, mode]);

  /* ---------------- setup helpers ---------------- */
  const toggleSubject = (id) =>
    setPickedSubjects((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const toggleSystem = (id) =>
    setPickedSystems((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const toggleAllSubjects = () =>
    setPickedSubjects((p) => (p.length === subjects.length ? [] : subjects.map((s) => s.id)));
  const toggleAllSystems = () =>
    setPickedSystems((p) => (p.length === systems.length ? [] : systems.map((s) => s.id)));

  async function startBlock() {
    setSetupError("");
    if (effectiveSubjectIds.length === 0) {
      setSetupError("Choose at least one subject.");
      return;
    }
    const n = Math.min(Math.max(1, numQuestions), availableCount);
    if (n < 1) {
      setSetupError("No published questions for this selection.");
      return;
    }
    setStarting(true);
    const { data, error } = await supabase
      .from("questions")
      .select("*")
      .eq("published", true)
      .in("subject_id", effectiveSubjectIds);
    setStarting(false);
    if (error || !data || data.length === 0) {
      setSetupError("Could not load questions. Try again.");
      return;
    }
    const chosen = shuffle(data).slice(0, n);
    setQuestions(chosen);
    setIdx(0);
    setSelected({});
    setSubmitted({});
    setStruck({});
    setFlagged({});
    setHighlights({});
    setElapsed(0);
    setReviewMode(false);
    if (mode === "timed") setTimeLeft(chosen.length * SECONDS_PER_Q);
    setPhase("running");
  }

  /* ---------------- answering ---------------- */
  const current = questions[idx];

  const selectOption = (qid, optIdx) => {
    if (submitted[qid] || reviewMode) return;
    setSelected((s) => ({ ...s, [qid]: optIdx }));
  };

  const toggleStrike = (qid, optIdx) => {
    if (submitted[qid] || reviewMode) return;
    setStruck((s) => {
      const set = new Set(s[qid] || []);
      set.has(optIdx) ? set.delete(optIdx) : set.add(optIdx);
      return { ...s, [qid]: set };
    });
  };

  async function submitAnswer() {
    const q = current;
    if (q == null || selected[q.id] == null) return;
    const isCorrect = selected[q.id] === q.correct_answer;
    setSubmitted((s) => ({ ...s, [q.id]: true }));

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      await supabase.from("user_progress").insert({
        user_id: user.id,
        question_id: q.id,
        is_correct: isCorrect,
      });
    }
  }

  const toggleFlag = (qid) =>
    setFlagged((f) => ({ ...f, [qid]: !f[qid] }));

  /* ---------------- highlight (session only) ---------------- */
  const stemRef = useRef(null);

  const onStemMouseUp = useCallback(() => {
    if (!current) return;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !stemRef.current) return;
    const range = sel.getRangeAt(0);
    if (!stemRef.current.contains(range.commonAncestorContainer)) return;

    // compute plain-text offsets relative to stem container
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
  const goNext = () => {
    if (idx < questions.length - 1) setIdx(idx + 1);
  };
  const goPrev = () => {
    if (idx > 0) setIdx(idx - 1);
  };

  function finishBlock() {
    clearInterval(timerRef.current);
    setPhase("summary");
  }

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
      <Setup
        loadingMeta={loadingMeta}
        systems={systems}
        subjects={subjects}
        counts={counts}
        pickedSystems={pickedSystems}
        pickedSubjects={pickedSubjects}
        toggleSystem={toggleSystem}
        toggleSubject={toggleSubject}
        toggleAllSystems={toggleAllSystems}
        toggleAllSubjects={toggleAllSubjects}
        numQuestions={numQuestions}
        setNumQuestions={setNumQuestions}
        availableCount={availableCount}
        mode={mode}
        setMode={setMode}
        startBlock={startBlock}
        starting={starting}
        setupError={setupError}
      />
    );

  if (phase === "summary")
    return (
      <Summary
        questions={questions}
        selected={selected}
        flagged={flagged}
        elapsed={elapsed}
        mode={mode}
        subjectName={subjectName}
        openReview={openReview}
        newBlock={newBlock}
      />
    );

  /* -------- running -------- */
  if (!current) return null;
  const qid = current.id;
  const isSubmitted = submitted[qid] || reviewMode;
  const sel = selected[qid];
  const struckSet = struck[qid] || new Set();

  return (
    <div style={{ minHeight: "100vh", background: "#F8FAFC", color: TEXT }}>
      {/* TOP BAR */}
      <div
        style={{
          background: NAVY,
          color: "#fff",
          padding: "12px 20px",
          display: "flex",
          alignItems: "center",
          gap: 16,
          position: "sticky",
          top: 0,
          zIndex: 10,
        }}
      >
        <strong style={{ fontSize: 15 }}>
          Question {idx + 1} of {questions.length}
        </strong>
        <Pill bg={NAVY_2}>{subjectName(current.subject_id)}</Pill>
        <Pill bg={NAVY_2} style={{ textTransform: "capitalize" }}>
          {current.difficulty}
        </Pill>

        <div style={{ flex: 1 }} />

        {mode === "timed" && !reviewMode && (
          <span
            style={{
              fontVariantNumeric: "tabular-nums",
              fontWeight: 700,
              color: timeLeft < 60 ? "#FCA5A5" : "#fff",
            }}
          >
            ⏱ {fmtTime(timeLeft)}
          </span>
        )}

        <button
          onClick={() => toggleFlag(qid)}
          title="Flag for review"
          style={{
            background: flagged[qid] ? AMBER : "transparent",
            color: flagged[qid] ? NAVY : "#fff",
            border: `1px solid ${flagged[qid] ? AMBER : "#475569"}`,
            borderRadius: 8,
            padding: "6px 10px",
            cursor: "pointer",
            fontWeight: 600,
          }}
        >
          {flagged[qid] ? "⚑ Flagged" : "⚐ Flag"}
        </button>

        <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
          <IconBtn onClick={() => setFontSize((f) => Math.max(14, f - 1))}>A−</IconBtn>
          <span style={{ fontSize: 12, width: 34, textAlign: "center" }}>{fontSize}px</span>
          <IconBtn onClick={() => setFontSize((f) => Math.min(22, f + 1))}>A+</IconBtn>
        </div>
      </div>

      {/* BODY */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: isSubmitted ? "minmax(0,1.4fr) minmax(0,1fr)" : "1fr",
          gap: 20,
          padding: 20,
          maxWidth: 1400,
          margin: "0 auto",
          alignItems: "start",
        }}
      >
        {/* LEFT — QUESTION */}
        <div
          style={{
            background: "#fff",
            border: `1px solid ${BORDER}`,
            borderRadius: 14,
            padding: 24,
          }}
        >
          <div
            ref={stemRef}
            onMouseUp={onStemMouseUp}
            style={{ fontSize, lineHeight: 1.7, whiteSpace: "pre-wrap", userSelect: "text" }}
          >
            {renderHighlighted(current.stem, highlights[qid] || [])}
          </div>

          {(highlights[qid]?.length ?? 0) > 0 && !reviewMode && (
            <button
              onClick={clearHighlights}
              style={{
                marginTop: 8,
                background: "transparent",
                border: "none",
                color: MUTED,
                fontSize: 12,
                cursor: "pointer",
                textDecoration: "underline",
              }}
            >
              Clear highlights
            </button>
          )}

          {/* OPTIONS */}
          <div style={{ marginTop: 20, display: "flex", flexDirection: "column", gap: 10 }}>
            {Array.isArray(current.options) &&
              current.options.map((opt, i) => {
                const isCorrect = i === current.correct_answer;
                const isPicked = sel === i;
                const isStruck = struckSet.has(i);

                let bg = "#fff";
                let border = BORDER;
                if (isSubmitted) {
                  if (isCorrect) {
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
                  <div
                    key={i}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 14,
                      background: bg,
                      border: `1.5px solid ${border}`,
                      borderRadius: 10,
                      padding: "14px 16px",
                    }}
                  >
                    {/* radio = select */}
                    <button
                      onClick={() => selectOption(qid, i)}
                      aria-label={`Select option ${LETTERS[i]}`}
                      style={{
                        width: 22,
                        height: 22,
                        borderRadius: "50%",
                        border: `2px solid ${isPicked ? BLUE : "#CBD5E1"}`,
                        background: "#fff",
                        flexShrink: 0,
                        cursor: isSubmitted ? "default" : "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        padding: 0,
                      }}
                    >
                      {isPicked && (
                        <span
                          style={{
                            width: 10,
                            height: 10,
                            borderRadius: "50%",
                            background: BLUE,
                          }}
                        />
                      )}
                    </button>

                    {/* text = strike */}
                    <span
                      onClick={() => toggleStrike(qid, i)}
                      style={{
                        flex: 1,
                        fontSize,
                        cursor: isSubmitted ? "default" : "pointer",
                        textDecoration: isStruck ? "line-through" : "none",
                        color: isStruck ? MUTED : TEXT,
                        userSelect: "none",
                      }}
                    >
                      <strong style={{ marginRight: 8 }}>{LETTERS[i]}.</strong>
                      {opt}
                    </span>

                    {isSubmitted && isCorrect && (
                      <span style={{ color: GREEN, fontWeight: 700 }}>✓</span>
                    )}
                    {isSubmitted && isPicked && !isCorrect && (
                      <span style={{ color: RED, fontWeight: 700 }}>✗</span>
                    )}
                  </div>
                );
              })}
          </div>

          {/* submit / next */}
          {!reviewMode && (
            <div style={{ marginTop: 22, display: "flex", gap: 12 }}>
              {!isSubmitted ? (
                <button
                  onClick={submitAnswer}
                  disabled={sel == null}
                  style={{
                    background: sel == null ? "#93C5FD" : BLUE,
                    color: "#fff",
                    border: "none",
                    borderRadius: 10,
                    padding: "12px 28px",
                    fontWeight: 700,
                    fontSize: 15,
                    cursor: sel == null ? "not-allowed" : "pointer",
                  }}
                >
                  Submit Answer
                </button>
              ) : idx < questions.length - 1 ? (
                <button onClick={goNext} style={primaryBtn}>
                  Next Question →
                </button>
              ) : (
                <button onClick={finishBlock} style={{ ...primaryBtn, background: GREEN }}>
                  Finish block
                </button>
              )}
            </div>
          )}
        </div>

        {/* RIGHT — EXPLANATION */}
        {isSubmitted && (
          <div
            style={{
              background: "#fff",
              border: `1px solid ${BORDER}`,
              borderRadius: 14,
              padding: 24,
              position: "sticky",
              top: 80,
              maxHeight: "calc(100vh - 110px)",
              overflowY: "auto",
            }}
          >
            <h3 style={{ margin: "0 0 12px", fontSize: 18 }}>Explanation</h3>
            <p style={{ fontSize, lineHeight: 1.7, color: "#334155", whiteSpace: "pre-wrap" }}>
              {current.explanation || "No explanation provided."}
            </p>

            {current.board_trap && (
              <div
                style={{
                  marginTop: 16,
                  background: AMBER_SOFT,
                  border: `1px solid ${AMBER}`,
                  borderRadius: 10,
                  padding: "12px 14px",
                }}
              >
                <strong style={{ color: "#92400E" }}>⚠️ Board Trap</strong>
                <p style={{ margin: "6px 0 0", color: "#92400E", lineHeight: 1.6 }}>
                  {current.board_trap}
                </p>
              </div>
            )}
          </div>
        )}

        {/* HIGH-YIELD — full width */}
        {isSubmitted && current.high_yield && (
          <div
            style={{
              gridColumn: "1 / -1",
              background: TEAL_SOFT,
              borderLeft: `4px solid ${TEAL}`,
              borderRadius: 10,
              padding: "16px 20px",
            }}
          >
            <strong style={{ color: TEAL, fontSize: 15 }}>⭐ High-Yield</strong>
            <p style={{ margin: "8px 0 0", color: "#134E4A", lineHeight: 1.7, whiteSpace: "pre-wrap" }}>
              {current.high_yield}
            </p>
          </div>
        )}
      </div>

      {/* BOTTOM BAR */}
      <div
        style={{
          position: "sticky",
          bottom: 0,
          background: "#fff",
          borderTop: `1px solid ${BORDER}`,
          padding: "12px 20px",
          display: "flex",
          alignItems: "center",
          gap: 12,
        }}
      >
        <button onClick={goPrev} disabled={idx === 0} style={ghostBtn}>
          ← Previous
        </button>
        <div style={{ flex: 1 }} />
        {reviewMode ? (
          <button onClick={() => setPhase("summary")} style={primaryBtn}>
            Back to summary
          </button>
        ) : (
          <button onClick={finishBlock} style={{ ...ghostBtn, color: RED, borderColor: RED }}>
            End block
          </button>
        )}
        <div style={{ flex: 1 }} />
        <button onClick={goNext} disabled={idx >= questions.length - 1} style={ghostBtn}>
          Next →
        </button>
      </div>
    </div>
  );
}

/* ================================================================== */
/*  SETUP SCREEN                                                      */
/* ================================================================== */
function Setup(props) {
  const {
    loadingMeta, systems, subjects, counts,
    pickedSystems, pickedSubjects, toggleSystem, toggleSubject,
    toggleAllSystems, toggleAllSubjects,
    numQuestions, setNumQuestions, availableCount,
    mode, setMode, startBlock, starting, setupError,
  } = props;

  const hasSubjects = pickedSubjects.length > 0;

  return (
    <div style={{ minHeight: "100vh", background: "#fff", padding: "40px 20px" }}>
      <div style={{ maxWidth: 880, margin: "0 auto" }}>
        <h1 style={{ fontSize: 26, margin: "0 0 4px", color: TEXT }}>Create Question Block</h1>
        <p style={{ color: MUTED, margin: "0 0 28px", fontSize: 14 }}>
          Select systems and subjects to build your block.
        </p>

        {loadingMeta ? (
          <p style={{ color: MUTED }}>Loading…</p>
        ) : (
          <>
            <FilterSection
              title="Systems"
              items={systems}
              picked={pickedSystems}
              counts={counts.bySystem}
              onToggle={toggleSystem}
              onToggleAll={toggleAllSystems}
              emptyText="No systems configured yet."
            />

            <FilterSection
              title="Subjects"
              items={subjects}
              picked={pickedSubjects}
              counts={counts.bySubject}
              onToggle={toggleSubject}
              onToggleAll={toggleAllSubjects}
              emptyText="No subjects available yet."
            />

            {/* COUNT */}
            {hasSubjects && (
              <div style={{ marginBottom: 28 }}>
                <h3 style={{ margin: "0 0 12px", fontSize: 16, color: TEXT }}>Number of questions</h3>
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <input
                    type="number"
                    min={1}
                    max={availableCount}
                    value={numQuestions}
                    onChange={(e) => setNumQuestions(Number(e.target.value))}
                    style={{ width: 110, padding: "10px 12px", fontSize: 16, border: `1px solid ${BORDER}`, borderRadius: 8 }}
                  />
                  <span style={{ color: MUTED }}>
                    {availableCount} question{availableCount === 1 ? "" : "s"} available
                  </span>
                </div>
              </div>
            )}

            {/* MODE */}
            {hasSubjects && (
              <div style={{ marginBottom: 28 }}>
                <h3 style={{ margin: "0 0 12px", fontSize: 16, color: TEXT }}>Mode</h3>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                  <ModeCard
                    active={mode === "tutor"}
                    onClick={() => setMode("tutor")}
                    title="Tutor Mode"
                    desc="See the explanation right after each question."
                  />
                  <ModeCard
                    active={mode === "timed"}
                    onClick={() => setMode("timed")}
                    title="Timed Mode"
                    desc={`${Math.round((Math.min(numQuestions, availableCount) * SECONDS_PER_Q) / 60)} min for the block · explanations at the end.`}
                  />
                </div>
              </div>
            )}

            {setupError && <p style={{ color: RED, marginTop: 8 }}>{setupError}</p>}

            {hasSubjects && (
              <button
                onClick={startBlock}
                disabled={starting || availableCount === 0}
                style={{
                  ...primaryBtn,
                  width: "100%",
                  marginTop: 12,
                  padding: "16px",
                  fontSize: 17,
                  opacity: starting || availableCount === 0 ? 0.6 : 1,
                  cursor: starting || availableCount === 0 ? "not-allowed" : "pointer",
                }}
              >
                {starting ? "Building block…" : "Create Block"}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/* UWorld-style filter list: master toggle + "(picked/total)" + 3-col rows. */
function FilterSection({ title, items, picked, counts, onToggle, onToggleAll, emptyText }) {
  const allOn = items.length > 0 && picked.length === items.length;
  return (
    <div style={{ marginBottom: 30 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
        <Toggle on={allOn} onClick={onToggleAll} />
        <strong style={{ fontSize: 16, color: TEXT }}>
          {title} ({picked.length}/{items.length})
        </strong>
      </div>
      {items.length === 0 ? (
        <Empty>{emptyText}</Empty>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
          {items.map((it) => {
            const on = picked.includes(it.id);
            return (
              <button
                key={it.id}
                onClick={() => onToggle(it.id)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "12px 14px",
                  border: `1px solid ${BORDER}`,
                  borderRadius: 8,
                  background: "#fff",
                  cursor: "pointer",
                  textAlign: "left",
                  width: "100%",
                }}
              >
                <Checkbox on={on} />
                <span style={{ flex: 1, minWidth: 0, fontSize: 14, color: TEXT, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {it.name}
                </span>
                <span style={{ color: BLUE, fontWeight: 700, fontSize: 14, width: 40, textAlign: "right", flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>
                  {counts[it.id] || 0}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Toggle({ on, onClick }) {
  return (
    <button
      onClick={onClick}
      role="switch"
      aria-checked={on}
      style={{
        width: 38,
        height: 22,
        borderRadius: 999,
        border: "none",
        cursor: "pointer",
        background: on ? BLUE : "#CBD5E1",
        position: "relative",
        padding: 0,
        flexShrink: 0,
        transition: "background .15s",
      }}
    >
      <span style={{ position: "absolute", top: 2, left: on ? 18 : 2, width: 18, height: 18, borderRadius: "50%", background: "#fff", transition: "left .15s" }} />
    </button>
  );
}

function Checkbox({ on }) {
  return (
    <span
      style={{
        width: 18,
        height: 18,
        borderRadius: 3,
        flexShrink: 0,
        border: `1.5px solid ${on ? BLUE : "#CBD5E1"}`,
        background: on ? BLUE : "#fff",
        color: "#fff",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 12,
        fontWeight: 800,
      }}
    >
      {on ? "✓" : ""}
    </span>
  );
}

/* ================================================================== */
/*  SUMMARY SCREEN                                                    */
/* ================================================================== */
function Summary({ questions, selected, flagged, elapsed, mode, subjectName, openReview, newBlock }) {
  const total = questions.length;
  const correct = questions.filter((q) => selected[q.id] === q.correct_answer).length;
  const pct = total ? Math.round((correct / total) * 100) : 0;
  const [onlyFlagged, setOnlyFlagged] = useState(false);

  const rows = onlyFlagged ? questions.filter((q) => flagged[q.id]) : questions;

  return (
    <div style={{ minHeight: "100vh", background: "#F8FAFC", padding: "40px 20px" }}>
      <div style={{ maxWidth: 980, margin: "0 auto" }}>
        <h1 style={{ fontSize: 28, margin: "0 0 24px" }}>Block Summary</h1>

        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 28 }}>
          <ScoreRing pct={pct} correct={correct} total={total} />
          <Stat label="Correct" value={correct} color={GREEN} />
          <Stat label="Incorrect" value={total - correct} color={RED} />
          <Stat label="Flagged" value={questions.filter((q) => flagged[q.id]).length} color={AMBER} />
          {mode === "timed" && <Stat label="Time" value={fmtTime(elapsed)} color={BLUE} />}
        </div>

        <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
          <button onClick={() => setOnlyFlagged(false)} style={onlyFlagged ? ghostBtn : primaryBtn}>
            All questions
          </button>
          <button onClick={() => setOnlyFlagged(true)} style={onlyFlagged ? primaryBtn : ghostBtn}>
            Review flagged
          </button>
          <div style={{ flex: 1 }} />
          <button onClick={newBlock} style={{ ...primaryBtn, background: GREEN }}>
            New Block
          </button>
        </div>

        <div style={{ background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 14, overflow: "hidden" }}>
          {rows.map((q, i) => {
            const realIdx = questions.indexOf(q);
            const picked = selected[q.id];
            const correctAns = picked === q.correct_answer;
            const answered = picked != null;
            return (
              <button
                key={q.id}
                onClick={() => openReview(realIdx)}
                style={{
                  width: "100%", display: "flex", alignItems: "center", gap: 14,
                  padding: "14px 18px", border: "none",
                  borderBottom: i < rows.length - 1 ? `1px solid ${BORDER}` : "none",
                  background: "#fff", cursor: "pointer", textAlign: "left",
                }}
              >
                <span style={{ width: 28, color: MUTED, fontWeight: 700 }}>{realIdx + 1}</span>
                <span
                  style={{
                    width: 26, height: 26, borderRadius: "50%", flexShrink: 0,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    color: "#fff", fontWeight: 700,
                    background: !answered ? "#94A3B8" : correctAns ? GREEN : RED,
                  }}
                >
                  {!answered ? "–" : correctAns ? "✓" : "✗"}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, color: TEXT }}>{q.topic || "Untitled"}</div>
                  <div style={{ fontSize: 13, color: MUTED }}>{subjectName(q.subject_id)}</div>
                </div>
                {flagged[q.id] && <span style={{ color: AMBER }}>⚑</span>}
                <span style={{ color: MUTED }}>Review →</span>
              </button>
            );
          })}
          {rows.length === 0 && (
            <div style={{ padding: 24, textAlign: "center", color: MUTED }}>No flagged questions.</div>
          )}
        </div>
      </div>
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

const primaryBtn = {
  background: BLUE, color: "#fff", border: "none", borderRadius: 10,
  padding: "12px 24px", fontWeight: 700, fontSize: 15, cursor: "pointer",
};
const ghostBtn = {
  background: "#fff", color: TEXT, border: `1px solid ${BORDER}`, borderRadius: 10,
  padding: "10px 18px", fontWeight: 600, fontSize: 14, cursor: "pointer",
};
function ModeCard({ active, onClick, title, desc }) {
  return (
    <button
      onClick={onClick}
      style={{
        textAlign: "left", padding: "16px 18px", borderRadius: 10, cursor: "pointer",
        border: `1.5px solid ${active ? BLUE : BORDER}`,
        background: "#fff",
      }}
    >
      <div style={{ fontWeight: 700, color: TEXT }}>{title}</div>
      <div style={{ fontSize: 13, color: MUTED, marginTop: 4, lineHeight: 1.5 }}>{desc}</div>
    </button>
  );
}

function Stat({ label, value, color }) {
  return (
    <div style={{ background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 12, padding: "16px 22px", minWidth: 120 }}>
      <div style={{ fontSize: 26, fontWeight: 800, color }}>{value}</div>
      <div style={{ fontSize: 13, color: MUTED, marginTop: 2 }}>{label}</div>
    </div>
  );
}

function ScoreRing({ pct, correct, total }) {
  const color = pct >= 70 ? GREEN : pct >= 50 ? AMBER : RED;
  return (
    <div
      style={{
        background: "#fff", border: `1px solid ${BORDER}`, borderRadius: 12,
        padding: 18, display: "flex", alignItems: "center", gap: 16,
      }}
    >
      <div
        style={{
          width: 80, height: 80, borderRadius: "50%",
          background: `conic-gradient(${color} ${pct * 3.6}deg, #E2E8F0 0deg)`,
          display: "flex", alignItems: "center", justifyContent: "center",
        }}
      >
        <div
          style={{
            width: 60, height: 60, borderRadius: "50%", background: "#fff",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontWeight: 800, fontSize: 18, color,
          }}
        >
          {pct}%
        </div>
      </div>
      <div>
        <div style={{ fontSize: 28, fontWeight: 800, color: TEXT }}>
          {correct} / {total}
        </div>
        <div style={{ fontSize: 13, color: MUTED }}>Score</div>
      </div>
    </div>
  );
}

function Pill({ children, bg, style }) {
  return (
    <span style={{ background: bg, padding: "4px 10px", borderRadius: 999, fontSize: 12, fontWeight: 600, ...style }}>
      {children}
    </span>
  );
}

function IconBtn({ children, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: NAVY_2, color: "#fff", border: "1px solid #475569",
        borderRadius: 6, padding: "4px 8px", cursor: "pointer", fontSize: 13, fontWeight: 700,
      }}
    >
      {children}
    </button>
  );
}

function Empty({ children }) {
  return (
    <div style={{ padding: 16, border: `1px dashed ${BORDER}`, borderRadius: 10, color: MUTED }}>
      {children}
    </div>
  );
}

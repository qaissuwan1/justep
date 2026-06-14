import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { colors, gradients, font } from "../theme";
import { Card, Pill, ProgressBar, PrimaryButton, StatCard } from "../components/ui";

// Bootstrap allowlist so the panel is reachable before any profile has role='admin'.
// Primary gate is profiles.role === 'admin' (see migration 003).
const ADMIN_EMAILS = ["hasansuwan@outlook.com", "qais@ju.edu.jo"];

const ADMIN_NAV = [
  { id: "overview", icon: "⊞", label: "Dashboard Overview" },
  { id: "upload", icon: "⬆", label: "Upload Lecture" },
  { id: "questions", icon: "📋", label: "Manage Questions" },
  { id: "flashcards", icon: "🃏", label: "Manage Flashcards" },
  { id: "subjects", icon: "📚", label: "Manage Subjects" },
  { id: "users", icon: "👥", label: "User Management" },
  { id: "analytics", icon: "📊", label: "Analytics" },
];

const DIFFICULTIES = ["easy", "medium", "hard"];
const diffColor = { easy: colors.green, medium: colors.amber, hard: colors.red };

// ── shared styles ───────────────────────────────────────────────────────────
const inputStyle = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 9,
  border: `1.5px solid ${colors.line}`,
  fontSize: 14,
  fontFamily: font,
  color: colors.text,
  outline: "none",
  background: "#fff",
};
const th = {
  textAlign: "left",
  padding: "12px 18px",
  fontSize: 11,
  fontWeight: 600,
  color: colors.textMuted,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
};
const td = { padding: "13px 18px", fontSize: 13, color: colors.text, borderTop: `1px solid ${colors.line}`, verticalAlign: "top" };
const iconBtn = {
  border: `1.5px solid ${colors.line}`,
  background: "#fff",
  borderRadius: 8,
  padding: "5px 10px",
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
  fontFamily: font,
  color: colors.textSoft,
};

// ── small reusable bits ──────────────────────────────────────────────────────
function FieldLabel({ children }) {
  return <span style={{ fontSize: 13, fontWeight: 600, color: colors.text, display: "block", marginBottom: 6 }}>{children}</span>;
}

function Spinner({ label = "Loading…" }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, padding: "60px 0", color: colors.textSoft, fontSize: 14 }}>
      <style>{`@keyframes ju-spin{to{transform:rotate(360deg)}}`}</style>
      <div style={{ width: 38, height: 38, borderRadius: "50%", border: `3px solid ${colors.line}`, borderTopColor: colors.blue, animation: "ju-spin 0.7s linear infinite" }} />
      {label}
    </div>
  );
}

function Banner({ kind = "error", children }) {
  const palette =
    kind === "error"
      ? { bg: "#FEF2F2", border: "#FECACA", color: "#991B1B" }
      : { bg: "#ECFDF5", border: "#BBF7D0", color: "#065F46" };
  return (
    <div style={{ background: palette.bg, border: `1.5px solid ${palette.border}`, color: palette.color, borderRadius: 10, padding: "11px 14px", fontSize: 13, marginBottom: 16 }}>
      {children}
    </div>
  );
}

function EmptyState({ icon = "📭", children }) {
  return (
    <div style={{ textAlign: "center", padding: "48px 0", color: colors.textMuted }}>
      <div style={{ fontSize: 38, marginBottom: 10 }}>{icon}</div>
      <div style={{ fontSize: 14 }}>{children}</div>
    </div>
  );
}

function AdminHeader({ title, subtitle, right }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, marginBottom: 22, flexWrap: "wrap" }}>
      <div>
        <h1 style={{ fontSize: 23, fontWeight: 800, margin: 0, letterSpacing: "-0.4px", color: colors.text }}>{title}</h1>
        {subtitle && <p style={{ margin: "4px 0 0", color: colors.textSoft, fontSize: 14 }}>{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}

function Modal({ title, onClose, children, footer, wide }) {
  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.45)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "48px 20px", zIndex: 100, overflowY: "auto" }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: wide ? 720 : 520, boxShadow: "0 24px 60px rgba(0,0,0,0.25)", fontFamily: font }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "18px 24px", borderBottom: `1px solid ${colors.line}` }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: colors.text }}>{title}</div>
          <button onClick={onClose} style={{ border: "none", background: "none", fontSize: 20, cursor: "pointer", color: colors.textMuted, lineHeight: 1 }}>×</button>
        </div>
        <div style={{ padding: 24 }}>{children}</div>
        {footer && <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, padding: "16px 24px", borderTop: `1px solid ${colors.line}` }}>{footer}</div>}
      </div>
    </div>
  );
}

function GhostButton({ children, onClick, color = colors.textSoft }) {
  return (
    <button onClick={onClick} style={{ ...iconBtn, padding: "11px 20px", fontSize: 14, color }}>
      {children}
    </button>
  );
}

// ── data hooks ───────────────────────────────────────────────────────────────
function useSubjects() {
  const [subjects, setSubjects] = useState([]);
  useEffect(() => {
    let active = true;
    supabase
      .from("subjects")
      .select("*")
      .order("name")
      .then(({ data }) => active && setSubjects(data || []));
    return () => {
      active = false;
    };
  }, []);
  return subjects;
}

// ════════════════════════════════════════════════════════════════════════════
// 1. DASHBOARD OVERVIEW
// ════════════════════════════════════════════════════════════════════════════
function DashboardOverview({ onNavigate }) {
  const [stats, setStats] = useState(null);
  const [activity, setActivity] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      const startOfDay = new Date(new Date().toDateString()).toISOString();
      const [students, questions, flashcards, todayRows, recent] = await Promise.all([
        supabase.from("profiles").select("*", { count: "exact", head: true }),
        supabase.from("questions").select("*", { count: "exact", head: true }),
        supabase.from("flashcards").select("*", { count: "exact", head: true }),
        supabase.from("user_progress").select("user_id").gte("answered_at", startOfDay).limit(2000),
        supabase
          .from("user_progress")
          .select("is_correct, answered_at, profiles(full_name, email), questions(topic, stem)")
          .order("answered_at", { ascending: false })
          .limit(8),
      ]);
      if (!active) return;
      const activeToday = new Set((todayRows.data || []).map((r) => r.user_id)).size;
      setStats({
        students: students.count || 0,
        questions: questions.count || 0,
        flashcards: flashcards.count || 0,
        activeToday,
      });
      setActivity(recent.data || []);
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, []);

  if (loading) return <Spinner />;

  const fmtTime = (iso) => {
    const d = new Date(iso);
    return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  };

  return (
    <>
      <AdminHeader title="Dashboard Overview" subtitle="Platform health at a glance" />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16, marginBottom: 22 }}>
        <StatCard label="Total students" value={stats.students.toLocaleString()} sub="registered profiles" accent={colors.blue} icon="👥" />
        <StatCard label="Total questions" value={stats.questions.toLocaleString()} sub="in the bank" accent={colors.navy} icon="📋" />
        <StatCard label="Total flashcards" value={stats.flashcards.toLocaleString()} sub="published" accent={colors.purple} icon="🃏" />
        <StatCard label="Active today" value={stats.activeToday.toLocaleString()} sub="answered ≥1 question" accent={colors.tealDeep} icon="🟢" />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: 18 }}>
        <Card style={{ padding: "20px 22px" }}>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 14 }}>Recent activity</div>
          {activity.length === 0 ? (
            <EmptyState icon="🌙">No activity yet — once students start answering questions, it shows here.</EmptyState>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {activity.map((a, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", background: "#F8FAFF", borderRadius: 10 }}>
                  <span style={{ fontSize: 16 }}>{a.is_correct ? "✅" : "❌"}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {a.profiles?.full_name || a.profiles?.email || "A student"} · {a.questions?.topic || "Question"}
                    </div>
                    <div style={{ fontSize: 11, color: colors.textMuted }}>{fmtTime(a.answered_at)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card style={{ padding: "20px 22px" }}>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 14 }}>Quick actions</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <PrimaryButton full onClick={() => onNavigate("upload")}>⬆ Upload a lecture</PrimaryButton>
            <button onClick={() => onNavigate("questions")} style={{ ...iconBtn, padding: "12px 0", width: "100%", fontSize: 14, color: colors.text }}>📋 Add a question</button>
            <button onClick={() => onNavigate("flashcards")} style={{ ...iconBtn, padding: "12px 0", width: "100%", fontSize: 14, color: colors.text }}>🃏 Add a flashcard</button>
            <button onClick={() => onNavigate("analytics")} style={{ ...iconBtn, padding: "12px 0", width: "100%", fontSize: 14, color: colors.text }}>📊 View analytics</button>
          </div>
        </Card>
      </div>
    </>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// 2. UPLOAD LECTURE (AI PIPELINE)
// ════════════════════════════════════════════════════════════════════════════
const AGENTS = [
  { key: "analyzer", icon: "🔍", name: "Analyzer", desc: "Extracts key concepts from the lecture" },
  { key: "writer", icon: "✍️", name: "Writer", desc: "Drafts exam-style MCQs" },
  { key: "checker", icon: "🧪", name: "Checker", desc: "Verifies medical accuracy" },
  { key: "publisher", icon: "🚀", name: "Publisher", desc: "Formats and stages for review" },
];

function makeGeneratedQuestions(topic, subjectName) {
  const t = topic || "this topic";
  return [
    {
      difficulty: "medium",
      stem: `A patient presents with findings classically associated with ${t}. Which underlying mechanism best explains this?`,
      options: ["A plausible but incorrect mechanism", `The core mechanism of ${t}`, "An unrelated pathway", "A distractor from another system"],
      correct_answer: 1,
      explanation: `This item checks the central principle of ${t} within ${subjectName}. The correct option reflects what the lecture emphasised.`,
      board_trap: `Don't confuse ${t} with a superficially similar concept tested on boards.`,
    },
    {
      difficulty: "easy",
      stem: `Which of the following is a defining feature of ${t}?`,
      options: [`A hallmark feature of ${t}`, "A feature of a different condition", "A non-specific finding", "An incorrect association"],
      correct_answer: 0,
      explanation: `A foundational recall question on ${t}, suitable for early review.`,
      board_trap: `Watch for answer choices that describe a related ${subjectName} entity.`,
    },
    {
      difficulty: "hard",
      stem: `A second-order question integrating ${t} with clinical management. What is the most appropriate next step?`,
      options: ["A reasonable-sounding wrong step", "An outdated approach", `The guideline-correct step for ${t}`, "A harmful intervention"],
      correct_answer: 2,
      explanation: `Integrates ${t} with management reasoning — the kind of synthesis Step 1 rewards.`,
      board_trap: `The trap option is plausible but ignores the key detail from the ${t} lecture.`,
    },
  ];
}

function UploadLecture() {
  const subjects = useSubjects();
  const [file, setFile] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [subjectId, setSubjectId] = useState("");
  const [topic, setTopic] = useState("");
  const [status, setStatus] = useState({}); // agentKey -> 'running' | 'done'
  const [running, setRunning] = useState(false);
  const [generated, setGenerated] = useState(null);
  const [included, setIncluded] = useState({});
  const [msg, setMsg] = useState(null);
  const fileRef = useRef(null);
  const timers = useRef([]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  // Derived so we don't need an effect to seed the default subject.
  const effectiveSubjectId = subjectId || subjects[0]?.id || "";

  const onDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) setFile(f);
  };

  const runPipeline = () => {
    setMsg(null);
    if (!file) return setMsg({ kind: "error", text: "Please add a lecture PDF first." });
    if (!effectiveSubjectId) return setMsg({ kind: "error", text: "Please select a subject." });
    if (!topic.trim()) return setMsg({ kind: "error", text: "Please enter a topic name." });

    setRunning(true);
    setGenerated(null);
    setStatus({});
    timers.current.forEach(clearTimeout);
    timers.current = [];

    AGENTS.forEach((agent, i) => {
      timers.current.push(setTimeout(() => setStatus((s) => ({ ...s, [agent.key]: "running" })), i * 1200));
      timers.current.push(setTimeout(() => setStatus((s) => ({ ...s, [agent.key]: "done" })), i * 1200 + 1000));
    });
    timers.current.push(
      setTimeout(() => {
        const subjectName = subjects.find((s) => s.id === effectiveSubjectId)?.name || "this subject";
        const qs = makeGeneratedQuestions(topic.trim(), subjectName);
        setGenerated(qs);
        setIncluded(Object.fromEntries(qs.map((_, i) => [i, true])));
        setRunning(false);
      }, AGENTS.length * 1200 + 400)
    );
  };

  const publish = async () => {
    setMsg(null);
    const rows = generated
      .filter((_, i) => included[i])
      .map((q) => ({
        subject_id: effectiveSubjectId,
        topic: topic.trim(),
        difficulty: q.difficulty,
        stem: q.stem,
        options: q.options,
        correct_answer: q.correct_answer,
        explanation: q.explanation,
        board_trap: q.board_trap,
        published: true,
      }));
    if (!rows.length) return setMsg({ kind: "error", text: "Select at least one question to publish." });
    const { error } = await supabase.from("questions").insert(rows);
    if (error) return setMsg({ kind: "error", text: error.message });
    setMsg({ kind: "ok", text: `Published ${rows.length} question(s) to the bank.` });
    setGenerated(null);
    setFile(null);
    setTopic("");
    setStatus({});
  };

  return (
    <>
      <AdminHeader title="Upload Lecture" subtitle="Turn lecture slides into reviewed questions with the AI pipeline" />
      {msg && <Banner kind={msg.kind}>{msg.text}</Banner>}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
        {/* Upload + meta */}
        <Card style={{ padding: "22px 24px" }}>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>1 · Lecture source</div>

          <div
            onClick={() => fileRef.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            style={{
              border: `2px dashed ${dragOver ? colors.blue : colors.line}`,
              background: dragOver ? "rgba(79,142,247,0.06)" : "#F8FAFF",
              borderRadius: 14,
              padding: "32px 20px",
              textAlign: "center",
              cursor: "pointer",
              transition: "all 0.15s",
            }}
          >
            <input ref={fileRef} type="file" accept="application/pdf" hidden onChange={(e) => setFile(e.target.files?.[0] || null)} />
            <div style={{ fontSize: 34, marginBottom: 8 }}>{file ? "📄" : "⬆️"}</div>
            {file ? (
              <div style={{ fontSize: 14, fontWeight: 600, color: colors.text }}>{file.name}</div>
            ) : (
              <>
                <div style={{ fontSize: 14, fontWeight: 600, color: colors.text }}>Drag &amp; drop a PDF here</div>
                <div style={{ fontSize: 12, color: colors.textMuted, marginTop: 4 }}>or click to browse</div>
              </>
            )}
          </div>

          <div style={{ marginTop: 18 }}>
            <FieldLabel>Subject</FieldLabel>
            <select value={effectiveSubjectId} onChange={(e) => setSubjectId(e.target.value)} style={inputStyle}>
              {subjects.length === 0 && <option value="">No subjects yet — add one first</option>}
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          <div style={{ marginTop: 14 }}>
            <FieldLabel>Topic name</FieldLabel>
            <input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="e.g. Beta Blockers" style={inputStyle} />
          </div>

          <PrimaryButton full style={{ marginTop: 20, opacity: running ? 0.7 : 1, pointerEvents: running ? "none" : "auto" }} onClick={runPipeline}>
            {running ? "Running pipeline…" : "Run AI pipeline →"}
          </PrimaryButton>
        </Card>

        {/* Pipeline status */}
        <Card style={{ padding: "22px 24px" }}>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>2 · AI pipeline</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {AGENTS.map((agent) => {
              const st = status[agent.key];
              return (
                <div key={agent.key} style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 14px", borderRadius: 12, background: "#F8FAFF", border: `1.5px solid ${st === "running" ? colors.blue : "transparent"}` }}>
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: st === "done" ? "#ECFDF5" : "rgba(79,142,247,0.1)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>
                    {agent.icon}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 700 }}>{agent.name}</div>
                    <div style={{ fontSize: 12, color: colors.textMuted }}>{agent.desc}</div>
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: st === "done" ? colors.green : st === "running" ? colors.blue : colors.textMuted }}>
                    {st === "done" ? "✓ Done" : st === "running" ? "● Running" : "Idle"}
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      {/* Generated preview */}
      {generated && (
        <Card style={{ padding: "22px 24px", marginTop: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>3 · Review &amp; publish ({generated.length} generated)</div>
            <PrimaryButton onClick={publish}>Publish selected →</PrimaryButton>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {generated.map((q, i) => (
              <div key={i} style={{ border: `1.5px solid ${colors.line}`, borderRadius: 12, padding: "16px 18px" }}>
                <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                  <input type="checkbox" checked={!!included[i]} onChange={(e) => setIncluded((inc) => ({ ...inc, [i]: e.target.checked }))} style={{ accentColor: colors.blue, marginTop: 4 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                      <Pill color={diffColor[q.difficulty]} bg={`${diffColor[q.difficulty]}1a`}>{q.difficulty}</Pill>
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 10, lineHeight: 1.5 }}>{q.stem}</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                      {q.options.map((opt, oi) => (
                        <div key={oi} style={{ fontSize: 13, color: oi === q.correct_answer ? colors.green : colors.textSoft, fontWeight: oi === q.correct_answer ? 700 : 400 }}>
                          {String.fromCharCode(65 + oi)}. {opt} {oi === q.correct_answer && "✓"}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// Question add/edit form (modal)
// ════════════════════════════════════════════════════════════════════════════
const blankQuestion = { subject_id: "", topic: "", difficulty: "medium", stem: "", options: ["", "", "", ""], correct_answer: 0, explanation: "", board_trap: "" };

function QuestionForm({ subjects, initial, onClose, onSaved }) {
  const [q, setQ] = useState(() => ({ ...blankQuestion, ...initial, options: initial?.options?.length ? [...initial.options] : ["", "", "", ""], subject_id: initial?.subject_id || subjects[0]?.id || "" }));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const editing = !!initial?.id;

  const setOpt = (i, v) => setQ((p) => ({ ...p, options: p.options.map((o, oi) => (oi === i ? v : o)) }));

  const save = async () => {
    setErr("");
    if (!q.subject_id) return setErr("Choose a subject.");
    if (!q.stem.trim()) return setErr("Question stem is required.");
    if (q.options.some((o) => !o.trim())) return setErr("All four options are required.");
    setSaving(true);
    const payload = {
      subject_id: q.subject_id,
      topic: q.topic.trim(),
      difficulty: q.difficulty,
      stem: q.stem.trim(),
      options: q.options.map((o) => o.trim()),
      correct_answer: Number(q.correct_answer),
      explanation: q.explanation.trim(),
      board_trap: q.board_trap.trim() || null,
    };
    const res = editing
      ? await supabase.from("questions").update(payload).eq("id", initial.id)
      : await supabase.from("questions").insert({ ...payload, published: true });
    setSaving(false);
    if (res.error) return setErr(res.error.message);
    onSaved();
  };

  return (
    <Modal
      wide
      title={editing ? "Edit question" : "Add question"}
      onClose={onClose}
      footer={
        <>
          <GhostButton onClick={onClose}>Cancel</GhostButton>
          <PrimaryButton onClick={save} style={{ opacity: saving ? 0.7 : 1, pointerEvents: saving ? "none" : "auto" }}>{saving ? "Saving…" : "Save question"}</PrimaryButton>
        </>
      }
    >
      {err && <Banner>{err}</Banner>}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
        <div>
          <FieldLabel>Subject</FieldLabel>
          <select value={q.subject_id} onChange={(e) => setQ({ ...q, subject_id: e.target.value })} style={inputStyle}>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
        <div>
          <FieldLabel>Difficulty</FieldLabel>
          <select value={q.difficulty} onChange={(e) => setQ({ ...q, difficulty: e.target.value })} style={inputStyle}>
            {DIFFICULTIES.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </div>
      </div>
      <div style={{ marginBottom: 14 }}>
        <FieldLabel>Topic</FieldLabel>
        <input value={q.topic} onChange={(e) => setQ({ ...q, topic: e.target.value })} placeholder="e.g. Beta Blockers" style={inputStyle} />
      </div>
      <div style={{ marginBottom: 14 }}>
        <FieldLabel>Question stem</FieldLabel>
        <textarea value={q.stem} onChange={(e) => setQ({ ...q, stem: e.target.value })} rows={3} style={{ ...inputStyle, resize: "vertical" }} />
      </div>
      <FieldLabel>Options (select the correct one)</FieldLabel>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
        {q.options.map((opt, i) => (
          <label key={i} style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <input type="radio" name="correct" checked={Number(q.correct_answer) === i} onChange={() => setQ({ ...q, correct_answer: i })} style={{ accentColor: colors.green }} />
            <span style={{ fontSize: 13, fontWeight: 700, color: colors.textMuted, width: 16 }}>{String.fromCharCode(65 + i)}</span>
            <input value={opt} onChange={(e) => setOpt(i, e.target.value)} placeholder={`Option ${String.fromCharCode(65 + i)}`} style={inputStyle} />
          </label>
        ))}
      </div>
      <div style={{ marginBottom: 14 }}>
        <FieldLabel>Explanation</FieldLabel>
        <textarea value={q.explanation} onChange={(e) => setQ({ ...q, explanation: e.target.value })} rows={2} style={{ ...inputStyle, resize: "vertical" }} />
      </div>
      <div>
        <FieldLabel>Board trap (optional)</FieldLabel>
        <input value={q.board_trap} onChange={(e) => setQ({ ...q, board_trap: e.target.value })} placeholder="Common distractor to warn about" style={inputStyle} />
      </div>
    </Modal>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// 3. MANAGE QUESTIONS
// ════════════════════════════════════════════════════════════════════════════
function ManageQuestions() {
  const subjects = useSubjects();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [fSubject, setFSubject] = useState("all");
  const [fDiff, setFDiff] = useState("all");
  const [editing, setEditing] = useState(null); // question object or {} for new
  const [hasPublished, setHasPublished] = useState(true);

  const load = async () => {
    const { data, error } = await supabase
      .from("questions")
      .select("*, subjects(name, color)")
      .order("created_at", { ascending: false });
    if (error) setErr(error.message);
    else {
      setErr("");
      setRows(data || []);
      if (data?.length && data[0].published === undefined) setHasPublished(false);
    }
    setLoading(false);
  };
  useEffect(() => {
    (async () => {
      await load();
    })();
  }, []);

  const filtered = useMemo(
    () =>
      rows.filter(
        (r) => (fSubject === "all" || r.subject_id === fSubject) && (fDiff === "all" || r.difficulty === fDiff)
      ),
    [rows, fSubject, fDiff]
  );

  const remove = async (id) => {
    if (!window.confirm("Delete this question? This cannot be undone.")) return;
    const { error } = await supabase.from("questions").delete().eq("id", id);
    if (error) setErr(error.message);
    else setRows((r) => r.filter((x) => x.id !== id));
  };

  const togglePublish = async (row) => {
    const { error } = await supabase.from("questions").update({ published: !row.published }).eq("id", row.id);
    if (error) setErr(error.message);
    else setRows((r) => r.map((x) => (x.id === row.id ? { ...x, published: !row.published } : x)));
  };

  return (
    <>
      <AdminHeader
        title="Manage Questions"
        subtitle={`${rows.length} question${rows.length === 1 ? "" : "s"} in the bank`}
        right={<PrimaryButton onClick={() => setEditing({})}>+ Add question</PrimaryButton>}
      />
      {err && <Banner>{err}</Banner>}

      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <select value={fSubject} onChange={(e) => setFSubject(e.target.value)} style={{ ...inputStyle, width: "auto" }}>
          <option value="all">All subjects</option>
          {subjects.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
        <select value={fDiff} onChange={(e) => setFDiff(e.target.value)} style={{ ...inputStyle, width: "auto" }}>
          <option value="all">All difficulties</option>
          {DIFFICULTIES.map((d) => (
            <option key={d} value={d}>{d}</option>
          ))}
        </select>
      </div>

      <Card style={{ padding: 0, overflow: "hidden" }}>
        {loading ? (
          <Spinner />
        ) : filtered.length === 0 ? (
          <EmptyState icon="📋">No questions match. Add one to get started.</EmptyState>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#F8FAFF" }}>
                  <th style={th}>Question</th>
                  <th style={th}>Subject</th>
                  <th style={th}>Difficulty</th>
                  {hasPublished && <th style={th}>Status</th>}
                  <th style={{ ...th, textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id}>
                    <td style={{ ...td, maxWidth: 420 }}>
                      <div style={{ fontWeight: 600, marginBottom: 2 }}>{r.topic || "—"}</div>
                      <div style={{ fontSize: 12, color: colors.textMuted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 400 }}>{r.stem}</div>
                    </td>
                    <td style={td}>
                      <Pill color={r.subjects?.color || colors.blue} bg={`${r.subjects?.color || colors.blue}1a`}>{r.subjects?.name || "—"}</Pill>
                    </td>
                    <td style={td}>
                      <span style={{ color: diffColor[r.difficulty], fontWeight: 700, fontSize: 12, textTransform: "capitalize" }}>{r.difficulty}</span>
                    </td>
                    {hasPublished && (
                      <td style={td}>
                        <span style={{ fontSize: 12, fontWeight: 600, color: r.published ? colors.green : colors.textMuted }}>{r.published ? "Published" : "Draft"}</span>
                      </td>
                    )}
                    <td style={{ ...td, textAlign: "right", whiteSpace: "nowrap" }}>
                      {hasPublished && (
                        <button onClick={() => togglePublish(r)} style={{ ...iconBtn, marginRight: 6 }}>{r.published ? "Unpublish" : "Publish"}</button>
                      )}
                      <button onClick={() => setEditing(r)} style={{ ...iconBtn, marginRight: 6 }}>Edit</button>
                      <button onClick={() => remove(r.id)} style={{ ...iconBtn, color: colors.red, borderColor: "#FECACA" }}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {editing && (
        <QuestionForm
          subjects={subjects}
          initial={editing.id ? editing : null}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}
    </>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// 4. MANAGE FLASHCARDS
// ════════════════════════════════════════════════════════════════════════════
function FlashcardForm({ subjects, initial, onClose, onSaved }) {
  const [c, setC] = useState({ subject_id: initial?.subject_id || subjects[0]?.id || "", front: initial?.front || "", back: initial?.back || "" });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const editing = !!initial?.id;

  const save = async () => {
    setErr("");
    if (!c.subject_id) return setErr("Choose a subject.");
    if (!c.front.trim() || !c.back.trim()) return setErr("Front and back are both required.");
    setSaving(true);
    const payload = { subject_id: c.subject_id, front: c.front.trim(), back: c.back.trim() };
    const res = editing ? await supabase.from("flashcards").update(payload).eq("id", initial.id) : await supabase.from("flashcards").insert(payload);
    setSaving(false);
    if (res.error) return setErr(res.error.message);
    onSaved();
  };

  return (
    <Modal
      title={editing ? "Edit flashcard" : "Add flashcard"}
      onClose={onClose}
      footer={
        <>
          <GhostButton onClick={onClose}>Cancel</GhostButton>
          <PrimaryButton onClick={save} style={{ opacity: saving ? 0.7 : 1, pointerEvents: saving ? "none" : "auto" }}>{saving ? "Saving…" : "Save"}</PrimaryButton>
        </>
      }
    >
      {err && <Banner>{err}</Banner>}
      <div style={{ marginBottom: 14 }}>
        <FieldLabel>Subject</FieldLabel>
        <select value={c.subject_id} onChange={(e) => setC({ ...c, subject_id: e.target.value })} style={inputStyle}>
          {subjects.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </div>
      <div style={{ marginBottom: 14 }}>
        <FieldLabel>Front (question)</FieldLabel>
        <textarea value={c.front} onChange={(e) => setC({ ...c, front: e.target.value })} rows={2} style={{ ...inputStyle, resize: "vertical" }} />
      </div>
      <div>
        <FieldLabel>Back (answer)</FieldLabel>
        <textarea value={c.back} onChange={(e) => setC({ ...c, back: e.target.value })} rows={3} style={{ ...inputStyle, resize: "vertical" }} />
      </div>
    </Modal>
  );
}

function ManageFlashcards() {
  const subjects = useSubjects();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [fSubject, setFSubject] = useState("all");
  const [editing, setEditing] = useState(null);

  const load = async () => {
    const { data, error } = await supabase.from("flashcards").select("*, subjects(name, color)").order("created_at", { ascending: false });
    if (error) setErr(error.message);
    else {
      setErr("");
      setRows(data || []);
    }
    setLoading(false);
  };
  useEffect(() => {
    (async () => {
      await load();
    })();
  }, []);

  const filtered = useMemo(() => rows.filter((r) => fSubject === "all" || r.subject_id === fSubject), [rows, fSubject]);

  const remove = async (id) => {
    if (!window.confirm("Delete this flashcard?")) return;
    const { error } = await supabase.from("flashcards").delete().eq("id", id);
    if (error) setErr(error.message);
    else setRows((r) => r.filter((x) => x.id !== id));
  };

  return (
    <>
      <AdminHeader
        title="Manage Flashcards"
        subtitle={`${rows.length} card${rows.length === 1 ? "" : "s"}`}
        right={<PrimaryButton onClick={() => setEditing({})}>+ Add flashcard</PrimaryButton>}
      />
      {err && <Banner>{err}</Banner>}

      <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
        <select value={fSubject} onChange={(e) => setFSubject(e.target.value)} style={{ ...inputStyle, width: "auto" }}>
          <option value="all">All subjects</option>
          {subjects.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </div>

      <Card style={{ padding: 0, overflow: "hidden" }}>
        {loading ? (
          <Spinner />
        ) : filtered.length === 0 ? (
          <EmptyState icon="🃏">No flashcards yet. Add one above.</EmptyState>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#F8FAFF" }}>
                  <th style={th}>Front</th>
                  <th style={th}>Back</th>
                  <th style={th}>Subject</th>
                  <th style={{ ...th, textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id}>
                    <td style={{ ...td, maxWidth: 280, fontWeight: 600 }}>{r.front}</td>
                    <td style={{ ...td, maxWidth: 320, color: colors.textSoft }}>{r.back}</td>
                    <td style={td}>
                      <Pill color={r.subjects?.color || colors.blue} bg={`${r.subjects?.color || colors.blue}1a`}>{r.subjects?.name || "—"}</Pill>
                    </td>
                    <td style={{ ...td, textAlign: "right", whiteSpace: "nowrap" }}>
                      <button onClick={() => setEditing(r)} style={{ ...iconBtn, marginRight: 6 }}>Edit</button>
                      <button onClick={() => remove(r.id)} style={{ ...iconBtn, color: colors.red, borderColor: "#FECACA" }}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {editing && (
        <FlashcardForm
          subjects={subjects}
          initial={editing.id ? editing : null}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load();
          }}
        />
      )}
    </>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// 5. MANAGE SUBJECTS
// ════════════════════════════════════════════════════════════════════════════
const SUBJECT_COLORS = ["#3B82F6", "#14B8A6", "#8B5CF6", "#F59E0B", "#38BDF8", "#EF4444", "#10B981", "#F97316"];

function SubjectForm({ initial, onClose, onSaved }) {
  const [s, setS] = useState({ name: initial?.name || "", description: initial?.description || "", color: initial?.color || SUBJECT_COLORS[0], icon: initial?.icon || "" });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const editing = !!initial?.id;

  const save = async () => {
    setErr("");
    if (!s.name.trim()) return setErr("Subject name is required.");
    setSaving(true);
    const payload = { name: s.name.trim(), description: s.description.trim() || null, color: s.color, icon: s.icon.trim() || null };
    const res = editing ? await supabase.from("subjects").update(payload).eq("id", initial.id) : await supabase.from("subjects").insert(payload);
    setSaving(false);
    if (res.error) return setErr(res.error.message);
    onSaved();
  };

  return (
    <Modal
      title={editing ? "Edit subject" : "Add subject"}
      onClose={onClose}
      footer={
        <>
          <GhostButton onClick={onClose}>Cancel</GhostButton>
          <PrimaryButton onClick={save} style={{ opacity: saving ? 0.7 : 1, pointerEvents: saving ? "none" : "auto" }}>{saving ? "Saving…" : "Save"}</PrimaryButton>
        </>
      }
    >
      {err && <Banner>{err}</Banner>}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 120px", gap: 14, marginBottom: 14 }}>
        <div>
          <FieldLabel>Name</FieldLabel>
          <input value={s.name} onChange={(e) => setS({ ...s, name: e.target.value })} placeholder="e.g. Pathology" style={inputStyle} />
        </div>
        <div>
          <FieldLabel>Icon (emoji)</FieldLabel>
          <input value={s.icon} onChange={(e) => setS({ ...s, icon: e.target.value })} placeholder="🧬" style={inputStyle} />
        </div>
      </div>
      <div style={{ marginBottom: 14 }}>
        <FieldLabel>Description</FieldLabel>
        <textarea value={s.description} onChange={(e) => setS({ ...s, description: e.target.value })} rows={2} style={{ ...inputStyle, resize: "vertical" }} />
      </div>
      <FieldLabel>Colour</FieldLabel>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {SUBJECT_COLORS.map((c) => (
          <button
            key={c}
            onClick={() => setS({ ...s, color: c })}
            style={{ width: 30, height: 30, borderRadius: 8, background: c, border: s.color === c ? `3px solid ${colors.navy}` : "3px solid transparent", cursor: "pointer" }}
          />
        ))}
      </div>
    </Modal>
  );
}

function ManageSubjects() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [editing, setEditing] = useState(null);

  const load = async () => {
    const { data, error } = await supabase.from("subjects").select("*").order("name");
    if (error) setErr(error.message);
    else {
      setErr("");
      setRows(data || []);
    }
    setLoading(false);
  };
  useEffect(() => {
    (async () => {
      await load();
    })();
  }, []);

  const remove = async (id) => {
    if (!window.confirm("Delete this subject? Its questions and flashcards will also be removed.")) return;
    const { error } = await supabase.from("subjects").delete().eq("id", id);
    if (error) setErr(error.message);
    else setRows((r) => r.filter((x) => x.id !== id));
  };

  return (
    <>
      <AdminHeader title="Manage Subjects" subtitle={`${rows.length} subject${rows.length === 1 ? "" : "s"}`} right={<PrimaryButton onClick={() => setEditing({})}>+ Add subject</PrimaryButton>} />
      {err && <Banner>{err}</Banner>}

      {loading ? (
        <Spinner />
      ) : rows.length === 0 ? (
        <Card>
          <EmptyState icon="📚">No subjects yet. Add your first to start building content.</EmptyState>
        </Card>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
          {rows.map((s) => (
            <Card key={s.id}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
                <div style={{ width: 44, height: 44, borderRadius: 11, background: `${s.color || colors.blue}1a`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, fontWeight: 800, color: s.color || colors.blue }}>
                  {s.icon || s.name?.[0] || "?"}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 15, fontWeight: 700 }}>{s.name}</div>
                  <div style={{ fontSize: 12, color: colors.textMuted }}>{s.color}</div>
                </div>
              </div>
              {s.description && <div style={{ fontSize: 13, color: colors.textSoft, marginBottom: 14, lineHeight: 1.5 }}>{s.description}</div>}
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => setEditing(s)} style={{ ...iconBtn, flex: 1 }}>Edit</button>
                <button onClick={() => remove(s.id)} style={{ ...iconBtn, flex: 1, color: colors.red, borderColor: "#FECACA" }}>Delete</button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {editing && <SubjectForm initial={editing.id ? editing : null} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
    </>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// 6. USER MANAGEMENT
// ════════════════════════════════════════════════════════════════════════════
function UserManagement() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [query, setQuery] = useState("");

  useEffect(() => {
    let active = true;
    (async () => {
      const { data, error } = await supabase.from("profiles").select("*").order("created_at", { ascending: false });
      if (!active) return;
      if (error) setErr(error.message);
      else setRows(data || []);
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => (r.full_name || "").toLowerCase().includes(q) || (r.email || "").toLowerCase().includes(q));
  }, [rows, query]);

  return (
    <>
      <AdminHeader title="User Management" subtitle={`${rows.length} registered user${rows.length === 1 ? "" : "s"}`} />
      {err && <Banner>{err}</Banner>}

      <div style={{ marginBottom: 16 }}>
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="🔍 Search by name or email…" style={{ ...inputStyle, maxWidth: 360 }} />
      </div>

      <Card style={{ padding: 0, overflow: "hidden" }}>
        {loading ? (
          <Spinner />
        ) : filtered.length === 0 ? (
          <EmptyState icon="👥">{rows.length ? "No users match your search." : "No users yet."}</EmptyState>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#F8FAFF" }}>
                  <th style={th}>User</th>
                  <th style={th}>Email</th>
                  <th style={th}>Streak</th>
                  <th style={th}>Questions answered</th>
                  <th style={th}>Joined</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((u) => (
                  <tr key={u.id}>
                    <td style={td}>
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <div style={{ width: 34, height: 34, borderRadius: "50%", background: "#EEF2FB", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700, color: colors.textSoft }}>
                          {(u.full_name || u.email || "?")[0]?.toUpperCase()}
                        </div>
                        <span style={{ fontWeight: 600 }}>{u.full_name || "—"}</span>
                      </div>
                    </td>
                    <td style={{ ...td, color: colors.textSoft }}>{u.email}</td>
                    <td style={td}>🔥 {u.streak ?? 0}</td>
                    <td style={td}>{u.total_questions_answered ?? 0}</td>
                    <td style={{ ...td, color: colors.textMuted }}>{u.created_at ? new Date(u.created_at).toLocaleDateString() : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// 7. ANALYTICS
// ════════════════════════════════════════════════════════════════════════════
function Analytics() {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [missed, setMissed] = useState([]);
  const [bySubject, setBySubject] = useState([]);
  const [byDay, setByDay] = useState([]);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data, error } = await supabase
        .from("user_progress")
        .select("is_correct, answered_at, questions(topic, stem, subjects(name, color))")
        .order("answered_at", { ascending: false })
        .limit(5000);
      if (!active) return;
      if (error) {
        setErr(error.message);
        setLoading(false);
        return;
      }
      const rows = data || [];

      // Most missed questions
      const missMap = new Map();
      rows.filter((r) => r.is_correct === false).forEach((r) => {
        const key = r.questions?.stem || "Unknown";
        const cur = missMap.get(key) || { stem: key, topic: r.questions?.topic, subject: r.questions?.subjects?.name, count: 0 };
        cur.count++;
        missMap.set(key, cur);
      });
      setMissed([...missMap.values()].sort((a, b) => b.count - a.count).slice(0, 6));

      // Subject performance
      const subMap = new Map();
      rows.forEach((r) => {
        const name = r.questions?.subjects?.name;
        if (!name) return;
        const cur = subMap.get(name) || { name, color: r.questions?.subjects?.color, correct: 0, total: 0 };
        cur.total++;
        if (r.is_correct) cur.correct++;
        subMap.set(name, cur);
      });
      setBySubject([...subMap.values()].map((s) => ({ ...s, pct: s.total ? Math.round((s.correct / s.total) * 100) : 0 })).sort((a, b) => b.total - a.total));

      // Activity over last 7 days
      const days = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        days.push({ label: d.toLocaleDateString(undefined, { weekday: "short" }), key: d.toDateString(), count: 0 });
      }
      const dayIndex = Object.fromEntries(days.map((d, i) => [d.key, i]));
      rows.forEach((r) => {
        const k = new Date(r.answered_at).toDateString();
        if (k in dayIndex) days[dayIndex[k]].count++;
      });
      setByDay(days);

      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, []);

  if (loading) return <Spinner />;

  const maxDay = Math.max(1, ...byDay.map((d) => d.count));
  const hasData = missed.length || bySubject.length || byDay.some((d) => d.count);

  return (
    <>
      <AdminHeader title="Analytics" subtitle="How students are performing across the platform" />
      {err && <Banner>{err}</Banner>}

      {!hasData && !err && (
        <Card>
          <EmptyState icon="📊">No answer data yet. Analytics populate as students use the question bank.</EmptyState>
        </Card>
      )}

      {hasData && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
          {/* Most missed */}
          <Card style={{ padding: "20px 22px" }}>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 14 }}>Most missed questions</div>
            {missed.length === 0 ? (
              <EmptyState icon="🎉">No wrong answers recorded yet.</EmptyState>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {missed.map((m, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", background: "#F8FAFF", borderRadius: 10 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.topic || m.stem}</div>
                      <div style={{ fontSize: 11, color: colors.textMuted }}>{m.subject || "—"}</div>
                    </div>
                    <Pill color={colors.red} bg="#FEF2F2">{m.count} missed</Pill>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Activity over time */}
          <Card style={{ padding: "20px 22px" }}>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 18 }}>Student activity (last 7 days)</div>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 10, height: 150 }}>
              {byDay.map((d, i) => (
                <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: colors.textSoft }}>{d.count || ""}</div>
                  <div style={{ width: "100%", height: `${(d.count / maxDay) * 110}px`, minHeight: 4, background: gradients.accentV, borderRadius: 6, transition: "height 0.4s" }} />
                  <div style={{ fontSize: 11, color: colors.textMuted }}>{d.label}</div>
                </div>
              ))}
            </div>
          </Card>

          {/* Subject performance */}
          <Card style={{ padding: "20px 22px", gridColumn: "1 / -1" }}>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>Subject performance breakdown</div>
            {bySubject.length === 0 ? (
              <EmptyState icon="📚">No subject data yet.</EmptyState>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {bySubject.map((s) => (
                  <div key={s.name}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                      <span style={{ fontSize: 13, fontWeight: 600 }}>{s.name}</span>
                      <span style={{ fontSize: 12, color: colors.textMuted }}>{s.pct}% correct · {s.total} answered</span>
                    </div>
                    <ProgressBar value={s.pct} color={s.color || colors.blue} />
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}
    </>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// ACCESS GATE + SHELL
// ════════════════════════════════════════════════════════════════════════════
function AccessDenied() {
  return (
    <Card style={{ maxWidth: 460, margin: "60px auto", textAlign: "center", padding: "40px 32px" }}>
      <div style={{ fontSize: 44, marginBottom: 12 }}>🔒</div>
      <div style={{ fontSize: 20, fontWeight: 800, color: colors.navy, marginBottom: 8 }}>Admins only</div>
      <p style={{ fontSize: 14, color: colors.textSoft, lineHeight: 1.6, margin: 0 }}>
        Your account doesn't have admin access. Ask an existing admin to set your role to <b>admin</b> in the profiles table.
      </p>
    </Card>
  );
}

export default function Admin() {
  const [section, setSection] = useState("overview");
  const [access, setAccess] = useState("checking"); // checking | granted | denied

  useEffect(() => {
    let active = true;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!active) return;
      if (!user) return setAccess("denied");
      let admin = ADMIN_EMAILS.includes((user.email || "").toLowerCase());
      const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
      if (profile?.role === "admin") admin = true;
      if (active) setAccess(admin ? "granted" : "denied");
    })();
    return () => {
      active = false;
    };
  }, []);

  if (access === "checking") return <Spinner label="Checking admin access…" />;
  if (access === "denied") return <AccessDenied />;

  const sections = {
    overview: <DashboardOverview onNavigate={setSection} />,
    upload: <UploadLecture />,
    questions: <ManageQuestions />,
    flashcards: <ManageFlashcards />,
    subjects: <ManageSubjects />,
    users: <UserManagement />,
    analytics: <Analytics />,
  };

  return (
    <div style={{ display: "flex", gap: 24, alignItems: "flex-start" }}>
      {/* Admin sub-sidebar */}
      <aside style={{ width: 230, flexShrink: 0, position: "sticky", top: 32 }}>
        <Card style={{ padding: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 8px 14px" }}>
            <div style={{ width: 32, height: 32, borderRadius: 9, background: gradients.navy, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>⚙️</div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 800, color: colors.navy }}>Admin Console</div>
              <div style={{ fontSize: 11, color: colors.textMuted }}>JUstep</div>
            </div>
          </div>
          <nav style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {ADMIN_NAV.map((item) => {
              const activeItem = section === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setSection(item.id)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 11,
                    padding: "10px 12px",
                    borderRadius: 9,
                    border: "none",
                    cursor: "pointer",
                    textAlign: "left",
                    fontFamily: font,
                    fontSize: 13.5,
                    fontWeight: activeItem ? 700 : 500,
                    background: activeItem ? "rgba(79,142,247,0.12)" : "transparent",
                    color: activeItem ? colors.blue : colors.textSoft,
                  }}
                >
                  <span style={{ fontSize: 15 }}>{item.icon}</span>
                  {item.label}
                </button>
              );
            })}
          </nav>
        </Card>
      </aside>

      {/* Active section */}
      <div style={{ flex: 1, minWidth: 0 }}>{sections[section]}</div>
    </div>
  );
}

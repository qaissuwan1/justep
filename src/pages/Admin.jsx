import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { colors, gradients, font } from "../theme";
import { Card, Pill, ProgressBar, PrimaryButton, StatCard } from "../components/ui";
import StudentAnalytics from "../components/StudentAnalytics";
import LecturePipeline from "../components/LecturePipeline";
import ImportJson from "../components/ImportJson";
import { computeStreak, dayKey } from "../lib/progress";
import { useLectures } from "../lib/useLectures";
import { useTopics } from "../lib/useTopics";

// Bootstrap allowlist so the panel is reachable before any profile has role='admin'.
// Primary gate is profiles.role === 'admin' (see migration 003).
const ADMIN_EMAILS = ["hasansuwan@outlook.com", "qais@ju.edu.jo"];

const ADMIN_NAV = [
  { id: "overview", icon: "⊞", label: "Dashboard Overview" },
  { id: "upload", icon: "⬆", label: "Upload Lecture" },
  { id: "importJson", icon: "📥", label: "Import JSON" },
  { id: "questions", icon: "📋", label: "Manage Questions" },
  { id: "flashcards", icon: "🃏", label: "Manage Flashcards" },
  { id: "subjects", icon: "📚", label: "Manage Subjects" },
  { id: "lectures", icon: "🎓", label: "Manage Lectures" },
  { id: "systems", icon: "🗂️", label: "Manage Systems" },
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
      <div style={{ width: 38, height: 38, borderRadius: "50%", border: `3px solid ${colors.line}`, borderTopColor: colors.blue, animation: "spin 0.7s linear infinite" }} />
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
        supabase.from("questions").select("*", { count: "exact", head: true }).is("deleted_at", null),
        supabase.from("flashcards").select("*", { count: "exact", head: true }).is("deleted_at", null),
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

function UploadLecture() {
  return (
    <>
      <AdminHeader title="Upload Lecture" subtitle="Turn a lecture PDF into reviewed questions and flashcards with the AI pipeline" />
      <LecturePipeline />
    </>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// Question add/edit form (modal)
// ════════════════════════════════════════════════════════════════════════════
const blankQuestion = { subject_id: "", lecture_id: "", topic_id: "", difficulty: "medium", stem: "", options: ["", "", "", "", ""], correct_answer: 0, explanation: "", board_trap: "", high_yield: "" };

// Pad an options array to 5 slots (A–E) so the editor always shows five inputs.
// Legacy questions saved with 4 options get an empty 5th; trailing empties are
// dropped again on save so we never inject a blank choice into the bank.
const padOptions = (arr) => {
  const a = (arr || []).map((o) => o ?? "");
  while (a.length < 5) a.push("");
  return a;
};

function QuestionForm({ subjects, initial, onClose, onSaved }) {
  const [q, setQ] = useState(() => ({ ...blankQuestion, ...initial, options: padOptions(initial?.options), subject_id: initial?.subject_id || subjects[0]?.id || "", lecture_id: initial?.lecture_id || "", topic_id: initial?.topic_id || "" }));
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const editing = !!initial?.id;
  const lectures = useLectures(q.subject_id);
  const topics = useTopics(q.subject_id);

  const setOpt = (i, v) => setQ((p) => ({ ...p, options: p.options.map((o, oi) => (oi === i ? v : o)) }));

  const save = async () => {
    setErr("");
    if (!q.subject_id) return setErr("Choose a subject.");
    if (!q.stem.trim()) return setErr("Question stem is required.");
    // Options are flexible (4 or 5). Require at least two, filled contiguously
    // from A, and a correct answer that points at a filled option.
    const opts = q.options.map((o) => (o || "").trim());
    let lastFilled = -1;
    opts.forEach((o, i) => { if (o) lastFilled = i; });
    if (lastFilled < 1) return setErr("Provide at least two options.");
    const trimmedOpts = opts.slice(0, lastFilled + 1);
    if (trimmedOpts.some((o) => !o)) return setErr("Fill options in order (A, B, C…) with no blank gaps.");
    if (Number(q.correct_answer) > lastFilled) return setErr("The correct answer must be one of the filled options.");
    setSaving(true);
    const payload = {
      subject_id: q.subject_id,
      topic_id: q.topic_id || null,
      difficulty: q.difficulty,
      stem: q.stem.trim(),
      options: trimmedOpts,
      correct_answer: Number(q.correct_answer),
      explanation: q.explanation.trim(),
      board_trap: q.board_trap.trim() || null,
      high_yield: q.high_yield.trim() || null,
      lecture_id: q.lecture_id || null,
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
          <select value={q.subject_id} onChange={(e) => setQ({ ...q, subject_id: e.target.value, lecture_id: "", topic_id: "" })} style={inputStyle}>
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
        <FieldLabel>Lecture (optional)</FieldLabel>
        <select value={q.lecture_id} onChange={(e) => setQ({ ...q, lecture_id: e.target.value })} style={inputStyle}>
          <option value="">— No lecture —</option>
          {lectures.map((l) => (
            <option key={l.id} value={l.id}>{l.title}</option>
          ))}
        </select>
      </div>
      <div style={{ marginBottom: 14 }}>
        <FieldLabel>Topic</FieldLabel>
        <select value={q.topic_id} onChange={(e) => setQ({ ...q, topic_id: e.target.value })} style={inputStyle}>
          <option value="">— No topic —</option>
          {topics.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
      </div>
      <div style={{ marginBottom: 14 }}>
        <FieldLabel>Question stem</FieldLabel>
        <textarea value={q.stem} onChange={(e) => setQ({ ...q, stem: e.target.value })} rows={4} style={{ ...inputStyle, resize: "vertical" }} />
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
        <textarea value={q.explanation} onChange={(e) => setQ({ ...q, explanation: e.target.value })} rows={4} style={{ ...inputStyle, resize: "vertical" }} />
      </div>
      <div style={{ marginBottom: 14 }}>
        <FieldLabel>Board trap (optional)</FieldLabel>
        <textarea value={q.board_trap} onChange={(e) => setQ({ ...q, board_trap: e.target.value })} rows={2} placeholder="Common distractor to warn about" style={{ ...inputStyle, resize: "vertical" }} />
      </div>
      <div>
        <FieldLabel>High-Yield summary (optional)</FieldLabel>
        <textarea value={q.high_yield} onChange={(e) => setQ({ ...q, high_yield: e.target.value })} rows={2} placeholder="Key takeaway students should remember" style={{ ...inputStyle, resize: "vertical" }} />
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
  const [fTopic, setFTopic] = useState("all");
  const [fDiff, setFDiff] = useState("all");
  const [editing, setEditing] = useState(null); // question object, or {subject_id} for new
  const [hasPublished, setHasPublished] = useState(true);
  const [notice, setNotice] = useState("");
  const filterTopics = useTopics(fSubject === "all" ? null : fSubject);

  const load = async () => {
    const { data, error } = await supabase
      .from("questions")
      .select("*, subjects(name, color), topics(name)")
      .is("deleted_at", null)
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
        (r) =>
          (fSubject === "all" || r.subject_id === fSubject) &&
          (fTopic === "all" || r.topic_id === fTopic) &&
          (fDiff === "all" || r.difficulty === fDiff)
      ),
    [rows, fSubject, fTopic, fDiff]
  );

  const remove = async (id) => {
    if (!window.confirm("Delete this question? It will be hidden from students; attempt history is kept.")) return;
    const { error } = await supabase.from("questions").update({ deleted_at: new Date().toISOString() }).eq("id", id);
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
        right={<PrimaryButton onClick={() => setEditing({ subject_id: fSubject !== "all" ? fSubject : "" })}>+ Add question</PrimaryButton>}
      />
      {err && <Banner>{err}</Banner>}
      {notice && <Banner kind="success">{notice}</Banner>}

      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <select value={fSubject} onChange={(e) => { setFSubject(e.target.value); setFTopic("all"); }} style={{ ...inputStyle, width: "auto" }}>
          <option value="all">All subjects</option>
          {subjects.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
        <select value={fTopic} onChange={(e) => setFTopic(e.target.value)} disabled={fSubject === "all"} style={{ ...inputStyle, width: "auto", opacity: fSubject === "all" ? 0.55 : 1 }}>
          <option value="all">{fSubject === "all" ? "All topics (pick a subject)" : "All topics"}</option>
          {filterTopics.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
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
                      <div style={{ fontWeight: 600, marginBottom: 2 }}>{r.topics?.name || r.topic || "—"}</div>
                      <div style={{ fontSize: 12, color: colors.textMuted, maxWidth: 400 }}>{r.stem?.length > 80 ? `${r.stem.slice(0, 80)}…` : r.stem}</div>
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
          initial={editing.id ? editing : (editing.subject_id ? { subject_id: editing.subject_id } : null)}
          onClose={() => setEditing(null)}
          onSaved={() => {
            const wasEdit = !!editing.id;
            setEditing(null);
            load();
            setNotice(wasEdit ? "Question updated." : "Question added.");
            setTimeout(() => setNotice(""), 3000);
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
    const { data, error } = await supabase.from("flashcards").select("*, subjects(name, color)").is("deleted_at", null).order("created_at", { ascending: false });
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
    if (!window.confirm("Delete this flashcard? It will be hidden from students; review history is kept.")) return;
    const { error } = await supabase.from("flashcards").update({ deleted_at: new Date().toISOString() }).eq("id", id);
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
// MANAGE LECTURES
// ════════════════════════════════════════════════════════════════════════════
function LectureForm({ subjects, defaultSubject, initial, nextOrder, onClose, onSaved }) {
  const [l, setL] = useState({
    subject_id: initial?.subject_id || defaultSubject || subjects[0]?.id || "",
    title: initial?.title || "",
    description: initial?.description || "",
    order_index: initial?.order_index ?? nextOrder ?? 0,
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");
  const editing = !!initial?.id;

  const save = async () => {
    setErr("");
    if (!l.subject_id) return setErr("Choose a subject.");
    if (!l.title.trim()) return setErr("Lecture title is required.");
    setSaving(true);
    const payload = {
      subject_id: l.subject_id,
      title: l.title.trim(),
      description: l.description.trim() || null,
      order_index: Number(l.order_index) || 0,
    };
    const res = editing
      ? await supabase.from("lectures").update(payload).eq("id", initial.id)
      : await supabase.from("lectures").insert(payload);
    setSaving(false);
    if (res.error) return setErr(res.error.message);
    onSaved();
  };

  return (
    <Modal
      title={editing ? "Edit lecture" : "Add lecture"}
      onClose={onClose}
      footer={
        <>
          <GhostButton onClick={onClose}>Cancel</GhostButton>
          <PrimaryButton onClick={save} style={{ opacity: saving ? 0.7 : 1, pointerEvents: saving ? "none" : "auto" }}>{saving ? "Saving…" : "Save"}</PrimaryButton>
        </>
      }
    >
      {err && <Banner>{err}</Banner>}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 110px", gap: 14, marginBottom: 14 }}>
        <div>
          <FieldLabel>Subject</FieldLabel>
          <select value={l.subject_id} onChange={(e) => setL({ ...l, subject_id: e.target.value })} style={inputStyle}>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
        <div>
          <FieldLabel>Order</FieldLabel>
          <input type="number" value={l.order_index} onChange={(e) => setL({ ...l, order_index: e.target.value })} style={inputStyle} />
        </div>
      </div>
      <div style={{ marginBottom: 14 }}>
        <FieldLabel>Title</FieldLabel>
        <input value={l.title} onChange={(e) => setL({ ...l, title: e.target.value })} placeholder="e.g. Lecture 1 — Cell Injury" style={inputStyle} />
      </div>
      <div>
        <FieldLabel>Description</FieldLabel>
        <textarea value={l.description} onChange={(e) => setL({ ...l, description: e.target.value })} rows={2} placeholder="What this lecture covers" style={{ ...inputStyle, resize: "vertical" }} />
      </div>
    </Modal>
  );
}

function ManageLectures() {
  const subjects = useSubjects();
  const [subjectId, setSubjectId] = useState("");
  const [rows, setRows] = useState([]);
  const [qCount, setQCount] = useState({});
  const [fCount, setFCount] = useState({});
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [editing, setEditing] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const bump = () => setReloadKey((k) => k + 1);

  // Falls back to the first subject until the user picks one explicitly.
  const activeSubject = subjectId || subjects[0]?.id || "";

  useEffect(() => {
    if (!activeSubject) return;
    let active = true;
    (async () => {
      setLoading(true);
      const [lec, q, f] = await Promise.all([
        supabase.from("lectures").select("*").eq("subject_id", activeSubject).order("order_index").order("title"),
        supabase.from("questions").select("lecture_id").eq("subject_id", activeSubject).is("deleted_at", null),
        supabase.from("flashcards").select("lecture_id").eq("subject_id", activeSubject).is("deleted_at", null),
      ]);
      if (!active) return;
      if (lec.error) setErr(lec.error.message);
      else {
        setErr("");
        setRows(lec.data || []);
        const tally = (arr) => {
          const m = {};
          (arr || []).forEach((r) => {
            if (r.lecture_id) m[r.lecture_id] = (m[r.lecture_id] || 0) + 1;
          });
          return m;
        };
        setQCount(tally(q.data));
        setFCount(tally(f.data));
      }
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [activeSubject, reloadKey]);

  const remove = async (id) => {
    if (!window.confirm("Delete this lecture? Its questions and flashcards are kept but become unassigned.")) return;
    const { error } = await supabase.from("lectures").delete().eq("id", id);
    if (error) setErr(error.message);
    else bump();
  };

  // Reorder by swapping positions, then normalize order_index to 0..n-1 so it
  // sticks regardless of whatever the previous values were.
  const move = async (idx, dir) => {
    const next = idx + dir;
    if (next < 0 || next >= rows.length) return;
    const reordered = [...rows];
    [reordered[idx], reordered[next]] = [reordered[next], reordered[idx]];
    setRows(reordered.map((l, i) => ({ ...l, order_index: i }))); // optimistic
    const results = await Promise.all(
      reordered.map((l, i) => supabase.from("lectures").update({ order_index: i }).eq("id", l.id))
    );
    const bad = results.find((r) => r.error);
    if (bad) {
      setErr(bad.error.message);
      bump();
    }
  };

  return (
    <>
      <AdminHeader
        title="Manage Lectures"
        subtitle="Organize each subject's content into lectures"
        right={
          <PrimaryButton onClick={() => setEditing({})} style={activeSubject ? undefined : { opacity: 0.5, pointerEvents: "none" }}>
            + Add lecture
          </PrimaryButton>
        }
      />
      {err && <Banner>{err}</Banner>}

      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <select value={activeSubject} onChange={(e) => setSubjectId(e.target.value)} style={{ ...inputStyle, width: "auto" }}>
          {subjects.length === 0 && <option value="">No subjects yet</option>}
          {subjects.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </div>

      <Card style={{ padding: 0, overflow: "hidden" }}>
        {!activeSubject ? (
          <EmptyState icon="📚">Create a subject first, then add lectures to it.</EmptyState>
        ) : loading ? (
          <Spinner />
        ) : rows.length === 0 ? (
          <EmptyState icon="🎓">No lectures for this subject yet. Add the first one.</EmptyState>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#F8FAFF" }}>
                  <th style={{ ...th, width: 70 }}>Order</th>
                  <th style={th}>Lecture</th>
                  <th style={th}>Questions</th>
                  <th style={th}>Flashcards</th>
                  <th style={{ ...th, textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((l, i) => (
                  <tr key={l.id}>
                    <td style={td}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ fontWeight: 700, color: colors.textMuted, width: 18 }}>{i + 1}</span>
                        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                          <button onClick={() => move(i, -1)} disabled={i === 0} style={{ ...iconBtn, padding: "0 6px", lineHeight: 1.3, opacity: i === 0 ? 0.4 : 1 }}>▲</button>
                          <button onClick={() => move(i, 1)} disabled={i === rows.length - 1} style={{ ...iconBtn, padding: "0 6px", lineHeight: 1.3, opacity: i === rows.length - 1 ? 0.4 : 1 }}>▼</button>
                        </div>
                      </div>
                    </td>
                    <td style={{ ...td, maxWidth: 420 }}>
                      <div style={{ fontWeight: 600, marginBottom: 2 }}>{l.title}</div>
                      {l.description && <div style={{ fontSize: 12, color: colors.textMuted, lineHeight: 1.4 }}>{l.description}</div>}
                    </td>
                    <td style={td}>{qCount[l.id] || 0}</td>
                    <td style={td}>{fCount[l.id] || 0}</td>
                    <td style={{ ...td, textAlign: "right", whiteSpace: "nowrap" }}>
                      <button onClick={() => setEditing(l)} style={{ ...iconBtn, marginRight: 6 }}>Edit</button>
                      <button onClick={() => remove(l.id)} style={{ ...iconBtn, color: colors.red, borderColor: "#FECACA" }}>Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {editing && (
        <LectureForm
          subjects={subjects}
          defaultSubject={activeSubject}
          initial={editing.id ? editing : null}
          nextOrder={rows.length}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            bump();
          }}
        />
      )}
    </>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// MANAGE SYSTEMS
// ════════════════════════════════════════════════════════════════════════════
function ManageSystems() {
  const [systems, setSystems] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [name, setName] = useState("");
  const [color, setColor] = useState(SUBJECT_COLORS[0]);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const [sys, subs] = await Promise.all([
      supabase.from("systems").select("*").order("name"),
      supabase.from("subjects").select("id, name, color, system_id").order("name"),
    ]);
    if (sys.error) setErr(sys.error.message);
    else {
      setErr("");
      setSystems(sys.data || []);
      setSubjects(subs.data || []);
    }
    setLoading(false);
  };
  useEffect(() => {
    (async () => {
      await load();
    })();
  }, []);

  const addSystem = async () => {
    setErr("");
    if (!name.trim()) return setErr("System name is required.");
    setSaving(true);
    const { error } = await supabase.from("systems").insert({ name: name.trim(), color });
    setSaving(false);
    if (error) return setErr(error.message);
    setName("");
    load();
  };

  const removeSystem = async (id) => {
    if (!window.confirm("Delete this system? Subjects assigned to it will become unassigned.")) return;
    const { error } = await supabase.from("systems").delete().eq("id", id);
    if (error) setErr(error.message);
    else load();
  };

  const assignSubject = async (subjectId, systemId) => {
    const next = systemId || null;
    const { error } = await supabase.from("subjects").update({ system_id: next }).eq("id", subjectId);
    if (error) setErr(error.message);
    else setSubjects((subs) => subs.map((s) => (s.id === subjectId ? { ...s, system_id: next } : s)));
  };

  const subjectCount = (sysId) => subjects.filter((s) => s.system_id === sysId).length;

  const swatch = (c) => <span style={{ width: 12, height: 12, borderRadius: 4, background: c || colors.blue, display: "inline-block", flexShrink: 0 }} />;

  return (
    <>
      <AdminHeader title="Manage Systems" subtitle="Group subjects into organ systems / blocks" />
      {err && <Banner>{err}</Banner>}

      {/* Add system */}
      <Card style={{ marginBottom: 18 }}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 14 }}>Add a system</div>
        <div style={{ display: "flex", gap: 14, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <FieldLabel>Name</FieldLabel>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Cardiovascular" style={inputStyle} />
          </div>
          <div>
            <FieldLabel>Colour</FieldLabel>
            <div style={{ display: "flex", gap: 6 }}>
              {SUBJECT_COLORS.map((c) => (
                <button key={c} onClick={() => setColor(c)} style={{ width: 28, height: 28, borderRadius: 7, background: c, border: color === c ? `3px solid ${colors.navy}` : "3px solid transparent", cursor: "pointer" }} />
              ))}
            </div>
          </div>
          <PrimaryButton onClick={addSystem} style={{ opacity: saving ? 0.7 : 1, pointerEvents: saving ? "none" : "auto" }}>{saving ? "Adding…" : "Add system"}</PrimaryButton>
        </div>
      </Card>

      {/* Systems table */}
      <Card style={{ padding: 0, overflow: "hidden", marginBottom: 18 }}>
        {loading ? (
          <Spinner />
        ) : systems.length === 0 ? (
          <EmptyState icon="🗂️">No systems yet. Add one above.</EmptyState>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#F8FAFF" }}>
                <th style={th}>System</th>
                <th style={th}>Colour</th>
                <th style={th}>Subjects</th>
                <th style={{ ...th, textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {systems.map((s) => (
                <tr key={s.id}>
                  <td style={{ ...td, fontWeight: 600 }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>{swatch(s.color)}{s.name}</span>
                  </td>
                  <td style={{ ...td, color: colors.textMuted, fontSize: 12 }}>{s.color}</td>
                  <td style={td}>{subjectCount(s.id)}</td>
                  <td style={{ ...td, textAlign: "right" }}>
                    <button onClick={() => removeSystem(s.id)} style={{ ...iconBtn, color: colors.red, borderColor: "#FECACA" }}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {/* Assign subjects to systems */}
      <Card style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "18px 24px", borderBottom: `1px solid ${colors.line}`, fontSize: 15, fontWeight: 700 }}>Assign subjects to systems</div>
        {loading ? (
          <Spinner />
        ) : subjects.length === 0 ? (
          <EmptyState icon="📚">No subjects yet. Add subjects first.</EmptyState>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#F8FAFF" }}>
                <th style={th}>Subject</th>
                <th style={th}>System</th>
              </tr>
            </thead>
            <tbody>
              {subjects.map((s) => (
                <tr key={s.id}>
                  <td style={{ ...td, fontWeight: 600 }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 10 }}>{swatch(s.color)}{s.name}</span>
                  </td>
                  <td style={td}>
                    <select value={s.system_id || ""} onChange={(e) => assignSubject(s.id, e.target.value)} style={{ ...inputStyle, width: 260 }}>
                      <option value="">— Unassigned —</option>
                      {systems.map((sys) => (
                        <option key={sys.id} value={sys.id}>{sys.name}</option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// 6. USER MANAGEMENT
// ════════════════════════════════════════════════════════════════════════════
function UserManagement() {
  const [rows, setRows] = useState([]);
  const [statsByUser, setStatsByUser] = useState({});
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(null); // profile being inspected

  useEffect(() => {
    let active = true;
    (async () => {
      const [profilesRes, progressRes] = await Promise.all([
        supabase.from("profiles").select("*").order("created_at", { ascending: false }),
        supabase.from("user_progress").select("user_id, is_correct, answered_at"),
      ]);
      if (!active) return;
      if (profilesRes.error) setErr(profilesRes.error.message);
      else {
        setErr("");
        setRows(profilesRes.data || []);
      }
      // Aggregate progress per user (admin can read all rows via migration 006).
      const agg = {};
      (progressRes.data || []).forEach((r) => {
        const a = agg[r.user_id] || { total: 0, correct: 0, days: new Set() };
        a.total++;
        if (r.is_correct) a.correct++;
        a.days.add(dayKey(r.answered_at));
        agg[r.user_id] = a;
      });
      const byUser = {};
      Object.entries(agg).forEach(([uid, a]) => {
        byUser[uid] = { total: a.total, accuracy: a.total ? Math.round((a.correct / a.total) * 100) : 0, streak: computeStreak(a.days) };
      });
      setStatsByUser(byUser);
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

  // Detail view — identical layout to the student dashboard.
  if (selected) {
    return (
      <>
        <button
          onClick={() => setSelected(null)}
          style={{ ...iconBtn, padding: "9px 16px", fontSize: 14, marginBottom: 18 }}
        >
          ← Back to users
        </button>
        <StudentAnalytics userId={selected.id} mode="admin" />
      </>
    );
  }

  return (
    <>
      <AdminHeader title="User Management" subtitle={`${rows.length} registered user${rows.length === 1 ? "" : "s"} · click a row for full analytics`} />
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
                  <th style={th}>Questions</th>
                  <th style={th}>Accuracy</th>
                  <th style={th}>Streak</th>
                  <th style={th}>Joined</th>
                  <th style={th} />
                </tr>
              </thead>
              <tbody>
                {filtered.map((u) => {
                  const st = statsByUser[u.id];
                  const answered = st?.total || 0;
                  return (
                    <tr
                      key={u.id}
                      onClick={() => setSelected(u)}
                      style={{ cursor: "pointer" }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = "#F8FAFF")}
                      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                    >
                      <td style={td}>
                        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                          <div style={{ width: 34, height: 34, borderRadius: "50%", background: "#EEF2FB", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 700, color: colors.textSoft }}>
                            {(u.full_name || u.email || "?")[0]?.toUpperCase()}
                          </div>
                          <span style={{ fontWeight: 600 }}>{u.full_name || "—"}</span>
                        </div>
                      </td>
                      <td style={{ ...td, color: colors.textSoft }}>{u.email}</td>
                      <td style={td}>{answered}</td>
                      <td style={td}>
                        {answered ? (
                          <span style={{ fontWeight: 700, color: st.accuracy >= 70 ? colors.green : st.accuracy >= 50 ? colors.amber : colors.red }}>{st.accuracy}%</span>
                        ) : (
                          <span style={{ color: colors.textMuted }}>—</span>
                        )}
                      </td>
                      <td style={td}>🔥 {st?.streak || 0}</td>
                      <td style={{ ...td, color: colors.textMuted }}>{u.created_at ? new Date(u.created_at).toLocaleDateString() : "—"}</td>
                      <td style={{ ...td, textAlign: "right", color: colors.blue, fontWeight: 600, whiteSpace: "nowrap" }}>View →</td>
                    </tr>
                  );
                })}
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
    importJson: <ImportJson />,
    questions: <ManageQuestions />,
    flashcards: <ManageFlashcards />,
    subjects: <ManageSubjects />,
    lectures: <ManageLectures />,
    systems: <ManageSystems />,
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

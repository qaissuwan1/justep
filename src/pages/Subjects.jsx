import { useState, useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { colors, font } from "../theme";

import Skeleton, { ErrorState } from "../components/Skeleton";
import SessionBar, { SESSION_BAR_H } from "../components/SessionBar";
import { goToNextTask } from "../lib/session";

/* ------------------------------------------------------------------ */
/*  Library — 3-column browser: System → Subject → Topic (lecture)    */
/*  Each topic shows Active Recall (flashcards) + Questions progress  */
/* ------------------------------------------------------------------ */

export default function Subjects() {
  const navigate = useNavigate();

  const [searchParams] = useSearchParams();
  const lectureParam = searchParams.get("lecture");
  const sessionMode = searchParams.get("session") === "1";
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const [, setSystems] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [lectures, setLectures] = useState([]);

  // counts
  const [, setSysMeta] = useState({});   // systemId -> {subjects, topics}
  const [subMeta, setSubMeta] = useState({});   // subjectId -> {topics}
  const [lecMeta, setLecMeta] = useState({});   // lectureId -> {q, qDone, f, fDone}

  const [, setSelSys] = useState(null);
  const [selSub, setSelSub] = useState(null);
  const [highlightLec, setHighlightLec] = useState(null); // deep-linked lecture to glow

  const [userId, setUserId] = useState(null);
  const [lecProgress, setLecProgress] = useState({}); // lecture_id -> { status, started_at, completed_at }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(false);
      try {
        const { data: { user } } = await supabase.auth.getUser();
        const results = await Promise.all([
          supabase.from("systems").select("id,name,color").order("name"),
          supabase.from("subjects").select("id,name,color,system_id").is("deleted_at", null).order("name"),
          supabase.from("lectures").select("id,title,subject_id,order_index").is("deleted_at", null).order("order_index"),
          supabase.from("questions").select("id,subject_id,lecture_id").eq("published", true).is("deleted_at", null),
          supabase.from("flashcards").select("id,subject_id,lecture_id").is("deleted_at", null),
          user ? supabase.from("user_progress").select("question_id").eq("user_id", user.id) : Promise.resolve({ data: [] }),
          user ? supabase.from("flashcard_progress").select("flashcard_id").eq("user_id", user.id) : Promise.resolve({ data: [] }),
          user ? supabase.from("lecture_progress").select("lecture_id,status,started_at,completed_at").eq("user_id", user.id) : Promise.resolve({ data: [] }),
        ]);
        const failed = results.find((r) => r.error);
        if (failed) throw failed.error;
        const [{ data: sys }, { data: subs }, { data: lecs }, { data: qs }, { data: fcs }, prog, fprog, lprog] = results;

        const answeredQ = new Set((prog.data || []).map((p) => p.question_id));
        const reviewedF = new Set((fprog.data || []).map((p) => p.flashcard_id));

        // per-lecture counts
        const lm = {};
        const ensure = (id) => { if (id && !lm[id]) lm[id] = { q: 0, qDone: 0, f: 0, fDone: 0 }; };
        (qs || []).forEach((q) => { ensure(q.lecture_id); if (q.lecture_id) { lm[q.lecture_id].q++; if (answeredQ.has(q.id)) lm[q.lecture_id].qDone++; } });
        (fcs || []).forEach((f) => { ensure(f.lecture_id); if (f.lecture_id) { lm[f.lecture_id].f++; if (reviewedF.has(f.id)) lm[f.lecture_id].fDone++; } });

        // per-subject topic (lecture) count
        const sm = {};
        (subs || []).forEach((s) => (sm[s.id] = { topics: 0 }));
        (lecs || []).forEach((l) => { if (sm[l.subject_id]) sm[l.subject_id].topics++; });

        // per-system subject + topic counts
        const sysm = {};
        (sys || []).forEach((s) => (sysm[s.id] = { subjects: 0, topics: 0 }));
        (subs || []).forEach((s) => {
          if (sysm[s.system_id]) {
            sysm[s.system_id].subjects++;
            sysm[s.system_id].topics += sm[s.id]?.topics || 0;
          }
        });

        // per-user lecture progress
        const lp = {};
        (lprog.data || []).forEach((r) => { lp[r.lecture_id] = r; });

        if (cancelled) return;
        setUserId(user?.id || null);
        setSystems(sys || []);
        setSubjects(subs || []);
        setLectures(lecs || []);
        setLecMeta(lm);
        setSubMeta(sm);
        setSysMeta(sysm);
        setLecProgress(lp);

        // Deep-link: ?lecture=<id> — drill the columns to it and flag for highlight.
        if (lectureParam) {
          const lec = (lecs || []).find((l) => l.id === lectureParam);
          const sub = lec ? (subs || []).find((s) => s.id === lec.subject_id) : null;
          const system = sub ? (sys || []).find((y) => y.id === sub.system_id) : null;
          if (system) setSelSys(system);
          if (sub) setSelSub(sub);
          if (lec) setHighlightLec(lec.id);
        }
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadKey, lectureParam]);

  const retry = () => setReloadKey((k) => k + 1);

  // Record a lecture "open" (engagement). Fire-and-forget; never downgrades a
  // completed lecture back to in_progress; sets started_at only the first time.
  async function openLecture(id) {
    if (!userId) return;
    const now = new Date().toISOString();
    const existing = lecProgress[id];
    const status = existing?.status === "completed" ? "completed" : "in_progress";
    const startedAt = existing?.started_at ?? now;
    setLecProgress((p) => ({ ...p, [id]: { ...(p[id] || {}), status, started_at: startedAt } }));
    const { error } = await supabase
      .from("lecture_progress")
      .upsert({ user_id: userId, lecture_id: id, last_opened_at: now, started_at: startedAt, status }, { onConflict: "user_id,lecture_id" });
    if (error) console.error("lecture_progress open upsert failed:", error);
  }

  // Open the lecture's content + record the open without blocking navigation.
  const openAndGo = (id, path) => { openLecture(id); navigate(path); };

  async function markComplete(id) {
    if (!userId) return;
    const now = new Date().toISOString();
    const startedAt = lecProgress[id]?.started_at ?? now;
    setLecProgress((p) => ({ ...p, [id]: { ...(p[id] || {}), status: "completed", started_at: startedAt, completed_at: now } }));
    const { error } = await supabase
      .from("lecture_progress")
      .upsert({ user_id: userId, lecture_id: id, completed_at: now, last_opened_at: now, started_at: startedAt, status: "completed" }, { onConflict: "user_id,lecture_id" });
    if (error) console.error("lecture_progress complete upsert failed:", error);
  }

  const visibleSubjects = subjects;
  const visibleLectures = lectures.filter((l) => l.subject_id === selSub?.id);

  if (error) return <ErrorState onRetry={retry} />;
  if (loading) return <Skeleton height={320} radius={18} />;
  return <>
    {sessionMode && <SessionBar />}
    <div style={{paddingTop:sessionMode ? SESSION_BAR_H : 0}}>
      <header className="workspace-heading"><span className="eyebrow">YOUR CURRICULUM</span><h1>{selSub ? selSub.name : 'A place for every subject.'}</h1><p>Move through your lectures, practice what matters, and keep your progress in view.</p></header>
      {selSub && <button className="workspace-back" onClick={()=>setSelSub(null)}>← All subjects</button>}
      {!selSub ? <div className="subject-grid">{visibleSubjects.map((s,i)=><button className="subject-card" key={s.id} onClick={()=>setSelSub(s)}><span>SUBJECT {String(i+1).padStart(2,'0')}</span><strong>{s.name}</strong><span>{subMeta[s.id]?.topics || 0} lectures <span aria-hidden="true">↗</span></span></button>)}</div> : <div className="lecture-list">{visibleLectures.map(l=><LectureCard key={l.id} l={l} m={lecMeta[l.id] || {q:0,qDone:0,f:0,fDone:0}} prog={lecProgress[l.id]} onOpenNav={openAndGo} onComplete={markComplete} highlight={l.id===highlightLec}/>)}</div>}
      {(!subjects.length || (selSub && !visibleLectures.length)) && <div className="workspace-empty">Your curriculum is being prepared. Check back for new content.</div>}
    </div>
    {sessionMode && <button style={completeBtn} onClick={()=>goToNextTask(navigate)}>Next task →</button>}
  </>;
}

function LectureCard({ l, m, prog, onOpenNav, onComplete, highlight }) {
  const status = prog?.status || "not_started";
  const open = (path) => onOpenNav(l.id, `${path}?subject=${l.subject_id}&lecture=${l.id}`);
  const cardRef = useRef(null);
  const [glow, setGlow] = useState(!!highlight);
  useEffect(() => {
    if (!highlight) return;
    cardRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    const tmr = setTimeout(() => setGlow(false), 2000); // accent border fades after 2s
    return () => clearTimeout(tmr);
  }, [highlight]);
  return (
    <div ref={cardRef} style={{ ...topicCard, transition: "box-shadow .4s ease, border-color .4s ease", ...(glow ? { borderColor: colors.blue, boxShadow: `0 0 0 3px ${colors.blue}33` } : {}) }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <div style={{ fontWeight: 600, fontSize: 14, flex: 1, minWidth: 0 }}>{l.title}</div>
        <StatusPill status={status} />
      </div>
      {m.f > 0 && <ProgressRow icon="🧠" label="Active Recall" done={m.fDone} total={m.f} onClick={() => open("/app/flashcards")} />}
      {m.q > 0 && <ProgressRow icon="📝" label="Questions" done={m.qDone} total={m.q} onClick={() => open("/app/questions")} />}
      {m.f === 0 && m.q === 0 && <div style={{ fontSize: 12, color: colors.textSoft }}>No content yet.</div>}
      {status !== "completed" && (
        <div style={{ marginTop: 10, display: "flex", justifyContent: "flex-end" }}>
          <button onClick={() => onComplete(l.id)} style={completeBtn}>Mark as Complete</button>
        </div>
      )}
    </div>
  );
}

function StatusPill({ status }) {
  const map = {
    not_started: { label: "Not started", color: colors.textMuted, bg: colors.line },
    in_progress: { label: "In progress", color: colors.amber, bg: "#FFFBEB" },
    completed: { label: "✓ Completed", color: colors.green, bg: "#ECFDF5" },
  };
  const s = map[status] || map.not_started;
  return (
    <span style={{ fontSize: 11, fontWeight: 600, color: s.color, background: s.bg, borderRadius: 999, padding: "3px 9px", whiteSpace: "nowrap", flexShrink: 0 }}>
      {s.label}
    </span>
  );
}

function ProgressRow({ icon, label, done, total, onClick }) {
  const pct = total ? Math.round((done / total) * 100) : 0;
  return (
    <button onClick={onClick} style={progRow}>
      <span style={{ fontSize: 14 }}>{icon}</span>
      <span style={{ fontSize: 13, fontWeight: 600, color: colors.blue, flex: "0 0 auto" }}>{label}</span>
      <div style={{ flex: 1, height: 6, background: colors.line, borderRadius: 999, overflow: "hidden", margin: "0 4px" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: colors.blue, opacity: 0.5 }} />
      </div>
      <span style={{ fontSize: 12, color: colors.textSoft, fontVariantNumeric: "tabular-nums" }}>{done}/{total}</span>
    </button>
  );
}

const topicCard = { border: `1px solid ${colors.line}`, borderRadius: 12, padding: 14 };
const completeBtn = { fontSize: 12, fontWeight: 600, color: colors.blue, background: "#fff", border: `1px solid ${colors.line}`, borderRadius: 8, padding: "6px 12px", cursor: "pointer", fontFamily: font };
const progRow = {
  display: "flex", alignItems: "center", gap: 8, width: "100%", marginTop: 6,
  background: "#EFF4FF", border: "none", borderRadius: 8, padding: "8px 10px", cursor: "pointer", fontFamily: font,
};

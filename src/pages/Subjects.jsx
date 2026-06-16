import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { colors, font } from "../theme";

/* ------------------------------------------------------------------ */
/*  Library — 3-column browser: System → Subject → Topic (lecture)    */
/*  Each topic shows Active Recall (flashcards) + Questions progress  */
/* ------------------------------------------------------------------ */

export default function Subjects() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);

  const [systems, setSystems] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [lectures, setLectures] = useState([]);

  // counts
  const [sysMeta, setSysMeta] = useState({});   // systemId -> {subjects, topics}
  const [subMeta, setSubMeta] = useState({});   // subjectId -> {topics}
  const [lecMeta, setLecMeta] = useState({});   // lectureId -> {q, qDone, f, fDone}

  const [selSys, setSelSys] = useState(null);
  const [selSub, setSelSub] = useState(null);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      const [{ data: sys }, { data: subs }, { data: lecs }, { data: qs }, { data: fcs }, prog, fprog] =
        await Promise.all([
          supabase.from("systems").select("id,name,color").order("name"),
          supabase.from("subjects").select("id,name,color,system_id").order("name"),
          supabase.from("lectures").select("id,title,subject_id,order_index").order("order_index"),
          supabase.from("questions").select("id,subject_id,lecture_id").eq("published", true),
          supabase.from("flashcards").select("id,subject_id,lecture_id"),
          user ? supabase.from("user_progress").select("question_id").eq("user_id", user.id) : Promise.resolve({ data: [] }),
          user ? supabase.from("flashcard_progress").select("flashcard_id").eq("user_id", user.id) : Promise.resolve({ data: [] }),
        ]);

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

      setSystems(sys || []);
      setSubjects(subs || []);
      setLectures(lecs || []);
      setLecMeta(lm);
      setSubMeta(sm);
      setSysMeta(sysm);
      setLoading(false);
    })();
  }, []);

  const visibleSubjects = subjects.filter((s) => s.system_id === selSys?.id);
  const visibleLectures = lectures.filter((l) => l.subject_id === selSub?.id);

  if (loading) {
    return <div style={{ display: "flex", justifyContent: "center", paddingTop: 80 }}><div style={spinner} /></div>;
  }

  return (
    <div style={{ fontFamily: font, color: colors.text }}>
      <h1 style={{ fontSize: 24, margin: "0 0 4px" }}>Library</h1>
      <p style={{ color: colors.textSoft, margin: "0 0 20px", fontSize: 14 }}>
        Browse questions and active recall by system, subject, and topic.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1.3fr", gap: 0, border: `1px solid ${colors.line}`, borderRadius: 14, overflow: "hidden", minHeight: 460, background: colors.card }}>

        {/* COLUMN 1 — Systems */}
        <div style={{ borderRight: `1px solid ${colors.line}`, overflowY: "auto", maxHeight: 560 }}>
          <div style={colHeader}>Systems</div>
          {systems.map((s) => {
            const m = sysMeta[s.id] || { subjects: 0, topics: 0 };
            const active = selSys?.id === s.id;
            return (
              <button key={s.id} onClick={() => { setSelSys(s); setSelSub(null); }} style={rowItem(active)}>
                <div style={{ flex: 1, textAlign: "left" }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>{s.name}</div>
                  <div style={{ fontSize: 12, color: colors.textSoft, marginTop: 2 }}>{m.subjects} subjects · {m.topics} topics</div>
                </div>
                <span style={{ color: colors.textSoft }}>›</span>
              </button>
            );
          })}
          {systems.length === 0 && <div style={emptyMsg}>No systems yet.</div>}
        </div>

        {/* COLUMN 2 — Subjects */}
        <div style={{ borderRight: `1px solid ${colors.line}`, overflowY: "auto", maxHeight: 560 }}>
          <div style={colHeader}>{selSys ? "Subjects" : ""}</div>
          {!selSys ? (
            <div style={placeholder}>Select a system</div>
          ) : visibleSubjects.length === 0 ? (
            <div style={emptyMsg}>No subjects in this system.</div>
          ) : (
            visibleSubjects.map((s) => {
              const m = subMeta[s.id] || { topics: 0 };
              const active = selSub?.id === s.id;
              return (
                <button key={s.id} onClick={() => setSelSub(s)} style={rowItem(active)}>
                  <div style={{ flex: 1, textAlign: "left" }}>
                    <div style={{ fontWeight: 600, fontSize: 14, textTransform: "capitalize" }}>{s.name}</div>
                    <div style={{ fontSize: 12, color: colors.textSoft, marginTop: 2 }}>{m.topics} topics</div>
                  </div>
                  <span style={{ color: colors.textSoft }}>›</span>
                </button>
              );
            })
          )}
        </div>

        {/* COLUMN 3 — Topics (lectures) */}
        <div style={{ overflowY: "auto", maxHeight: 560 }}>
          <div style={colHeader}>{selSub ? selSub.name : ""}</div>
          {!selSub ? (
            <div style={placeholder}>Select a subject</div>
          ) : visibleLectures.length === 0 ? (
            <div style={emptyMsg}>No topics in this subject yet.</div>
          ) : (
            <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 12 }}>
              {visibleLectures.map((l) => {
                const m = lecMeta[l.id] || { q: 0, qDone: 0, f: 0, fDone: 0 };
                return (
                  <div key={l.id} style={topicCard}>
                    <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 10 }}>{l.title}</div>
                    {m.f > 0 && (
                      <ProgressRow icon="🧠" label="Active Recall" done={m.fDone} total={m.f}
                        onClick={() => navigate("/app/flashcards")} />
                    )}
                    {m.q > 0 && (
                      <ProgressRow icon="📝" label="Questions" done={m.qDone} total={m.q}
                        onClick={() => navigate("/app/questions")} />
                    )}
                    {m.f === 0 && m.q === 0 && (
                      <div style={{ fontSize: 12, color: colors.textSoft }}>No content yet.</div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
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

const colHeader = { padding: "12px 16px", fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em", color: colors.textSoft, borderBottom: `1px solid ${colors.line}`, position: "sticky", top: 0, background: colors.card, minHeight: 18 };
const rowItem = (active) => ({
  display: "flex", alignItems: "center", gap: 8, width: "100%",
  padding: "13px 16px", border: "none", borderBottom: `1px solid ${colors.line}`,
  background: active ? "#FEF3C7" : "transparent", cursor: "pointer", fontFamily: font, color: colors.text,
});
const topicCard = { border: `1px solid ${colors.line}`, borderRadius: 12, padding: 14 };
const progRow = {
  display: "flex", alignItems: "center", gap: 8, width: "100%", marginTop: 6,
  background: "#EFF4FF", border: "none", borderRadius: 8, padding: "8px 10px", cursor: "pointer", fontFamily: font,
};
const placeholder = { padding: "60px 20px", textAlign: "center", color: colors.textSoft, fontSize: 14 };
const emptyMsg = { padding: "24px 16px", color: colors.textSoft, fontSize: 13 };
const spinner = { width: 32, height: 32, border: `3px solid ${colors.line}`, borderTopColor: colors.blue, borderRadius: "50%", animation: "spin 0.8s linear infinite" };

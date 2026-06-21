import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { font } from "../theme";
import useIsMobile from "../lib/useIsMobile";
import Skeleton from "../components/Skeleton";

const DAY = 24 * 60 * 60 * 1000;
const startOfDay = (d) => { const x = new Date(d); x.setHours(0,0,0,0); return x; };
const addDays = (d, n) => new Date(startOfDay(d).getTime() + n * DAY);

function schedule(progress, rating, examDate) {
  let { repetitions = 0, interval_days = 0, ease_factor = 2.5 } = progress || {};
  if (rating === "again") {
    repetitions = 0; interval_days = 1; ease_factor = Math.max(1.3, ease_factor - 0.2);
  } else {
    if (repetitions === 0)      interval_days = 1;
    else if (repetitions === 1) interval_days = 3;
    else if (repetitions === 2) interval_days = 7;
    else {
      if (rating === "hard") interval_days = Math.max(2, Math.round(interval_days * 0.8 + 2));
      else if (rating === "good") interval_days = Math.max(4, Math.round(interval_days * 1.0 + 4));
      else if (rating === "easy") interval_days = Math.max(7, Math.round(interval_days * ease_factor));
    }
    if (rating === "easy") ease_factor = Math.min(3.0, ease_factor + 0.15);
    if (rating === "hard") ease_factor = Math.max(1.3, ease_factor - 0.15);
    repetitions += 1;
  }
  let next = addDays(new Date(), interval_days);
  if (examDate) {
    const exam = startOfDay(examDate);
    if (next > exam) {
      const tomorrow = addDays(new Date(), 1);
      next = exam > startOfDay(new Date()) ? (tomorrow < exam ? tomorrow : exam) : startOfDay(new Date());
    }
  }
  return { repetitions, interval_days, ease_factor, next_review: next.toISOString(), status: rating === "again" || repetitions < 3 ? "learning" : "known" };
}

function intervalLabel(rating, progress, examDate) {
  const d = schedule(progress, rating, examDate).interval_days;
  if (d <= 1) return "1d";
  if (d < 7)  return `${d}d`;
  if (d < 30) return `${Math.round(d/7)}w`;
  return `${Math.round(d/30)}mo`;
}

/* light + dark tokens */
const L = { bg:"#F8FAFC", panel:"#EEF1F8", card:"#FFFFFF", text:"#0F172A", muted:"#64748B", border:"#E2E8F0", chip:"#FFFFFF" };
const D = { bg:"#0F1115", panel:"#15181E", card:"#1A1D23", text:"#F3F4F6", muted:"#9CA3AF", border:"#262A33", chip:"#1A1D23" };

const RATE = [
  { key:"again", label:"Again", l:{bg:"#FEE2E2",fg:"#B91C1C"}, d:{bg:"#3B1213",fg:"#F87171"} },
  { key:"hard",  label:"Hard",  l:{bg:"#FEF3C7",fg:"#B45309"}, d:{bg:"#3A2A0A",fg:"#FBBF24"} },
  { key:"good",  label:"Good",  l:{bg:"#DCFCE7",fg:"#15803D"}, d:{bg:"#0F2E1A",fg:"#4ADE80"} },
  { key:"easy",  label:"Easy",  l:{bg:"#DBEAFE",fg:"#1D4ED8"}, d:{bg:"#11293F",fg:"#60A5FA"} },
];

export default function Flashcards() {
  const isMobile = useIsMobile();
  const [dark, setDark] = useState(false);
  const [phase, setPhase] = useState("setup"); // setup | review | done
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [userId, setUserId] = useState(null);

  const [systems, setSystems] = useState([]);
  const [allSubjects, setAllSubjects] = useState([]);
  const [allLectures, setAllLectures] = useState([]);
  const [counts, setCounts] = useState({});

  // selection — single-deck (default)
  const [sysId, setSysId] = useState(null);
  const [subId, setSubId] = useState(null);
  const [lecId, setLecId] = useState("all");
  // selection — multi-deck
  const [multi, setMulti] = useState(false);
  const [subIds, setSubIds] = useState([]);
  const [lecIds, setLecIds] = useState([]);

  // active session context (set when a review starts)
  const [examDate, setExamDate] = useState(null);
  const [sessionName, setSessionName] = useState("");

  const [queue, setQueue] = useState([]);
  const [idx, setIdx] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [stats, setStats] = useState({ again:0, hard:0, good:0, easy:0 });

  const t = dark ? D : L;
  const accent = dark ? "#60A5FA" : "#2563EB";
  const headColor = dark ? t.text : "#1a2b4a";
  const pillBorder = dark ? "#2B3A55" : "#BFD7F5";
  const selBg = dark ? "#13233b" : "#EFF4FF";

  /* ---- initial load ---- */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(false);
      try {
        const { data:{ user } } = await supabase.auth.getUser();
        if (!user) return; // finally clears loading
        const results = await Promise.all([
          supabase.from("systems").select("id,name,color").order("name"),
          supabase.from("subjects").select("id,name,color,exam_date,system_id").order("name"),
          supabase.from("lectures").select("id,title,lecture_date,order_index,subject_id").order("order_index"),
          supabase.from("flashcards").select("id,subject_id,lecture_id"),
          supabase.from("flashcard_progress").select("flashcard_id,next_review").eq("user_id", user.id),
        ]);
        const failed = results.find((r) => r.error);
        if (failed) throw failed.error;
        const [{ data:sys }, { data:subs }, { data:lecs }, { data:cards }, { data:prog }] = results;
        const pm = {}; (prog||[]).forEach(p => pm[p.flashcard_id] = p);
        const now = new Date();
        const cnt = {};
        (cards||[]).forEach(c => {
          const due = !pm[c.id] || !pm[c.id].next_review || new Date(pm[c.id].next_review) <= now;
          [c.subject_id, c.lecture_id].filter(Boolean).forEach(id => {
            if (!cnt[id]) cnt[id] = { due:0, total:0 };
            cnt[id].total++; if (due) cnt[id].due++;
          });
        });
        if (cancelled) return;
        setUserId(user.id);
        setSystems(sys||[]); setAllSubjects(subs||[]); setAllLectures(lecs||[]); setCounts(cnt);
        // preselect first system that has subjects with cards, plus its first subject
        const firstSys = (sys||[]).find(s => (subs||[]).some(su => su.system_id===s.id && (cnt[su.id]?.total||0)>0)) || (sys||[])[0];
        if (firstSys) {
          setSysId(firstSys.id);
          const firstSub = (subs||[]).find(su => su.system_id === firstSys.id);
          setSubId(firstSub ? firstSub.id : null);
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
  }, [reloadKey]);

  const retry = () => setReloadKey((k) => k + 1);

  /* derived lists */
  const subjects = allSubjects.filter(s => s.system_id === sysId);
  const lectures = allLectures.filter(l => l.subject_id === subId); // single mode
  const lecturesMulti = allLectures.filter(l => subIds.includes(l.subject_id)); // multi mode

  const sysDue = (id) => allSubjects.filter(s => s.system_id === id).reduce((a, s) => a + (counts[s.id]?.due || 0), 0);

  /* ---- selection handlers ---- */
  const toggleMulti = () => {
    const next = !multi;
    setMulti(next);
    if (next) {
      setSubIds([]);
      setLecIds([]);
    } else {
      const fs = allSubjects.find((su) => su.system_id === sysId);
      setSubId(fs ? fs.id : null);
      setLecId("all");
    }
  };

  const pickSystem = (s) => {
    setSysId(s.id);
    if (multi) {
      setSubIds([]);
      setLecIds([]);
    } else {
      const fs = allSubjects.find((su) => su.system_id === s.id);
      setSubId(fs ? fs.id : null);
      setLecId("all");
    }
  };

  const onSubject = (id) => {
    if (multi) {
      if (subIds.includes(id)) {
        const remLec = allLectures.filter((l) => l.subject_id === id).map((l) => l.id);
        setSubIds(subIds.filter((x) => x !== id));
        setLecIds(lecIds.filter((x) => !remLec.includes(x)));
      } else setSubIds([...subIds, id]);
    } else {
      setSubId(id);
      setLecId("all");
    }
  };

  const onLecture = (id) => {
    if (multi) setLecIds(lecIds.includes(id) ? lecIds.filter((x) => x !== id) : [...lecIds, id]);
    else setLecId(id);
  };

  const subAllOn = subjects.length > 0 && subIds.length === subjects.length;
  const lecAllOn = lecturesMulti.length > 0 && lecIds.length === lecturesMulti.length;
  const subMaster = () => (subAllOn ? (setSubIds([]), setLecIds([])) : setSubIds(subjects.map((s) => s.id)));
  const lecMaster = () => (lecAllOn ? setLecIds([]) : setLecIds(lecturesMulti.map((l) => l.id)));

  const selDue = () => {
    if (multi) {
      let total = 0;
      subIds.forEach((id) => (total += counts[id]?.due || 0));
      lecIds.forEach((id) => {
        const lec = allLectures.find((l) => l.id === id);
        if (lec && !subIds.includes(lec.subject_id)) total += counts[id]?.due || 0;
      });
      return total;
    }
    return lecId === "all" ? counts[subId]?.due || 0 : counts[lecId]?.due || 0;
  };

  const canStart = multi ? subIds.length > 0 || lecIds.length > 0 : !!subId;

  /* ---- start review ---- */
  function buildAndStart(cards, prog, exam, name) {
    const pm = {}; (prog||[]).forEach((p) => (pm[p.flashcard_id] = p));
    const now = new Date();
    const due = (cards || [])
      .map((c) => ({ card: c, progress: pm[c.id] || null }))
      .filter(({ progress }) => !progress || !progress.next_review || new Date(progress.next_review) <= now)
      .sort((a, b) => {
        const ea = a.progress?.exam_boost ? 1 : 0, eb = b.progress?.exam_boost ? 1 : 0;
        if (ea !== eb) return eb - ea;
        return (a.progress?.next_review ? new Date(a.progress.next_review).getTime() : 0)
             - (b.progress?.next_review ? new Date(b.progress.next_review).getTime() : 0);
      });
    setExamDate(exam || null);
    setSessionName(name);
    setQueue(due); setIdx(0); setRevealed(false);
    setStats({ again: 0, hard: 0, good: 0, easy: 0 });
    setLoading(false);
    setPhase(due.length ? "review" : "done");
  }

  async function start() {
    if (!canStart) return;
    setLoading(true);
    setError(false);
    try {
      if (multi) {
        let query = supabase.from("flashcards").select("id,front,back");
        if (subIds.length && lecIds.length) query = query.or(`subject_id.in.(${subIds.join(",")}),lecture_id.in.(${lecIds.join(",")})`);
        else if (subIds.length) query = query.in("subject_id", subIds);
        else query = query.in("lecture_id", lecIds);
        const [cardsRes, progRes] = await Promise.all([query, supabase.from("flashcard_progress").select("*").eq("user_id", userId)]);
        if (cardsRes.error || progRes.error) throw cardsRes.error || progRes.error;
        const exam = allSubjects.filter((s) => subIds.includes(s.id) && s.exam_date).map((s) => s.exam_date).sort()[0] || null;
        const parts = [];
        if (subIds.length) parts.push(`${subIds.length} subject${subIds.length === 1 ? "" : "s"}`);
        if (lecIds.length) parts.push(`${lecIds.length} lecture${lecIds.length === 1 ? "" : "s"}`);
        buildAndStart(cardsRes.data, progRes.data, exam, `Multi-deck · ${parts.join(" · ")}`);
      } else {
        const q = lecId === "all"
          ? supabase.from("flashcards").select("id,front,back").eq("subject_id", subId)
          : supabase.from("flashcards").select("id,front,back").eq("lecture_id", lecId);
        const [cardsRes, progRes] = await Promise.all([q, supabase.from("flashcard_progress").select("*").eq("user_id", userId)]);
        if (cardsRes.error || progRes.error) throw cardsRes.error || progRes.error;
        const subj = allSubjects.find((s) => s.id === subId);
        const name = lecId === "all" ? subj?.name : allLectures.find((l) => l.id === lecId)?.title;
        buildAndStart(cardsRes.data, progRes.data, subj?.exam_date, name || "Review");
      }
    } catch {
      setError(true);
      setLoading(false);
    }
  }

  /* ---- rate ---- */
  async function rate(rating) {
    const item = queue[idx]; if (!item) return;
    const sched = schedule(item.progress, rating, examDate);

    // Current SR state — one row per card, upserted. (single + multi deck)
    await supabase.from("flashcard_progress").upsert({
      user_id:userId, flashcard_id:item.card.id, status:sched.status,
      next_review:sched.next_review, last_reviewed:new Date().toISOString(),
      ease_factor:sched.ease_factor, interval_days:sched.interval_days, repetitions:sched.repetitions,
    }, { onConflict:"user_id,flashcard_id" });

    // Append-only review history (Layer 1). Fire-and-forget: a failure here must
    // not block the review flow — just log and continue.
    supabase.from("flashcard_reviews").insert({
      user_id: userId,
      flashcard_id: item.card.id,
      rating,
      interval_days: sched.interval_days,
      ease_factor: sched.ease_factor,
      next_review: sched.next_review,
    }).then(({ error }) => {
      if (error) console.error("flashcard_reviews insert failed:", error);
    });

    setStats(s => ({ ...s, [rating]: s[rating]+1 }));
    if (rating === "again") setQueue(q => [...q, { ...item, progress:{ ...item.progress, ...sched } }]);
    if (idx < queue.length-1) { setIdx(i=>i+1); setRevealed(false); }
    else setPhase("done");
  }

  const pct = queue.length ? Math.round((idx/queue.length)*100) : 0;

  /* ---- shared setup render bits (themed) ---- */
  const check = (on, size = 26) => (
    <span style={{ width: size, height: size, borderRadius: 7, flexShrink: 0, border: `2px solid ${on ? accent : "#CBD5E1"}`, background: on ? accent : "transparent", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 800 }}>
      {on ? "✓" : ""}
    </span>
  );
  const pill = (n) => (
    <span style={{ color: accent, fontSize: 12, fontWeight: 600, border: `1px solid ${pillBorder}`, borderRadius: 999, padding: "1px 9px", flexShrink: 0, fontVariantNumeric: "tabular-nums" }}>({n})</span>
  );
  const row = (key, on, onClick, label, count) => (
    <button key={key} onClick={onClick} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", border: `1px solid ${on ? accent : t.border}`, borderRadius: 10, background: on ? selBg : t.card, cursor: "pointer", textAlign: "left", width: "100%", fontFamily: font, color: t.text }}>
      {check(on)}
      <span style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 14 }}>{label}</span>
        {pill(count)}
      </span>
    </button>
  );
  const sectionHead = (title, master, locked) => (
    <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
      {master && (
        <button onClick={master.onToggle} disabled={locked} style={{ background: "transparent", border: "none", padding: 0, cursor: locked ? "default" : "pointer", lineHeight: 0 }} aria-label="Select all">
          {check(master.on)}
        </button>
      )}
      <span style={{ fontSize: 19, fontWeight: 500, color: headColor }}>{title}</span>
    </div>
  );
  const grid = { display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(2, 1fr)", gap: 14 };
  const divider = { height: 0, borderTop: `0.5px solid ${t.border}`, margin: "24px 0" };
  const subjectsLocked = !sysId;
  const lecturesLocked = multi ? subIds.length === 0 : !subId;

  /* ============ RENDER ============ */
  return (
    <div style={{ fontFamily:font, color:t.text, minHeight:"100vh", background:t.bg, transition:"background .25s" }}>
      {/* top bar */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"14px 20px", borderBottom:`1px solid ${t.border}` }}>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          {phase!=="setup" && (
            <button onClick={()=>{ setPhase("setup"); }} style={iconBtn(t)}>←</button>
          )}
          <span style={{ fontWeight:700, fontSize:16 }}>
            {phase==="setup" ? "Flashcards" : sessionName}
          </span>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:10 }}>
          {phase==="review" && <span style={{ fontSize:14, color:t.muted, fontVariantNumeric:"tabular-nums" }}>{idx+1} / {queue.length}</span>}
          <button onClick={()=>setDark(d=>!d)} style={iconBtn(t)} title="Toggle theme">{dark?"☀":"🌙"}</button>
        </div>
      </div>

      {phase==="review" && (
        <div style={{ height:5, background:t.border }}>
          <div style={{ height:"100%", width:`${pct}%`, background:"#22C55E", transition:"width .3s" }} />
        </div>
      )}

      <div style={{ maxWidth:760, margin:"0 auto", padding:"22px 16px" }}>
        {loading && (
          <div style={{ paddingTop: 8 }}>
            <Skeleton width={180} height={26} radius={8} color={t.border} style={{ marginBottom: 22 }} />
            {[0, 1, 2].map((sec) => (
              <div key={sec} style={{ marginBottom: 24 }}>
                <Skeleton width={120} height={16} color={t.border} style={{ marginBottom: 14 }} />
                <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "repeat(2,1fr)", gap: 14 }}>
                  {[0, 1, 2, 3].map((i) => (
                    <Skeleton key={i} height={48} radius={10} color={t.border} />
                  ))}
                </div>
              </div>
            ))}
            <Skeleton height={50} radius={10} color={t.border} style={{ marginTop: 8 }} />
          </div>
        )}

        {!loading && error && (
          <div style={{ textAlign: "center", padding: "48px 16px" }}>
            <div style={{ color: t.muted, fontSize: 14, lineHeight: 1.6, marginBottom: 16 }}>
              Couldn&apos;t load this page. Check your connection and try again.
            </div>
            <button
              onClick={retry}
              style={{ background: accent, color: "#fff", border: "none", borderRadius: 10, padding: "11px 26px", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: font }}
            >
              Retry
            </button>
          </div>
        )}

        {/* ---------- SETUP ---------- */}
        {!loading && !error && phase==="setup" && (
          <div>
            {/* header + mode toggle */}
            <div style={{ display:"flex", alignItems:"center", marginBottom:4 }}>
              <h1 style={{ fontSize:24, margin:0, color:headColor, fontWeight:600 }}>{multi ? "Multi-deck Review" : "Deck Review"}</h1>
              <div style={{ flex:1 }} />
              <button onClick={toggleMulti} style={{ background:"transparent", border:`1px solid ${t.border}`, borderRadius:999, padding:"7px 14px", color:accent, fontWeight:600, fontSize:13, cursor:"pointer", fontFamily:font }}>
                {multi ? "← Single deck" : "Multi-deck review →"}
              </button>
            </div>
            <p style={{ color:t.muted, fontSize:14, margin:"0 0 24px" }}>
              {multi ? "Combine several subjects or lectures into one session — great for midterm and final prep." : "Pick a system, subject and lecture to review."}
            </p>

            {/* System (single-select) */}
            {sectionHead("Systems")}
            {systems.length === 0 ? (
              <span style={{ color:t.muted, fontSize:14 }}>No systems yet.</span>
            ) : (
              <div style={grid}>
                {systems.map((s) => row(s.id, s.id === sysId, () => pickSystem(s), s.name, sysDue(s.id)))}
              </div>
            )}

            <div style={divider} />

            {/* Subjects */}
            <div style={{ opacity: subjectsLocked ? 0.4 : 1 }}>
              {sectionHead("Subjects", multi ? { on: subAllOn, onToggle: subMaster } : null, subjectsLocked)}
              {subjects.length === 0 ? (
                <span style={{ color:t.muted, fontSize:14 }}>No subjects with cards in this system.</span>
              ) : (
                <div style={grid}>
                  {subjects.map((s) => row(s.id, multi ? subIds.includes(s.id) : s.id === subId, () => onSubject(s.id), s.name, counts[s.id]?.due || 0))}
                </div>
              )}
            </div>

            <div style={divider} />

            {/* Lectures */}
            <div style={{ opacity: lecturesLocked ? 0.4 : 1 }}>
              {sectionHead("Lectures", multi ? { on: lecAllOn, onToggle: lecMaster } : null, lecturesLocked)}
              {multi ? (
                lecturesMulti.length === 0 ? (
                  <span style={{ color:t.muted, fontSize:13 }}>Select subjects to combine their lectures, or just review whole subjects.</span>
                ) : (
                  <div style={grid}>
                    {lecturesMulti.map((l) => row(l.id, lecIds.includes(l.id), () => onLecture(l.id), l.title, counts[l.id]?.due || 0))}
                  </div>
                )
              ) : (
                <div style={grid}>
                  {row("all", lecId === "all", () => onLecture("all"), "All lectures", counts[subId]?.due || 0)}
                  {lectures.map((l) => row(l.id, lecId === l.id, () => onLecture(l.id), l.title, counts[l.id]?.due || 0))}
                </div>
              )}
            </div>

            <div style={{ ...divider, marginBottom: 20 }} />

            <button onClick={start} disabled={!canStart} style={{
              width:"100%", padding:15, background: canStart ? "#2563EB" : t.border, color:"#fff", border:"none",
              borderRadius:10, fontSize:15, fontWeight:700, cursor: canStart ? "pointer" : "default", fontFamily:font,
            }}>
              Start review{selDue() > 0 ? ` · ${selDue()} due` : ""}
            </button>
          </div>
        )}

        {/* ---------- REVIEW ---------- */}
        {!loading && phase==="review" && queue[idx] && (
          <div>
            <div style={{ background:t.card, borderRadius:16, padding:revealed?"30px 28px":"36px 28px", minHeight:260, position:"relative", display:"flex", flexDirection:"column" }}>
              {queue[idx].progress?.exam_boost && (
                <span style={{ position:"absolute", top:14, right:14, background:dark?"#78350F":"#FEF3C7", color:dark?"#FDE68A":"#92400E", fontSize:11, fontWeight:700, padding:"3px 10px", borderRadius:99 }}>⚠️ Exam Boost</span>
              )}
              <div style={{ fontSize:11, color:t.muted, textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:12 }}>Question</div>
              <div style={{ fontSize:revealed?17:19, lineHeight:1.6, color:t.text, whiteSpace:"pre-wrap", flex:revealed?"none":1 }}>{queue[idx].card.front}</div>

              {revealed && (
                <>
                  <div style={{ height:1, background:t.border, margin:"22px 0" }} />
                  <div style={{ fontSize:11, color:t.muted, textTransform:"uppercase", letterSpacing:"0.06em", marginBottom:12 }}>Answer</div>
                  <div style={{ fontSize:17, lineHeight:1.6, color:t.text, whiteSpace:"pre-wrap" }}>{queue[idx].card.back}</div>
                </>
              )}
            </div>

            {!revealed ? (
              <button onClick={()=>setRevealed(true)} style={{ width:"100%", padding:15, marginTop:14, background:t.border, color:t.text, border:"none", borderRadius:14, fontSize:15, fontWeight:600, cursor:"pointer", fontFamily:font }}>
                Show answer
              </button>
            ) : (
              <div style={{ display:"grid", gridTemplateColumns:`repeat(${isMobile ? 2 : 4},1fr)`, gap:8, marginTop:14 }}>
                {RATE.map(r => {
                  const c = dark ? r.d : r.l;
                  return (
                    <button key={r.key} onClick={()=>rate(r.key)} style={{ background:c.bg, color:c.fg, border:"none", borderRadius:12, padding:"14px 6px", fontSize:14, fontWeight:700, cursor:"pointer", fontFamily:font, display:"flex", flexDirection:"column", alignItems:"center", gap:3 }}>
                      {r.label}
                      <span style={{ fontSize:11, opacity:0.8 }}>{intervalLabel(r.key, queue[idx].progress, examDate)}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ---------- DONE ---------- */}
        {!loading && phase==="done" && (
          <div style={{ textAlign:"center", padding:"48px 0" }}>
            <div style={{ fontSize:48 }}>✅</div>
            <h2 style={{ fontSize:22, margin:"12px 0 6px", color:t.text }}>{stats.again+stats.hard+stats.good+stats.easy>0?"Session complete":"Nothing due"}</h2>
            <p style={{ color:t.muted, marginBottom:28 }}>{stats.again+stats.hard+stats.good+stats.easy} cards reviewed</p>
            {stats.again+stats.hard+stats.good+stats.easy>0 && (
              <div style={{ display:"flex", gap:20, justifyContent:"center", marginBottom:28 }}>
                {[["Again",stats.again,dark?"#F87171":"#B91C1C"],["Hard",stats.hard,dark?"#FBBF24":"#B45309"],["Good",stats.good,dark?"#4ADE80":"#15803D"],["Easy",stats.easy,dark?"#60A5FA":"#1D4ED8"]].map(([lab,val,col])=>(
                  <div key={lab}><div style={{ fontSize:22, fontWeight:800, color:col }}>{val}</div><div style={{ fontSize:12, color:t.muted }}>{lab}</div></div>
                ))}
              </div>
            )}
            <button onClick={()=>setPhase("setup")} style={{ background:"#2563EB", color:"#fff", border:"none", borderRadius:10, padding:"13px 28px", fontSize:15, fontWeight:700, cursor:"pointer", fontFamily:font }}>Back to home</button>
          </div>
        )}
      </div>
    </div>
  );
}

/* styles */
const iconBtn = (t) => ({ background:"transparent", border:`1px solid ${t.border}`, borderRadius:8, padding:"6px 11px", cursor:"pointer", fontSize:14, color:t.text, fontFamily:font });

import { useState, useEffect, useRef } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { font } from "../theme";
import useIsMobile from "../lib/useIsMobile";
import Skeleton from "../components/Skeleton";
import SessionBar, { SESSION_BAR_H } from "../components/SessionBar";
import { goToNextTask } from "../lib/session";

const DAY = 24 * 60 * 60 * 1000;
const startOfDay = (d) => { const x = new Date(d); x.setHours(0,0,0,0); return x; };
const addDays = (d, n) => new Date(startOfDay(d).getTime() + n * DAY);

const MAX_INTERVAL = 21; // course window ceiling (3 weeks)

// SM-2 variant tuned for JUStep's short 3-4 week system windows.
//   Early (reps 0-2): rating-driven fixed steps — Again 1, Hard 1, Good 3, Easy 4.
//   Mature (reps >= 3): geometric — Hard I*(EF-0.15 floored 1.2), Good I*EF, Easy I*(EF+0.15).
//   Easy always lands at least 1 day past Good. Capped at 21 days (and the exam).
function schedule(progress, rating, examDate) {
  // null-safe: coerce legacy/blank values to defaults (never NaN).
  let repetitions = Number(progress?.repetitions) || 0;
  let ease_factor = Number(progress?.ease_factor) || 2.5;
  const I = Number(progress?.interval_days) || 0;
  const EF0 = ease_factor; // incoming ease factor, used in the interval factors

  let interval;
  if (rating === "again") {
    repetitions = 0;
    ease_factor = Math.max(1.3, EF0 - 0.2);
    interval = 1;
  } else {
    // ease factor update (direction only; bounds [1.3, 3.0])
    if (rating === "hard") ease_factor = Math.max(1.3, EF0 - 0.15);
    else if (rating === "easy") ease_factor = Math.min(3.0, EF0 + 0.15);
    // good: unchanged

    // Interval a given rating would produce from the current (incoming) state.
    const intervalFor = (r) => {
      if (repetitions < 3) return r === "hard" ? 1 : r === "good" ? 3 : 4; // early
      if (r === "hard") return Math.round(I * Math.max(1.2, EF0 - 0.15));
      if (r === "good") return Math.round(I * EF0);
      return Math.round(I * (EF0 + 0.15)); // easy
    };

    interval = intervalFor(rating);
    // Easy must always exceed Good, or the button is meaningless.
    if (rating === "easy") {
      const good = intervalFor("good");
      if (interval <= good) interval = good + 1;
    }
    repetitions += 1;
  }

  // Caps: 21-day ceiling, then squeeze into the remaining exam window, floor 1.
  interval = Math.min(interval, MAX_INTERVAL);
  if (examDate) {
    const daysUntilExam = Math.round((startOfDay(examDate).getTime() - startOfDay(new Date()).getTime()) / DAY);
    if (daysUntilExam >= 1) interval = Math.min(interval, daysUntilExam);
  }
  interval = Math.max(1, interval);

  return {
    repetitions,
    interval_days: interval,
    ease_factor,
    next_review: addDays(new Date(), interval).toISOString(),
    status: rating === "again" || repetitions < 3 ? "learning" : "known",
  };
}

function intervalLabel(rating, progress, examDate) {
  // Intervals are capped at 21 days, so show plain days — keeps each rating's
  // preview distinct (weeks-rounding would collapse 19/20/21 into "3w").
  return `${schedule(progress, rating, examDate).interval_days}d`;
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

const REVIEW_CARD_SELECT = "id,front,back,subject_id,topic_id,lecture_id,lectures(title),topics(name),subjects(name)";
const NO_LECTURE_PREFIX = "no-lecture:";
const noLectureKey = (subjectId) => `${NO_LECTURE_PREFIX}${subjectId}`;

function shuffle(items) {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export default function Flashcards() {
  const isMobile = useIsMobile();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const dueMode = searchParams.get("mode") === "due";
  const sessionMode = searchParams.get("session") === "1";
  const autoDueRef = useRef(false); // guards the due-mode auto-start to once
  const [dark, setDark] = useState(false);
  const [phase, setPhase] = useState("setup"); // setup | review | done
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [userId, setUserId] = useState(null);

  const [systems, setSystems] = useState([]);
  const [allSubjects, setAllSubjects] = useState([]);
  const [allLectures, setAllLectures] = useState([]);
  const [cardPool, setCardPool] = useState([]);

  // setup selections — empty content arrays mean "all", matching Questions.
  const [pickedSystems, setPickedSystems] = useState([]);
  const [pickedSubjects, setPickedSubjects] = useState([]);
  const [pickedLectures, setPickedLectures] = useState([]);
  const [status, setStatus] = useState({ due: true, new: false, learning: false, all: false });
  const [numCards, setNumCards] = useState("40");
  const [starting, setStarting] = useState(false);
  const [setupError, setSetupError] = useState("");

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
  const activeCard = queue[idx]?.card;
  const sourceLabel = activeCard?.lectures?.title || activeCard?.topics?.name || activeCard?.subjects?.name;

  /* ---- due deep-link queue ---- */
  function buildAndStart(cards, prog, exam, name) {
    const pm = {}; (prog||[]).forEach((p) => (pm[p.flashcard_id] = p));
    const now = new Date();
    const due = (cards || [])
      .map((c) => ({ card: c, progress: pm[c.id] || null }))
      .filter(({ progress }) => progress && (!progress.next_review || new Date(progress.next_review) <= now))
      // Oldest-due first.
      .sort((a, b) =>
        (a.progress?.next_review ? new Date(a.progress.next_review).getTime() : 0)
        - (b.progress?.next_review ? new Date(b.progress.next_review).getTime() : 0)
      );
    setExamDate(exam || null);
    setSessionName(name);
    setQueue(due); setIdx(0); setRevealed(false);
    setStats({ again: 0, hard: 0, good: 0, easy: 0 });
    setLoading(false);
    setPhase(due.length ? "review" : "done");
  }

  /* ---- initial load ---- */
  useEffect(() => {
    if (phase !== "setup") return;
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
          supabase.from("flashcards").select(REVIEW_CARD_SELECT).is("deleted_at", null),
          supabase.from("flashcard_progress").select("*").eq("user_id", user.id),
        ]);
        const failed = results.find((r) => r.error);
        if (failed) throw failed.error;
        const [{ data:sys }, { data:subs }, { data:lecs }, { data:cards }, { data:prog }] = results;
        const pm = {}; (prog||[]).forEach(p => pm[p.flashcard_id] = p);
        const subjectSystems = {}; (subs||[]).forEach((s) => (subjectSystems[s.id] = s.system_id || null));
        const pool = (cards||[]).map((card) => ({
          id: card.id,
          subject_id: card.subject_id,
          lecture_id: card.lecture_id || null,
          system_id: subjectSystems[card.subject_id] || null,
          card,
          progress: pm[card.id] || null,
        }));
        if (cancelled) return;
        setUserId(user.id);
        setSystems(sys||[]); setAllSubjects(subs||[]); setAllLectures(lecs||[]); setCardPool(pool);
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadKey, phase]);

  const retry = () => setReloadKey((k) => k + 1);

  /* ---- deep-link: auto-start "due" review across every deck ----
     /app/flashcards?mode=due — after the initial load, pull every non-deleted
     card + the user's progress and run them through buildAndStart (which
     due-filters + sorts). Skips deck selection. Nothing due → lands on "done". */
  useEffect(() => {
    if (!dueMode || autoDueRef.current) return;
    if (loading || error || !userId || phase !== "setup") return;
    autoDueRef.current = true;
    (async () => {
      setLoading(true);
      setError(false);
      try {
        const [cardsRes, progRes] = await Promise.all([
          supabase.from("flashcards").select(REVIEW_CARD_SELECT).is("deleted_at", null),
          supabase.from("flashcard_progress").select("*").eq("user_id", userId),
        ]);
        if (cardsRes.error || progRes.error) throw cardsRes.error || progRes.error;
        buildAndStart(cardsRes.data, progRes.data, null, "Due cards");
      } catch {
        setError(true);
        setLoading(false);
      }
    })();
  }, [dueMode, loading, error, userId, phase]);

  /* ---- configurable setup queue ---- */
  function startReview(items, n) {
    setSetupError("");
    if (!items.length) {
      setSetupError("No flashcards match your filters.");
      return;
    }
    const parsed = parseInt(n, 10);
    const take = Math.min(Math.max(1, Number.isNaN(parsed) ? 1 : parsed), items.length);
    setStarting(true);
    const chosen = shuffle(items).slice(0, take);
    const chosenSubjects = new Set(chosen.map((item) => item.subject_id));
    const exam = allSubjects
      .filter((subject) => chosenSubjects.has(subject.id) && subject.exam_date)
      .map((subject) => subject.exam_date)
      .sort()[0] || null;
    const activeStatuses = Object.entries(status).filter(([, on]) => on).map(([key]) => key);
    const name = activeStatuses.length === 1 ? `${activeStatuses[0][0].toUpperCase()}${activeStatuses[0].slice(1)} cards` : "Custom review";
    setExamDate(exam);
    setSessionName(name);
    setQueue(chosen);
    setIdx(0);
    setRevealed(false);
    setStats({ again: 0, hard: 0, good: 0, easy: 0 });
    setStarting(false);
    setPhase("review");
  }

  /* ---- unified setup cascade ---- */
  const toggleStatus = (key) => setStatus((current) => ({ ...current, [key]: !current[key] }));

  const toggleSystem = (id) => {
    if (pickedSystems.includes(id)) {
      const removedSubjects = allSubjects.filter((subject) => subject.system_id === id).map((subject) => subject.id);
      const removedLectures = new Set([
        ...allLectures.filter((lecture) => removedSubjects.includes(lecture.subject_id)).map((lecture) => lecture.id),
        ...removedSubjects.map(noLectureKey),
      ]);
      setPickedSystems(pickedSystems.filter((systemId) => systemId !== id));
      setPickedSubjects(pickedSubjects.filter((subjectId) => !removedSubjects.includes(subjectId)));
      setPickedLectures(pickedLectures.filter((lectureId) => !removedLectures.has(lectureId)));
    } else {
      setPickedSystems([...pickedSystems, id]);
    }
  };

  const toggleSubject = (id) => {
    if (pickedSubjects.includes(id)) {
      const removedLectures = new Set([
        ...allLectures.filter((lecture) => lecture.subject_id === id).map((lecture) => lecture.id),
        noLectureKey(id),
      ]);
      setPickedSubjects(pickedSubjects.filter((subjectId) => subjectId !== id));
      setPickedLectures(pickedLectures.filter((lectureId) => !removedLectures.has(lectureId)));
    } else {
      setPickedSubjects([...pickedSubjects, id]);
    }
  };

  const toggleLecture = (id) => setPickedLectures((current) =>
    current.includes(id) ? current.filter((lectureId) => lectureId !== id) : [...current, id]
  );

  const isDue = (item) => item.progress
    && (!item.progress.next_review || new Date(item.progress.next_review) <= new Date());
  const isNew = (item) => !item.progress;
  const isLearning = (item) => item.progress && (
    item.progress.status === "learning"
    || Number(item.progress.repetitions) < 3
    || Number(item.progress.interval_days) <= 3
  );
  const passStatus = (item) =>
    status.all
    || (status.due && isDue(item))
    || (status.new && isNew(item))
    || (status.learning && isLearning(item));

  const inSystem = (item) => !pickedSystems.length || pickedSystems.includes(item.system_id);
  const inSubject = (item) => !pickedSubjects.length || pickedSubjects.includes(item.subject_id);
  const inLecture = (item) => {
    if (!pickedLectures.length) return true;
    const bucketId = item.lecture_id || noLectureKey(item.subject_id);
    return pickedLectures.includes(bucketId);
  };
  const inCascade = (item) => inSystem(item) && inSubject(item) && inLecture(item);

  const statusCounts = { due: 0, new: 0, learning: 0, all: 0 };
  cardPool.forEach((item) => {
    if (!inCascade(item)) return;
    statusCounts.all += 1;
    if (isDue(item)) statusCounts.due += 1;
    if (isNew(item)) statusCounts.new += 1;
    if (isLearning(item)) statusCounts.learning += 1;
  });

  const statusPool = cardPool.filter(passStatus);
  const systemCounts = {};
  const subjectCounts = {};
  const lectureCounts = {};
  statusPool.forEach((item) => {
    if (item.system_id) systemCounts[item.system_id] = (systemCounts[item.system_id] || 0) + 1;
    if (item.subject_id) subjectCounts[item.subject_id] = (subjectCounts[item.subject_id] || 0) + 1;
    const bucketId = item.lecture_id || noLectureKey(item.subject_id);
    lectureCounts[bucketId] = (lectureCounts[bucketId] || 0) + 1;
  });

  const shownSubjects = allSubjects.filter((subject) => pickedSystems.includes(subject.system_id));
  const shownLectures = allLectures.filter((lecture) => pickedSubjects.includes(lecture.subject_id));
  const noLectureOptions = pickedSubjects
    .filter((subjectId) => cardPool.some((item) => item.subject_id === subjectId && !item.lecture_id))
    .map((subjectId) => ({
      id: noLectureKey(subjectId),
      title: `No lecture · ${allSubjects.find((subject) => subject.id === subjectId)?.name || "Subject"}`,
      subject_id: subjectId,
    }));
  const lectureOptions = [...shownLectures, ...noLectureOptions];

  const finalPool = cardPool.filter((item) => inCascade(item) && passStatus(item));
  const availableCount = finalPool.length;
  const clampNum = (raw) => {
    if (availableCount === 0) return 0;
    const parsed = parseInt(raw, 10);
    if (Number.isNaN(parsed)) return 1;
    return Math.max(1, Math.min(availableCount, parsed));
  };
  const selectedCount = clampNum(numCards);

  const subjectsLocked = pickedSystems.length === 0;
  const lecturesLocked = pickedSubjects.length === 0;
  const systemsAllOn = systems.length > 0 && pickedSystems.length === systems.length;
  const subjectsAllOn = shownSubjects.length > 0 && pickedSubjects.length === shownSubjects.length;
  const lecturesAllOn = lectureOptions.length > 0 && pickedLectures.length === lectureOptions.length;

  const toggleSystemsMaster = () => {
    if (systemsAllOn) {
      setPickedSystems([]);
      setPickedSubjects([]);
      setPickedLectures([]);
    } else {
      setPickedSystems(systems.map((system) => system.id));
    }
  };
  const toggleSubjectsMaster = () => {
    if (subjectsAllOn) {
      setPickedSubjects([]);
      setPickedLectures([]);
    } else {
      setPickedSubjects(shownSubjects.map((subject) => subject.id));
    }
  };
  const toggleLecturesMaster = () => {
    setPickedLectures(lecturesAllOn ? [] : lectureOptions.map((lecture) => lecture.id));
  };

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
  const setupTheme = { t, accent, selectedBackground: selBg, pillBorder, headColor };

  /* ============ RENDER ============ */
  return (
    <>
      {sessionMode && <SessionBar />}
      <div style={{ fontFamily:font, color:t.text, minHeight:"100vh", background:t.bg, transition:"background .25s", paddingTop: sessionMode ? SESSION_BAR_H : 0 }}>
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

      <div style={{ maxWidth:phase === "setup" ? 920 : 760, margin:"0 auto", padding:phase === "setup" ? "22px 16px 110px" : "22px 16px" }}>
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
            <h1 style={{ fontSize:26, margin:"0 0 4px", color:headColor }}>Create Review</h1>
            <p style={{ color:t.muted, margin:"0 0 28px", fontSize:14 }}>Build a custom flashcard review.</p>

            <Section title="Card Status" totalPill={availableCount} theme={setupTheme}>
              <div style={{ display:"flex", flexWrap:"wrap", alignItems:"center", gap:"12px 26px" }}>
                <StatusToggle on={status.due} onClick={() => toggleStatus("due")} label="Due" count={statusCounts.due} theme={setupTheme} />
                <StatusToggle on={status.new} onClick={() => toggleStatus("new")} label="New" count={statusCounts.new} theme={setupTheme} />
                <StatusToggle on={status.learning} onClick={() => toggleStatus("learning")} label="Learning" count={statusCounts.learning} theme={setupTheme} />
                <StatusToggle on={status.all} onClick={() => toggleStatus("all")} label="All" count={statusCounts.all} theme={setupTheme} />
              </div>
            </Section>

            <Section title="Systems" master={{ on: systemsAllOn, onToggle: toggleSystemsMaster }} theme={setupTheme}>
              {systems.length === 0 ? (
                <Empty theme={setupTheme}>No systems configured yet.</Empty>
              ) : (
                <Grid single={isMobile}>
                  {systems.map((system) => (
                    <CheckRow key={system.id} on={pickedSystems.includes(system.id)} onClick={() => toggleSystem(system.id)} label={system.name} count={systemCounts[system.id] || 0} theme={setupTheme} />
                  ))}
                </Grid>
              )}
            </Section>

            <Section title="Subjects" locked={subjectsLocked} master={{ on: subjectsAllOn, onToggle: toggleSubjectsMaster, disabled: subjectsLocked }} theme={setupTheme}>
              {subjectsLocked ? (
                <Locked theme={setupTheme}>Select a system first.</Locked>
              ) : shownSubjects.length === 0 ? (
                <Empty theme={setupTheme}>No subjects for the selected systems.</Empty>
              ) : (
                <Grid single={isMobile}>
                  {shownSubjects.map((subject) => (
                    <CheckRow key={subject.id} on={pickedSubjects.includes(subject.id)} onClick={() => toggleSubject(subject.id)} label={subject.name} count={subjectCounts[subject.id] || 0} theme={setupTheme} />
                  ))}
                </Grid>
              )}
            </Section>

            <Section title="Lectures" locked={lecturesLocked} master={{ on: lecturesAllOn, onToggle: toggleLecturesMaster, disabled: lecturesLocked }} theme={setupTheme}>
              {lecturesLocked ? (
                <Locked theme={setupTheme}>Select a subject first.</Locked>
              ) : lectureOptions.length === 0 ? (
                <Empty theme={setupTheme}>No lectures for the selected subjects.</Empty>
              ) : (
                <Grid single={isMobile}>
                  {lectureOptions.map((lecture) => (
                    <CheckRow key={lecture.id} on={pickedLectures.includes(lecture.id)} onClick={() => toggleLecture(lecture.id)} label={lecture.title} count={lectureCounts[lecture.id] || 0} theme={setupTheme} />
                  ))}
                </Grid>
              )}
            </Section>

            <div style={{ position:"fixed", bottom:0, left:0, right:0, background:t.card, borderTop:`1px solid ${t.border}`, padding:"14px 20px", display:"flex", alignItems:"center", gap:16, justifyContent:"center", flexWrap:"wrap", zIndex:20 }}>
              <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                <input
                  type="number"
                  min={availableCount ? 1 : 0}
                  max={availableCount}
                  value={numCards}
                  onChange={(event) => setNumCards(event.target.value)}
                  onBlur={() => setNumCards(String(clampNum(numCards)))}
                  style={{ width:90, padding:"10px 12px", fontSize:16, color:t.text, background:t.card, border:`1px solid ${t.border}`, borderRadius:8 }}
                />
                <span style={{ color:t.muted, fontSize:14 }}>
                  of <strong style={{ color:t.text }}>{availableCount}</strong> selected
                </span>
              </div>
              {setupError && <span style={{ color:dark ? "#F87171" : "#DC2626", fontSize:13 }}>{setupError}</span>}
              <button
                onClick={() => startReview(finalPool, numCards)}
                disabled={starting || availableCount === 0}
                style={{ background:accent, color:"#fff", border:"none", borderRadius:10, padding:"12px 30px", fontSize:15, fontWeight:700, cursor:starting || availableCount === 0 ? "not-allowed" : "pointer", fontFamily:font, opacity:starting || availableCount === 0 ? 0.6 : 1 }}
              >
                {starting ? "Starting…" : `Start review${availableCount > 0 ? ` · ${selectedCount}` : ""}`}
              </button>
              {sessionMode && availableCount === 0 && (
                <button onClick={() => goToNextTask(navigate)} style={{ background:"#16A34A", color:"#fff", border:"none", borderRadius:10, padding:"12px 30px", fontSize:15, fontWeight:700, cursor:"pointer", fontFamily:font }}>Next task →</button>
              )}
            </div>
          </div>
        )}

        {/* ---------- REVIEW ---------- */}
        {!loading && phase==="review" && queue[idx] && (
          <div>
            <div style={{ background:t.card, borderRadius:16, padding:revealed?"30px 28px":"36px 28px", minHeight:260, position:"relative", display:"flex", flexDirection:"column" }}>
              {sourceLabel && (
                <div style={{ fontSize:12, color:t.muted, marginBottom:8 }}>{sourceLabel}</div>
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
            <div style={{ display:"flex", gap:10, justifyContent:"center", flexWrap:"wrap" }}>
              {sessionMode && (
                <button onClick={()=>goToNextTask(navigate)} style={{ background:"#16A34A", color:"#fff", border:"none", borderRadius:10, padding:"13px 28px", fontSize:15, fontWeight:700, cursor:"pointer", fontFamily:font }}>Next task →</button>
              )}
              <button onClick={()=>setPhase("setup")} style={{ background: sessionMode ? "transparent" : "#2563EB", color: sessionMode ? t.text : "#fff", border: sessionMode ? `1px solid ${t.border}` : "none", borderRadius:10, padding:"13px 28px", fontSize:15, fontWeight:700, cursor:"pointer", fontFamily:font }}>Back to home</button>
            </div>
          </div>
        )}
      </div>
    </div>
    </>
  );
}

/* ---- setup sub-components (mirrors Questions.jsx) ---- */
function Section({ title, children, locked, master, totalPill, theme }) {
  const { t, headColor } = theme;
  return (
    <div style={{ opacity:locked ? 0.4 : 1, padding:"22px 0", borderTop:`0.5px solid ${t.border}` }}>
      <div style={{ display:"flex", alignItems:"center", gap:12, marginBottom:16 }}>
        {master && (
          <button
            onClick={master.onToggle}
            disabled={master.disabled}
            aria-label="Select all"
            style={{ background:"transparent", border:"none", padding:0, cursor:master.disabled ? "default" : "pointer", lineHeight:0 }}
          >
            <Checkbox on={master.on} theme={theme} />
          </button>
        )}
        <h3 style={{ margin:0, fontSize:19, fontWeight:500, color:headColor }}>{title}</h3>
        {totalPill != null && <TotalPill n={totalPill} theme={theme} />}
      </div>
      {children}
    </div>
  );
}

function Grid({ children, single }) {
  return <div style={{ display:"grid", gridTemplateColumns:single ? "1fr" : "repeat(2, 1fr)", gap:14 }}>{children}</div>;
}

function CheckRow({ on, onClick, label, count, theme }) {
  const { t, accent, selectedBackground } = theme;
  return (
    <button
      onClick={onClick}
      style={{ display:"flex", alignItems:"center", gap:12, padding:"12px 14px", border:`1px solid ${on ? accent : t.border}`, borderRadius:10, background:on ? selectedBackground : t.card, cursor:"pointer", textAlign:"left", width:"100%", fontFamily:font }}
    >
      <Checkbox on={on} theme={theme} />
      <span style={{ flex:1, minWidth:0, display:"flex", alignItems:"center", gap:8 }}>
        <span style={{ overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", fontSize:14, color:t.text }}>{label}</span>
        <CountPill n={count} theme={theme} />
      </span>
    </button>
  );
}

function StatusToggle({ on, onClick, label, count, theme }) {
  const { t, accent } = theme;
  return (
    <button onClick={onClick} style={{ display:"inline-flex", alignItems:"center", gap:8, background:"transparent", border:"none", cursor:"pointer", padding:"2px 0", fontFamily:font }}>
      <span style={{ width:18, height:18, borderRadius:5, flexShrink:0, border:`2px solid ${on ? accent : "#CBD5E1"}`, background:on ? accent : t.card, color:"#fff", display:"flex", alignItems:"center", justifyContent:"center", fontSize:11, fontWeight:800 }}>
        {on ? "✓" : ""}
      </span>
      <span style={{ fontSize:14, color:t.text }}>{label}</span>
      <CountPill n={count} theme={theme} />
    </button>
  );
}

function CountPill({ n, theme }) {
  return (
    <span style={{ color:theme.accent, fontSize:12, fontWeight:600, border:`1px solid ${theme.pillBorder}`, borderRadius:999, padding:"1px 9px", flexShrink:0, fontVariantNumeric:"tabular-nums" }}>
      ({n})
    </span>
  );
}

function TotalPill({ n, theme }) {
  return (
    <span style={{ color:theme.accent, fontSize:13, fontWeight:700, border:`1px solid ${theme.pillBorder}`, background:theme.selectedBackground, borderRadius:999, padding:"3px 12px" }}>
      Total Available {n}
    </span>
  );
}

function Checkbox({ on, theme }) {
  const { t, accent } = theme;
  return (
    <span style={{ width:26, height:26, borderRadius:7, flexShrink:0, border:`2px solid ${on ? accent : "#CBD5E1"}`, background:on ? accent : t.card, color:"#fff", display:"flex", alignItems:"center", justifyContent:"center", fontSize:15, fontWeight:800 }}>
      {on ? "✓" : ""}
    </span>
  );
}

function Locked({ children, theme }) {
  return <div style={{ padding:16, border:`1px dashed ${theme.t.border}`, borderRadius:10, color:theme.t.muted, fontStyle:"italic" }}>{children}</div>;
}

function Empty({ children, theme }) {
  return <div style={{ padding:16, border:`1px dashed ${theme.t.border}`, borderRadius:10, color:theme.t.muted }}>{children}</div>;
}

/* styles */
const iconBtn = (t) => ({ background:"transparent", border:`1px solid ${t.border}`, borderRadius:8, padding:"6px 11px", cursor:"pointer", fontSize:14, color:t.text, fontFamily:font });

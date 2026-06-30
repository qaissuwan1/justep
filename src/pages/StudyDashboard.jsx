// Study Dashboard — implements the "JUStep Study Dashboard" design.
// Wired to the migration 017/018 analytics functions:
//   study_queue_summary · get_study_queue · at_risk_topics · weak_concepts · mastery_system
// Light/blue visual language from the design (distinct from the app's navy shell).
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import useIsMobile from "../lib/useIsMobile";

/* ---- design tokens (from the .dc.html) ---- */
const FONT = "'Geist',-apple-system,system-ui,sans-serif";
const INK = "#15151A";
const INK2 = "#28282E";
const MUTED = "#8A8A8F";
const MUTED2 = "#9A9AA0";
const FAINT = "#B0B0B6";
const BLUE = "#2B5CE6";
const LINE = "#ECECEE";
const LINE2 = "#F2F2F4";

// Study-queue severity → pill + dot styling (priority from get_study_queue).
const SEV = {
  critical: { label: "Critical", dot: "#E5484D", pillBg: "#FDECEC", pillColor: "#C8313A" },
  high: { label: "High", dot: "#E8920E", pillBg: "#FBF0E1", pillColor: "#B0710D" },
  medium: { label: "Medium", dot: "#2B7FFF", pillBg: "#E8F1FF", pillColor: "#2563C9" },
};

const RING_C = 2 * Math.PI * 38; // circumference for r=38 (matches the design)

function fmtMins(m) {
  const n = Math.max(0, Math.round(Number(m) || 0));
  if (n < 60) return `${n} min`;
  const h = Math.floor(n / 60);
  const mm = n % 60;
  return mm ? `${h}h ${mm}m` : `${h}h`;
}

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

function fmtToday() {
  return new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}

function dayKey(d) {
  const x = new Date(d);
  return `${x.getFullYear()}-${x.getMonth()}-${x.getDate()}`;
}
function computeStreak(dates) {
  if (!dates.length) return 0;
  const days = new Set(dates.map(dayKey));
  let streak = 0;
  const cur = new Date();
  if (!days.has(dayKey(cur))) {
    cur.setDate(cur.getDate() - 1);
    if (!days.has(dayKey(cur))) return 0;
  }
  while (days.has(dayKey(cur))) {
    streak++;
    cur.setDate(cur.getDate() - 1);
  }
  return streak;
}

// Mastery-map ring color (null = not started → grey track only).
function ringColor(score) {
  if (score == null) return null;
  if (score <= 40) return "#E5484D"; // needs work
  if (score <= 70) return "#E8920E"; // in progress
  return "#2B7FFF"; // on track
}

// Route a queue task to the right deep-linked page.
function routeFor(item) {
  switch (item?.item_type) {
    case "WRONG_QUESTION":
      return "/app/questions?mode=incorrect";
    case "FLASHCARD_DUE":
      return "/app/flashcards?mode=due";
    case "LECTURE_UNFINISHED":
      return item.ref_id ? `/app/subjects?lecture=${item.ref_id}` : "/app/subjects";
    default:
      return "/app/questions"; // RECOMMENDED → normal setup
  }
}

export default function StudyDashboard() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [data, setData] = useState(null);
  const [done, setDone] = useState(() => new Set()); // session-only checked tasks (by index)

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      setError(false);
      setDone(new Set());
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        const uid = user?.id;
        if (!uid) return; // finally clears loading

        const now = new Date().toISOString();
        const [profile, streakRows, summary, queue, atRisk, weak, systems] = await Promise.all([
          supabase.from("profiles").select("full_name,email").eq("id", uid).maybeSingle().then((r) => r.data),
          supabase.from("user_progress").select("answered_at").eq("user_id", uid).then((r) => r.data || []),
          supabase.rpc("study_queue_summary", { p_user_id: uid, as_of: now }).then((r) => r.data?.[0] || null),
          supabase.rpc("get_study_queue", { p_user_id: uid, as_of: now }).then((r) => r.data || []),
          supabase.rpc("at_risk_topics", { p_user_id: uid, as_of: now }).then((r) => r.data || []),
          supabase.rpc("weak_concepts", { p_user_id: uid, as_of: now }).then((r) => r.data || []),
          (async () => {
            const { data: sys } = await supabase.from("systems").select("id,name").order("name");
            return Promise.all(
              (sys || []).map(async (s) => {
                const { data: score } = await supabase.rpc("mastery_system", {
                  p_user_id: uid,
                  p_system_id: s.id,
                  as_of: now,
                });
                return { id: s.id, name: s.name, score: score == null ? null : Number(score) };
              })
            );
          })(),
        ]);

        if (!active) return;
        const fullName = profile?.full_name || profile?.email?.split("@")[0] || "there";
        setData({
          firstName: fullName.split(" ")[0],
          streak: computeStreak((streakRows || []).map((r) => r.answered_at)),
          summary: summary || { total_tasks: queue.length, total_minutes: 0 },
          queue,
          atRisk,
          weak,
          systems,
        });
      } catch {
        if (active) setError(true);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [reloadKey]);

  const toggle = (i) =>
    setDone((prev) => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });

  const startSession = () => {
    const queue = data?.queue || [];
    const firstOpen = queue.find((_, i) => !done.has(i)) || queue[0];
    navigate(firstOpen ? routeFor(firstOpen) : "/app/questions");
  };

  if (loading) return <LoadingView isMobile={isMobile} />;
  if (error)
    return (
      <Shell isMobile={isMobile}>
        <Card style={{ textAlign: "center", padding: "40px 24px" }}>
          <div style={{ fontSize: 14, color: INK2, marginBottom: 14 }}>Couldn't load your dashboard.</div>
          <button onClick={() => setReloadKey((k) => k + 1)} style={btnPrimary}>
            Try again
          </button>
        </Card>
      </Shell>
    );

  const { firstName, streak, summary, queue, atRisk, weak, systems } = data;
  const total = queue.length;
  const doneCount = [...done].filter((i) => i < total).length;
  const progressPct = total ? Math.round((doneCount / total) * 100) : 0;

  return (
    <Shell isMobile={isMobile}>
      {/* TOP BAR */}
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "2px 4px 6px", flexWrap: "wrap", gap: 10 }}>
        <span style={{ fontSize: 13.5, color: MUTED, fontWeight: 450, letterSpacing: "-0.01em" }}>
          {greeting()}, {firstName}
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <span style={{ fontSize: 13, color: "#A2A2A8", fontWeight: 450 }}>{fmtToday()}</span>
          {streak >= 1 && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 11px 5px 9px", background: "#FCF1DE", border: "1px solid #F2DFBC", borderRadius: 999, fontSize: 12.5, fontWeight: 550, color: "#A9700C" }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="#E8920E"><path d="M12 2c.5 3.5-1.8 4.6-2.9 6.5C7.6 11 8 13.5 8 13.5s-1.5-.8-2-2.4c-.9 1.3-1.5 2.9-1.5 4.6C4.5 19.6 7.9 22 12 22s7.5-2.4 7.5-6.3c0-3.7-2.4-6.2-3.9-8.1C13.7 5.2 12.6 3.7 12 2z" /></svg>
              {streak}-day streak
            </span>
          )}
        </div>
      </header>

      {/* TODAY'S PLAN */}
      <section style={{ position: "relative", background: "#fff", border: `1px solid ${LINE}`, borderLeft: `3px solid ${BLUE}`, borderRadius: 12, padding: "22px 24px", display: "flex", alignItems: isMobile ? "stretch" : "center", justifyContent: "space-between", gap: 24, flexDirection: isMobile ? "column" : "row" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, fontWeight: 600, color: BLUE, letterSpacing: "0.02em", marginBottom: 9 }}>Today's plan</div>
          <div style={{ fontSize: 26, fontWeight: 600, letterSpacing: "-0.025em", color: INK }}>
            {summary.total_tasks} task{summary.total_tasks === 1 ? "" : "s"} · {fmtMins(summary.total_minutes)}
          </div>
          <div style={{ fontSize: 13.5, color: MUTED, marginTop: 5, fontWeight: 450 }}>The system picked these for you.</div>
          <div style={{ display: "flex", alignItems: "center", gap: 11, marginTop: 18, maxWidth: 340 }}>
            <div style={{ flex: 1, height: 6, background: "#EEEEF0", borderRadius: 999, overflow: "hidden" }}>
              <div style={{ height: "100%", background: BLUE, borderRadius: 999, transition: "width .35s ease", width: `${progressPct}%` }} />
            </div>
            <span style={{ fontSize: 12, color: MUTED2, fontWeight: 500, whiteSpace: "nowrap" }}>{doneCount}/{total} complete</span>
          </div>
        </div>
        <button onClick={startSession} style={btnPrimary}>Start session</button>
      </section>

      {/* STUDY QUEUE */}
      <section style={{ background: "#fff", border: `1px solid ${LINE}`, borderRadius: 12, padding: "6px 8px 8px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px 10px" }}>
          <h2 style={h2}>Study queue</h2>
          <span style={{ fontSize: 12, color: FAINT, fontWeight: 450 }}>{total} task{total === 1 ? "" : "s"}</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          {total === 0 ? (
            <EmptyRow>You're all caught up — nothing queued right now.</EmptyRow>
          ) : (
            queue.map((row, i) => {
              const sev = SEV[row.priority] || SEV.medium;
              const isDone = done.has(i);
              return (
                <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 13, padding: "13px 16px", borderRadius: 9 }}>
                  <button
                    onClick={() => toggle(i)}
                    aria-label={isDone ? "Mark not done" : "Mark done"}
                    style={{ flexShrink: 0, width: 18, height: 18, borderRadius: 6, marginTop: 1, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0, transition: "all .15s", background: isDone ? BLUE : "#fff", border: isDone ? `1px solid ${BLUE}` : "1.5px solid #D5D5DB" }}
                  >
                    {isDone && (
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L9 17l-5-5" /></svg>
                    )}
                  </button>
                  <div style={{ width: 7, height: 7, borderRadius: "50%", marginTop: 6, flexShrink: 0, background: sev.dot }} />
                  <div style={{ flex: 1, minWidth: 0, cursor: "pointer" }} onClick={() => navigate(routeFor(row))}>
                    <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 14, fontWeight: 500, letterSpacing: "-0.01em", color: isDone ? "#B2B2B8" : "#22222A", textDecoration: isDone ? "line-through" : "none" }}>{row.title}</span>
                      <span style={{ fontSize: 10.5, fontWeight: 600, letterSpacing: "0.03em", textTransform: "uppercase", padding: "2px 7px", borderRadius: 5, background: sev.pillBg, color: sev.pillColor }}>{sev.label}</span>
                    </div>
                    {row.reason && <div style={{ fontSize: 12.5, color: MUTED2, marginTop: 3, fontWeight: 450 }}>{row.reason}</div>}
                  </div>
                  <span style={{ fontSize: 12.5, color: "#A2A2A8", fontWeight: 450, whiteSpace: "nowrap", marginTop: 1 }}>{fmtMins(row.est_minutes)}</span>
                </div>
              );
            })
          )}
        </div>
      </section>

      {/* TWO COLUMN GRID */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16 }}>
        {/* Needs attention — at_risk_topics */}
        <section style={{ background: "#fff", border: `1px solid ${LINE}`, borderRadius: 12, padding: "18px 18px 8px" }}>
          <h2 style={{ ...h2, marginBottom: 6 }}>Needs attention</h2>
          {atRisk.length === 0 ? (
            <EmptyRow flush>Nothing slipping right now.</EmptyRow>
          ) : (
            atRisk.slice(0, 3).map((t, i, arr) => {
              const recall = Math.round((t.rho ?? 0) * 100);
              return (
                <div key={t.topic_id} style={{ display: "flex", alignItems: "center", gap: 11, padding: "11px 2px", borderBottom: i < arr.length - 1 ? `1px solid ${LINE2}` : "none" }}>
                  <div style={{ width: 7, height: 7, borderRadius: "50%", flexShrink: 0, background: recall < 40 ? "#E5484D" : "#E8920E" }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 500, color: INK2, letterSpacing: "-0.01em" }}>{t.topic_name}</div>
                    <div style={{ fontSize: 12, color: MUTED2, marginTop: 2 }}>Strength {Math.round(t.k)}% · {t.days_ago}d ago</div>
                  </div>
                </div>
              );
            })
          )}
        </section>

        {/* Weak concepts — weak_concepts */}
        <section style={{ background: "#fff", border: `1px solid ${LINE}`, borderRadius: 12, padding: "18px 18px 8px" }}>
          <h2 style={{ ...h2, marginBottom: 6 }}>Weak concepts</h2>
          {weak.length === 0 ? (
            <EmptyRow flush>No weak spots detected yet.</EmptyRow>
          ) : (
            weak.slice(0, 3).map((w) => {
              const score = Math.round(w.weakness_score);
              const hot = score >= 25;
              return (
                <div key={w.topic_id_out} style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 2px" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, fontWeight: 500, color: INK2, letterSpacing: "-0.01em" }}>{w.topic_name}</div>
                    <div style={{ fontSize: 12, color: MUTED2, marginTop: 2 }}>{w.subject_name}</div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, padding: "3px 11px", borderRadius: 7, background: hot ? "#FDECEC" : "#FBF0E1", color: hot ? "#C8313A" : "#B0710D" }}>{score}</span>
                    <span style={{ fontSize: 10.5, color: FAINT, fontWeight: 450 }}>Score</span>
                  </div>
                </div>
              );
            })
          )}
        </section>
      </div>

      {/* MASTERY MAP — mastery_system per system */}
      <section style={{ background: "#fff", border: `1px solid ${LINE}`, borderRadius: 12, padding: "20px 24px 22px" }}>
        <h2 style={{ ...h2, marginBottom: 20 }}>Mastery map</h2>
        {systems.length === 0 ? (
          <EmptyRow flush>No systems set up yet.</EmptyRow>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: 16 }}>
            {systems.map((s) => {
              const pct = s.score == null ? null : Math.round(s.score);
              const col = ringColor(s.score);
              return (
                <div key={s.id} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
                  <div style={{ position: "relative", width: 88, height: 88 }}>
                    <svg width="88" height="88" viewBox="0 0 88 88">
                      <circle cx="44" cy="44" r="38" fill="none" stroke="#F0F0F2" strokeWidth="7" />
                      {col && (
                        <circle cx="44" cy="44" r="38" fill="none" stroke={col} strokeWidth="7" strokeLinecap="round" strokeDasharray={`${(pct / 100) * RING_C} ${RING_C}`} transform="rotate(-90 44 44)" />
                      )}
                    </svg>
                    <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: pct == null ? 500 : 600, color: pct == null ? "#C4C4CA" : INK }}>
                      {pct == null ? "—" : `${pct}%`}
                    </div>
                  </div>
                  <span style={{ fontSize: 12.5, color: "#6E6E76", fontWeight: 500, textAlign: "center" }}>{s.name}</span>
                </div>
              );
            })}
          </div>
        )}

        {/* legend */}
        <div style={{ display: "flex", alignItems: "center", gap: 20, marginTop: 22, paddingTop: 18, borderTop: `1px solid ${LINE2}`, flexWrap: "wrap" }}>
          {[
            ["#E5484D", "Needs work"],
            ["#E8920E", "In progress"],
            ["#2B7FFF", "On track"],
            ["#D6D6DB", "Not started"],
          ].map(([c, label]) => (
            <span key={label} style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 12, color: MUTED, fontWeight: 450 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: c }} />
              {label}
            </span>
          ))}
        </div>
      </section>
    </Shell>
  );
}

/* ---------------- layout + reusable bits ---------------- */
function Shell({ children, isMobile }) {
  return (
    <div style={{ background: "#F6F6F7", fontFamily: FONT, color: INK, minHeight: "100%", margin: isMobile ? "-72px -16px -28px" : "-32px -36px", padding: isMobile ? "32px 16px 48px" : "40px 24px 64px", WebkitFontSmoothing: "antialiased" }}>
      <div style={{ maxWidth: 880, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 }}>{children}</div>
    </div>
  );
}

function Card({ children, style }) {
  return <div style={{ background: "#fff", border: `1px solid ${LINE}`, borderRadius: 12, padding: 20, ...style }}>{children}</div>;
}

function EmptyRow({ children, flush }) {
  return <div style={{ fontSize: 13, color: MUTED2, fontWeight: 450, padding: flush ? "8px 2px 14px" : "14px 16px 18px" }}>{children}</div>;
}

function LoadingView({ isMobile }) {
  const block = (h) => <div style={{ background: "#ECECEE", borderRadius: 12, height: h }} />;
  return (
    <Shell isMobile={isMobile}>
      {block(28)}
      {block(120)}
      {block(190)}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16 }}>
        {block(150)}
        {block(150)}
      </div>
      {block(220)}
    </Shell>
  );
}

const h2 = { fontSize: 14, fontWeight: 600, color: INK, letterSpacing: "-0.01em" };
const btnPrimary = {
  flexShrink: 0,
  background: BLUE,
  color: "#fff",
  border: "none",
  borderRadius: 9,
  padding: "11px 20px",
  fontFamily: FONT,
  fontSize: 14,
  fontWeight: 550,
  letterSpacing: "-0.01em",
  cursor: "pointer",
};

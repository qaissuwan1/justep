import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { colors, gradients, font } from "../theme";
import Skeleton, { ErrorState } from "./Skeleton";

/* ------------------------------------------------------------------ */
/*  Shared dashboard — used by Home (self) and Admin (admin)          */
/*  Hero banner design · all data live + fresh on every mount         */
/* ------------------------------------------------------------------ */

const DAILY_GOAL = 10;

/* ---- date / streak helpers (self-contained) ---- */
function dayKey(d) {
  const x = new Date(d);
  return `${x.getFullYear()}-${x.getMonth()}-${x.getDate()}`;
}
function isToday(d) {
  return dayKey(d) === dayKey(new Date());
}
function computeStreak(dates) {
  if (!dates.length) return 0;
  const days = new Set(dates.map((d) => dayKey(d)));
  let streak = 0;
  const cursor = new Date();
  // allow streak to count if answered today OR yesterday (grace for "haven't done today yet")
  if (!days.has(dayKey(cursor))) {
    cursor.setDate(cursor.getDate() - 1);
    if (!days.has(dayKey(cursor))) return 0;
  }
  while (days.has(dayKey(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}
function timeAgo(d) {
  const s = Math.floor((Date.now() - new Date(d).getTime()) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(d).toLocaleDateString();
}
function fmtDate(d) {
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

/* ---- mastery band → label + colors (mirrors migration 017 mastery_band) ---- */
const BANDS = {
  "Not Started": { color: "#6B7280", bg: "#F3F4F6" },
  Learning: { color: colors.red, bg: "#FEE2E2" },
  Reviewing: { color: colors.amber, bg: "#FEF3C7" },
  Proficient: { color: colors.blue, bg: "#DBEAFE" },
  Mastered: { color: colors.green, bg: "#DCFCE7" },
};
function bandOf(score) {
  if (score == null) return "Not Started";
  if (score <= 40) return "Learning";
  if (score <= 60) return "Reviewing";
  if (score <= 80) return "Proficient";
  return "Mastered";
}
// Today's Mission: dot + suggested action by score band.
function missionDot(score) {
  const s = score ?? 0;
  return s <= 40 ? "🔴" : s <= 60 ? "🟠" : s <= 80 ? "🟡" : "🟢";
}
function missionAction(score) {
  const s = score ?? 0;
  if (s <= 40) return { text: "Solve 10 questions", to: "/app/questions" };
  if (s <= 60) return { text: "Review 15 flashcards", to: "/app/flashcards" };
  if (s <= 80) return { text: "Solve 5 questions", to: "/app/questions" };
  return { text: "Keep it sharp — review flashcards", to: "/app/flashcards" };
}

export default function StudentAnalytics({ userId = null, mode = "self" }) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [profile, setProfile] = useState(null);
  const [rows, setRows] = useState([]); // user_progress joined to questions->subjects
  const [cardsReviewed, setCardsReviewed] = useState(0);
  // Smart widgets (mastery map / mission / at-risk) load independently so a
  // mastery RPC failure degrades gracefully instead of breaking the dashboard.
  const [mastery, setMastery] = useState(null); // { systems, mission, atRisk }
  const [masteryLoading, setMasteryLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      setError(false);
      try {
        // resolve the user id
        let uid = userId;
        if (mode === "self") {
          const {
            data: { user },
          } = await supabase.auth.getUser();
          uid = user?.id || null;
        }
        if (!uid) return; // finally clears loading

        // fresh queries on every mount — never cached
        const [profRes, progRes, cardRes] = await Promise.all([
          supabase.from("profiles").select("full_name,email").eq("id", uid).maybeSingle(),
          supabase
            .from("user_progress")
            .select("is_correct,answered_at,questions(topic,subjects(name,color))")
            .eq("user_id", uid)
            .order("answered_at", { ascending: false }),
          supabase
            .from("flashcard_progress")
            .select("id", { count: "exact", head: true })
            .eq("user_id", uid),
        ]);
        // Progress + card count are essential; the profile lookup is soft.
        if (progRes.error || cardRes.error) throw progRes.error || cardRes.error;

        if (!active) return;
        setProfile(profRes.data || null);
        setRows(progRes.data || []);
        setCardsReviewed(cardRes.count || 0);
      } catch {
        if (active) setError(true);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [userId, mode, reloadKey]);

  // Smart widgets — only for the personal Home dashboard (self mode). All three
  // sections load in parallel via Promise.all; RPC names/params match migration 017.
  useEffect(() => {
    let active = true;
    (async () => {
      if (mode !== "self") {
        if (active) setMasteryLoading(false);
        return;
      }
      setMasteryLoading(true);
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        const uid = user?.id;
        if (!uid) {
          if (active) {
            setMastery(null);
            setMasteryLoading(false);
          }
          return;
        }
        const now = new Date().toISOString();

        const [systems, mission, atRisk] = await Promise.all([
          // SECTION 1 — Mastery Map: every system, scored.
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
          // SECTION 2 — Today's Mission: weakest 3 of the subjects the user has attempted.
          (async () => {
            const { data: att } = await supabase
              .from("user_progress")
              .select("questions(subject_id, subjects(name))")
              .eq("user_id", uid);
            const seen = new Map();
            (att || []).forEach((r) => {
              const sid = r.questions?.subject_id;
              if (sid && !seen.has(sid)) seen.set(sid, r.questions?.subjects?.name || "Subject");
            });
            const scored = await Promise.all(
              [...seen].map(async ([sid, name]) => {
                const { data: score } = await supabase.rpc("mastery_subject", {
                  p_user_id: uid,
                  p_subject_id: sid,
                  as_of: now,
                });
                return { id: sid, name, score: score == null ? 0 : Number(score) }; // null → 0
              })
            );
            return scored.sort((a, b) => a.score - b.score).slice(0, 3);
          })(),
          // SECTION 3 — At-Risk: already ordered by severity in the function.
          supabase.rpc("at_risk_topics", { p_user_id: uid, as_of: now }).then(({ data }) => data || []),
        ]);

        if (!active) return;
        setMastery({ systems, mission, atRisk: (atRisk || []).slice(0, 3) });
      } catch {
        if (active) setMastery(null); // hide the widgets on failure
      } finally {
        if (active) setMasteryLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [mode, reloadKey]);

  const retry = () => setReloadKey((k) => k + 1);

  if (error) {
    return (
      <div style={page}>
        <ErrorState onRetry={retry} />
      </div>
    );
  }

  if (loading) {
    return (
      <div style={page}>
        <div style={heroWrap}>
          <Skeleton height={150} radius={20} />
          <div style={statsRow}>
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} height={84} radius={14} />
            ))}
          </div>
        </div>
        <div style={twoCol}>
          <div style={cardStyle}>
            <Skeleton width={170} height={14} style={{ marginBottom: 18 }} />
            {[0, 1, 2].map((i) => (
              <div key={i} style={{ marginBottom: 16 }}>
                <Skeleton width="55%" height={12} style={{ marginBottom: 8 }} />
                <Skeleton height={8} radius={99} />
              </div>
            ))}
          </div>
          <div style={cardStyle}>
            <Skeleton width={140} height={14} style={{ marginBottom: 18 }} />
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} height={30} style={{ marginBottom: 12 }} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  /* ---- derive everything live from rows ---- */
  const total = rows.length;
  const correct = rows.filter((r) => r.is_correct).length;
  const accuracy = total ? Math.round((correct / total) * 100) : 0;

  const todayRows = rows.filter((r) => isToday(r.answered_at));
  const answeredToday = todayRows.length;
  const todayCorrect = todayRows.filter((r) => r.is_correct).length;
  const todayAccuracy = answeredToday ? Math.round((todayCorrect / answeredToday) * 100) : 0;

  const streak = computeStreak(rows.map((r) => r.answered_at));

  // performance by subject
  const bySubject = {};
  rows.forEach((r) => {
    const name = r.questions?.subjects?.name || "Unknown";
    const color = r.questions?.subjects?.color || colors.blue;
    if (!bySubject[name]) bySubject[name] = { name, color, total: 0, correct: 0 };
    bySubject[name].total++;
    if (r.is_correct) bySubject[name].correct++;
  });
  const subjects = Object.values(bySubject).sort((a, b) => b.total - a.total);

  const recent = rows.slice(0, 5);

  const fullName = profile?.full_name || profile?.email?.split("@")[0] || "there";
  const firstName = fullName.split(" ")[0];
  const initial = fullName.charAt(0).toUpperCase();

  const isSelf = mode === "self";
  const hasData = total > 0 || cardsReviewed > 0;

  /* ---- new-user empty state (self only) ---- */
  if (isSelf && !hasData) {
    return (
      <div style={page}>
        <div style={{ ...heroWrap, marginBottom: 24 }}>
          <div style={hero}>
            <div style={heroDate}>{fmtDate(new Date())}</div>
            <div style={heroTitle}>Welcome back, {firstName}</div>
          </div>
        </div>
        <div style={{ ...cardStyle, textAlign: "center", padding: "48px 24px" }}>
          <div style={{ color: colors.blue, display: "flex", justifyContent: "center" }}><IconChart size={36} /></div>
          <h2 style={{ fontSize: 22, color: colors.text, margin: "12px 0 6px" }}>Let's get started</h2>
          <p style={{ color: colors.textSoft, maxWidth: 380, margin: "0 auto 24px" }}>
            Answer your first question to see your stats, streak, and performance here.
          </p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            <button style={{ ...filledBtn, display: "inline-flex", alignItems: "center", gap: 8 }} onClick={() => navigate("/app/questions")}>
              Start Question Block <IconArrow />
            </button>
            <button style={outlineBtn} onClick={() => navigate("/app/flashcards")}>
              Review Flashcards
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={page}>
      {/* HERO BANNER */}
      <div style={heroWrap}>
        <div style={hero}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div style={heroDate}>{isSelf ? fmtDate(new Date()) : profile?.email}</div>
              <div style={heroTitle}>
                {isSelf ? `Welcome back, ${firstName}` : fullName}
              </div>
            </div>
            <div style={avatar}>{initial}</div>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
            <span style={pill}>
              <span style={{ marginRight: 6, display: "inline-flex" }}><IconFlame size={15} /></span>
              {streak} day streak
            </span>
            {answeredToday > 0 && (
              <span style={pill}>
                <span style={{ marginRight: 6, display: "inline-flex" }}><IconTarget size={15} /></span>
                {todayAccuracy}% today
              </span>
            )}
          </div>
        </div>

        {/* STAT CARDS overlapping the hero bottom */}
        <div style={statsRow}>
          <StatCard icon={<IconPencil />} value={total} label="Answered" accent={colors.blue} />
          <StatCard icon={<IconCheck />} value={`${accuracy}%`} label="Accuracy" accent={colors.green} />
          <StatCard icon={<IconLayers />} value={cardsReviewed} label="Cards" accent={colors.teal} />
          <StatCard icon={<IconFlame />} value={streak} label="Streak" accent={colors.amber} />
        </div>
      </div>

      {/* DAILY GOAL — self only */}
      {isSelf && (
        <div style={{ ...cardStyle, marginBottom: 18 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: colors.text, display: "inline-flex", alignItems: "center", gap: 6 }}>
              <IconTarget size={16} /> Daily goal — {Math.min(answeredToday, DAILY_GOAL)} of {DAILY_GOAL} questions
            </span>
            <span style={{ fontSize: 13, color: colors.textSoft }}>
              {Math.min(Math.round((answeredToday / DAILY_GOAL) * 100), 100)}%
            </span>
          </div>
          <div style={track}>
            <div
              style={{
                ...trackFill,
                width: `${Math.min((answeredToday / DAILY_GOAL) * 100, 100)}%`,
                background: gradients.accent,
              }}
            />
          </div>
        </div>
      )}

      {/* TWO COLUMNS */}
      <div style={twoCol}>
        {/* Performance by subject */}
        <div style={cardStyle}>
          <h3 style={cardTitle}>Performance by subject</h3>
          {subjects.length === 0 ? (
            <p style={{ color: colors.textMuted, fontSize: 14 }}>
              Answer questions in a subject to see your accuracy here.
            </p>
          ) : (
            subjects.map((s) => {
              const pct = Math.round((s.correct / s.total) * 100);
              return (
                <div key={s.name} style={{ marginBottom: 14 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, marginBottom: 6 }}>
                    <span style={{ color: colors.text, textTransform: "capitalize" }}>{s.name}</span>
                    <span style={{ color: colors.textSoft }}>
                      {pct}% · {s.total}
                    </span>
                  </div>
                  <div style={track}>
                    <div style={{ ...trackFill, width: `${pct}%`, background: s.color }} />
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Recent activity */}
        <div style={cardStyle}>
          <h3 style={cardTitle}>Recent activity</h3>
          {recent.length === 0 ? (
            <p style={{ color: colors.textMuted, fontSize: 14 }}>No activity yet.</p>
          ) : (
            recent.map((r, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "10px 0",
                  borderBottom: i < recent.length - 1 ? `1px solid ${colors.line}` : "none",
                }}
              >
                <span
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: "50%",
                    flexShrink: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: r.is_correct ? "#DCFCE7" : "#FEE2E2",
                    color: r.is_correct ? colors.green : colors.red,
                    fontWeight: 700,
                  }}
                >
                  {r.is_correct ? <IconCheckSm /> : <IconCrossSm />}
                </span>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div
                    style={{
                      fontSize: 14,
                      color: colors.text,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {r.questions?.topic || "Question"}
                  </div>
                  <div style={{ fontSize: 12, color: colors.textSoft, textTransform: "capitalize" }}>
                    {r.questions?.subjects?.name || "—"} · {timeAgo(r.answered_at)}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* QUICK ACTIONS — self only */}
      {isSelf && (
        <div style={{ ...twoCol, marginTop: 18 }}>
          <div style={actionFilled} onClick={() => navigate("/app/questions")}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700 }}>Start question block</div>
              <div style={{ fontSize: 12, opacity: 0.85, marginTop: 2 }}>Jump into the QBank</div>
            </div>
            <IconArrow size={22} />
          </div>
          <div style={actionOutline} onClick={() => navigate("/app/flashcards")}>
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: colors.text }}>Review flashcards</div>
              <div style={{ fontSize: 12, color: colors.textSoft, marginTop: 2 }}>Spaced repetition</div>
            </div>
            <span style={{ color: colors.textSoft, display: "inline-flex" }}><IconLayers size={22} /></span>
          </div>
        </div>
      )}

      {/* SMART WIDGETS — self only: Mastery Map → Today's Mission → At-Risk */}
      {isSelf &&
        (masteryLoading ? (
          <MasterySkeletons />
        ) : (
          mastery && (
            <>
              <MasteryMap systems={mastery.systems} />
              <TodaysMission mission={mastery.mission} navigate={navigate} />
              {mastery.atRisk.length > 0 && <AtRiskAlerts items={mastery.atRisk} navigate={navigate} />}
            </>
          )
        ))}
    </div>
  );
}

/* ---------------- smart widgets ---------------- */
function SectionHead({ title, subtitle }) {
  return (
    <>
      <h3 style={{ ...cardTitle, marginBottom: 4 }}>{title}</h3>
      <div style={sectionSub}>{subtitle}</div>
    </>
  );
}

function MasteryMap({ systems }) {
  return (
    <div style={{ ...cardStyle, marginTop: 18 }}>
      <SectionHead title="Mastery Map" subtitle="Your progress across all systems" />
      {systems.length === 0 ? (
        <p style={{ color: colors.textMuted, fontSize: 14, margin: 0 }}>No systems set up yet.</p>
      ) : (
        systems.map((s) => {
          const band = bandOf(s.score);
          const bc = BANDS[band];
          const pct = s.score == null ? 0 : Math.round(s.score);
          return (
            <div key={s.id} style={mapRow}>
              <div style={{ flex: "0 0 140px", fontSize: 14, color: colors.text, textTransform: "capitalize" }}>{s.name}</div>
              <span style={{ ...bandBadge, background: bc.bg, color: bc.color }}>{band}</span>
              <div style={{ ...track, flex: "1 1 110px", minWidth: 90 }}>
                <div style={{ ...trackFill, width: `${pct}%`, background: bc.color }} />
              </div>
              <div style={{ width: 40, textAlign: "right", fontSize: 13, fontWeight: 700, color: colors.text }}>{pct}%</div>
            </div>
          );
        })
      )}
    </div>
  );
}

function TodaysMission({ mission, navigate }) {
  return (
    <div style={{ ...cardStyle, marginTop: 18 }}>
      <SectionHead title="Today's Mission" subtitle="Focus on these today" />
      {mission.length === 0 ? (
        <p style={{ color: colors.textMuted, fontSize: 14, margin: 0 }}>Complete some questions to see your mission.</p>
      ) : (
        mission.map((m) => {
          const act = missionAction(m.score);
          return (
            <div key={m.id} style={missionCard}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                <span style={{ fontSize: 18 }}>{missionDot(m.score)}</span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: colors.text, textTransform: "capitalize" }}>{m.name}</div>
                  <div style={{ fontSize: 12, color: colors.textSoft }}>{Math.round(m.score)}% · {bandOf(m.score)}</div>
                </div>
              </div>
              <button style={missionBtn} onClick={() => navigate(act.to)}>→ {act.text}</button>
            </div>
          );
        })
      )}
    </div>
  );
}

function AtRiskAlerts({ items, navigate }) {
  return (
    <div style={{ ...cardStyle, marginTop: 18, border: "1px solid #FED7AA" }}>
      <SectionHead title="⚠️ At-Risk Topics" subtitle="You knew these — don't forget them" />
      {items.map((t) => (
        <div key={t.topic_id} style={atRiskCard}>
          <div style={{ fontSize: 14, fontWeight: 700, color: colors.text }}>⚠️ {t.topic_name}</div>
          <div style={{ fontSize: 12, color: colors.textSoft, margin: "4px 0 6px" }}>
            Strength {Math.round(t.k)}% · Retention {Math.round((t.rho ?? 0) * 100)}%
          </div>
          <div style={{ fontSize: 13, color: colors.textSoft, marginBottom: 10 }}>
            You understood this topic but haven't reviewed it recently.
          </div>
          <button style={missionBtn} onClick={() => navigate("/app/flashcards")}>Review Flashcards</button>
        </div>
      ))}
    </div>
  );
}

function MasterySkeletons() {
  return (
    <>
      {[0, 1].map((i) => (
        <div key={i} style={{ ...cardStyle, marginTop: 18 }}>
          <Skeleton width={160} height={14} style={{ marginBottom: 16 }} />
          {[0, 1, 2].map((j) => (
            <Skeleton key={j} height={30} style={{ marginBottom: 12 }} />
          ))}
        </div>
      ))}
    </>
  );
}

/* ---------------- stat card ---------------- */
function StatCard({ icon, value, label, accent }) {
  return (
    <div style={statCard}>
      <span style={{ color: accent, display: "inline-flex" }}>{icon}</span>
      <div style={{ fontSize: 24, fontWeight: 700, color: colors.text, marginTop: 4 }}>{value}</div>
      <div style={{ fontSize: 12, color: colors.textSoft }}>{label}</div>
    </div>
  );
}

/* ---------------- icons (inline SVG, ultra-thin stroke) ---------------- */
function IconPencil({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round">
      <line x1="18" y1="2" x2="22" y2="6" />
      <path d="M7.5 20.5 19 9l-4-4L3.5 16.5 2 22z" />
    </svg>
  );
}
function IconCheck({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
function IconLayers({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round">
      <rect x="3" y="7" width="14" height="10" rx="1" />
      <path d="M5 5h14a1 1 0 0 1 1 1v10" />
    </svg>
  );
}
function IconFlame({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round">
      <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
    </svg>
  );
}
function IconTarget({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round">
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="6" />
      <circle cx="12" cy="12" r="2" />
    </svg>
  );
}
function IconChart({ size = 36 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round">
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
    </svg>
  );
}
function IconArrow({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round">
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </svg>
  );
}
function IconCheckSm({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
function IconCrossSm({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

/* ---------------- styles (from theme.js) ---------------- */
const page = { fontFamily: font, maxWidth: 1100, margin: "0 auto", padding: "8px 4px" };

const heroWrap = { marginBottom: 18 };
const hero = {
  background: gradients.navy,
  borderRadius: 20,
  padding: "26px 28px 56px",
  color: "#fff",
};
const heroDate = { fontSize: 13, opacity: 0.8 };
const heroTitle = { fontSize: 26, fontWeight: 700, marginTop: 2 };
const avatar = {
  width: 46,
  height: 46,
  borderRadius: "50%",
  background: "rgba(255,255,255,0.2)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 18,
  fontWeight: 700,
  flexShrink: 0,
};
const pill = {
  display: "inline-flex",
  alignItems: "center",
  background: "rgba(255,255,255,0.18)",
  padding: "5px 12px",
  borderRadius: 99,
  fontSize: 13,
};
const statsRow = {
  display: "grid",
  // auto-fit + minmax keeps 4 across on desktop, collapses to 2x2 / 1 on phones.
  gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
  gap: 10,
  margin: "-34px 18px 0",
};
const statCard = {
  background: colors.card,
  border: `1px solid ${colors.line}`,
  borderRadius: 14,
  padding: "14px 16px",
  boxShadow: "0 1px 6px rgba(0,0,0,0.05)",
};
const cardStyle = {
  background: colors.card,
  borderRadius: 16,
  padding: "20px 22px",
  boxShadow: "0 1px 6px rgba(0,0,0,0.05)",
};
const cardTitle = { fontSize: 15, fontWeight: 700, color: colors.text, margin: "0 0 14px" };
const twoCol = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 14 };
const track = { height: 8, borderRadius: 99, background: colors.line, overflow: "hidden" };
const trackFill = { height: "100%", borderRadius: 99 };

/* smart-widget styles */
const sectionSub = { fontSize: 13, color: colors.textSoft, margin: "0 0 16px" };
const mapRow = { display: "flex", alignItems: "center", gap: 10, marginBottom: 14, flexWrap: "wrap" };
const bandBadge = { fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 99, whiteSpace: "nowrap" };
const missionCard = {
  border: `1px solid ${colors.line}`,
  borderRadius: 12,
  padding: "12px 14px",
  marginBottom: 10,
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
  flexWrap: "wrap",
};
const missionBtn = {
  background: "#fff",
  color: colors.navy,
  border: `1.5px solid ${colors.line}`,
  borderRadius: 9,
  padding: "8px 14px",
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
  fontFamily: font,
  whiteSpace: "nowrap",
};
const atRiskCard = { border: "1px solid #FED7AA", background: "#FFFBEB", borderRadius: 12, padding: "14px 16px", marginBottom: 10 };

const filledBtn = {
  background: gradients.accent,
  color: "#fff",
  border: "none",
  borderRadius: 12,
  padding: "13px 28px",
  fontSize: 15,
  fontWeight: 700,
  cursor: "pointer",
  fontFamily: font,
};
const outlineBtn = {
  background: "#fff",
  color: colors.navy,
  border: `1.5px solid ${colors.line}`,
  borderRadius: 12,
  padding: "13px 28px",
  fontSize: 15,
  fontWeight: 700,
  cursor: "pointer",
  fontFamily: font,
};
const actionFilled = {
  background: gradients.accent,
  color: "#fff",
  borderRadius: 16,
  padding: "18px 22px",
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
};
const actionOutline = {
  background: colors.card,
  border: `1.5px solid ${colors.line}`,
  borderRadius: 16,
  padding: "18px 22px",
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
};

import { useState } from "react";

const mockData = {
  user: { name: "Qais", year: "2nd Year", university: "University of Jordan" },
  streak: 7,
  todayGoal: { done: 12, total: 20 },
  weeklyScore: [65, 70, 58, 80, 75, 88, 72],
  subjects: [
    { name: "Pathology", progress: 68, color: "#3B82F6", questions: 240 },
    { name: "Pharmacology", progress: 45, color: "#10B981", questions: 180 },
    { name: "Anatomy", progress: 82, color: "#8B5CF6", questions: 310 },
    { name: "Physiology", progress: 30, color: "#F59E0B", questions: 150 },
  ],
  recentTopics: [
    { name: "Liver Pathology", subject: "Pathology", score: 85, questions: 20, date: "Today" },
    { name: "Beta Blockers", subject: "Pharmacology", score: 70, questions: 15, date: "Yesterday" },
    { name: "Brachial Plexus", subject: "Anatomy", score: 92, questions: 18, date: "2 days ago" },
  ],
  upcomingTopics: [
    { name: "Renal Pathology", subject: "Pathology", questions: 25 },
    { name: "Diuretics", subject: "Pharmacology", questions: 20 },
    { name: "Cranial Nerves", subject: "Anatomy", questions: 30 },
  ],
};

const days = ["M", "T", "W", "T", "F", "S", "S"];

export default function JUstepDashboard() {
  const [activePage, setActivePage] = useState("dashboard");
  const [hoveredBar, setHoveredBar] = useState(null);

  const progressPercent = Math.round((mockData.todayGoal.done / mockData.todayGoal.total) * 100);
  const circumference = 2 * Math.PI * 36;
  const dashOffset = circumference - (progressPercent / 100) * circumference;

  return (
    <div style={{
      fontFamily: "'Inter', -apple-system, sans-serif",
      background: "#F0F4FF",
      minHeight: "100vh",
      display: "flex",
      color: "#1E2A4A",
    }}>
      {/* Sidebar */}
      <aside style={{
        width: 220,
        background: "#1E2A4A",
        display: "flex",
        flexDirection: "column",
        padding: "28px 0",
        position: "fixed",
        height: "100vh",
        zIndex: 10,
      }}>
        {/* Logo */}
        <div style={{ padding: "0 24px 32px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{
              width: 36, height: 36,
              background: "linear-gradient(135deg, #4F8EF7, #38BDF8)",
              borderRadius: 10,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 16, fontWeight: 800, color: "#fff",
            }}>J</div>
            <span style={{ fontSize: 20, fontWeight: 800, color: "#fff", letterSpacing: "-0.5px" }}>
              JU<span style={{ color: "#38BDF8" }}>step</span>
            </span>
          </div>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: "0 12px" }}>
          {[
            { id: "dashboard", icon: "⊞", label: "Dashboard" },
            { id: "qbank", icon: "📋", label: "Question Bank" },
            { id: "upload", icon: "⬆", label: "Upload Lecture" },
            { id: "stats", icon: "📊", label: "Performance" },
            { id: "subjects", icon: "📚", label: "Subjects" },
          ].map(item => (
            <button key={item.id} onClick={() => setActivePage(item.id)} style={{
              width: "100%",
              display: "flex", alignItems: "center", gap: 12,
              padding: "11px 14px",
              borderRadius: 10,
              border: "none",
              cursor: "pointer",
              marginBottom: 4,
              background: activePage === item.id ? "rgba(79,142,247,0.18)" : "transparent",
              color: activePage === item.id ? "#4F8EF7" : "rgba(255,255,255,0.55)",
              fontSize: 14,
              fontWeight: activePage === item.id ? 600 : 400,
              transition: "all 0.15s",
              textAlign: "left",
            }}>
              <span style={{ fontSize: 16 }}>{item.icon}</span>
              {item.label}
            </button>
          ))}
        </nav>

        {/* User */}
        <div style={{ padding: "0 16px" }}>
          <div style={{
            background: "rgba(255,255,255,0.07)",
            borderRadius: 12, padding: "12px 14px",
            display: "flex", alignItems: "center", gap: 10,
          }}>
            <div style={{
              width: 34, height: 34, borderRadius: "50%",
              background: "linear-gradient(135deg, #4F8EF7, #38BDF8)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 14, fontWeight: 700, color: "#fff", flexShrink: 0,
            }}>Q</div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#fff" }}>{mockData.user.name}</div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>{mockData.user.year}</div>
            </div>
          </div>
        </div>
      </aside>

      {/* Main */}
      <main style={{ marginLeft: 220, flex: 1, padding: "32px 36px", maxWidth: "calc(100vw - 220px)" }}>

        {/* Header */}
        <div style={{ marginBottom: 28, display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <h1 style={{ fontSize: 26, fontWeight: 800, margin: 0, letterSpacing: "-0.5px" }}>
              Good morning, {mockData.user.name} 👋
            </h1>
            <p style={{ margin: "4px 0 0", color: "#64748B", fontSize: 14 }}>
              {mockData.user.university} · USMLE Step 1 Track
            </p>
          </div>
          <div style={{
            background: "#fff", borderRadius: 12, padding: "10px 18px",
            display: "flex", alignItems: "center", gap: 8,
            boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
            fontSize: 13, color: "#64748B",
          }}>
            <span>🔥</span>
            <span><b style={{ color: "#F97316", fontSize: 16 }}>{mockData.streak}</b> day streak</span>
          </div>
        </div>

        {/* Top Row */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 18, marginBottom: 22 }}>

          {/* Today's Goal */}
          <div style={{
            background: "#fff", borderRadius: 16, padding: "22px 24px",
            boxShadow: "0 1px 6px rgba(0,0,0,0.05)",
            display: "flex", alignItems: "center", gap: 20,
          }}>
            <svg width={88} height={88} viewBox="0 0 88 88">
              <circle cx={44} cy={44} r={36} fill="none" stroke="#EFF2FF" strokeWidth={8} />
              <circle cx={44} cy={44} r={36} fill="none"
                stroke="url(#grad)" strokeWidth={8}
                strokeDasharray={circumference}
                strokeDashoffset={dashOffset}
                strokeLinecap="round"
                transform="rotate(-90 44 44)"
                style={{ transition: "stroke-dashoffset 0.6s ease" }}
              />
              <defs>
                <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#4F8EF7" />
                  <stop offset="100%" stopColor="#38BDF8" />
                </linearGradient>
              </defs>
              <text x={44} y={48} textAnchor="middle" fontSize={18} fontWeight={800} fill="#1E2A4A">
                {progressPercent}%
              </text>
            </svg>
            <div>
              <div style={{ fontSize: 12, color: "#94A3B8", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.05em" }}>Today's Goal</div>
              <div style={{ fontSize: 28, fontWeight: 800, margin: "4px 0 2px" }}>
                {mockData.todayGoal.done}<span style={{ fontSize: 16, color: "#94A3B8", fontWeight: 400 }}>/{mockData.todayGoal.total}</span>
              </div>
              <div style={{ fontSize: 13, color: "#64748B" }}>questions done</div>
            </div>
          </div>

          {/* Weekly Chart */}
          <div style={{
            background: "#fff", borderRadius: 16, padding: "22px 24px",
            boxShadow: "0 1px 6px rgba(0,0,0,0.05)",
          }}>
            <div style={{ fontSize: 12, color: "#94A3B8", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 14 }}>
              This Week
            </div>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 52 }}>
              {mockData.weeklyScore.map((score, i) => (
                <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                  <div
                    onMouseEnter={() => setHoveredBar(i)}
                    onMouseLeave={() => setHoveredBar(null)}
                    style={{
                      width: "100%",
                      height: `${(score / 100) * 44}px`,
                      background: hoveredBar === i
                        ? "linear-gradient(180deg, #4F8EF7, #38BDF8)"
                        : i === 6 ? "linear-gradient(180deg, #4F8EF7, #38BDF8)" : "#E8EEFF",
                      borderRadius: 5,
                      transition: "all 0.15s",
                      cursor: "pointer",
                      position: "relative",
                    }}
                  >
                    {hoveredBar === i && (
                      <div style={{
                        position: "absolute", top: -24, left: "50%", transform: "translateX(-50%)",
                        background: "#1E2A4A", color: "#fff", fontSize: 11, borderRadius: 5,
                        padding: "2px 6px", whiteSpace: "nowrap",
                      }}>{score}%</div>
                    )}
                  </div>
                  <div style={{ fontSize: 10, color: "#94A3B8" }}>{days[i]}</div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 10, fontSize: 13, color: "#64748B" }}>
              Avg: <b style={{ color: "#1E2A4A" }}>
                {Math.round(mockData.weeklyScore.reduce((a, b) => a + b) / 7)}%
              </b> accuracy
            </div>
          </div>

          {/* Streak Card */}
          <div style={{
            background: "linear-gradient(135deg, #1E2A4A 0%, #2D4070 100%)",
            borderRadius: 16, padding: "22px 24px",
            boxShadow: "0 1px 6px rgba(0,0,0,0.08)",
            color: "#fff",
          }}>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 10 }}>
              Streak
            </div>
            <div style={{ fontSize: 42, marginBottom: 2 }}>🔥</div>
            <div style={{ fontSize: 32, fontWeight: 800, lineHeight: 1 }}>{mockData.streak}</div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", marginTop: 4 }}>days in a row</div>
            <div style={{
              marginTop: 14, background: "rgba(255,255,255,0.1)",
              borderRadius: 8, padding: "8px 12px", fontSize: 12,
              color: "rgba(255,255,255,0.7)",
            }}>
              🏆 Best: 12 days
            </div>
          </div>
        </div>

        {/* Bottom Row */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>

          {/* Subjects Progress */}
          <div style={{
            background: "#fff", borderRadius: 16, padding: "22px 24px",
            boxShadow: "0 1px 6px rgba(0,0,0,0.05)",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
              <div style={{ fontSize: 15, fontWeight: 700 }}>Subjects</div>
              <button style={{
                fontSize: 12, color: "#4F8EF7", background: "none",
                border: "none", cursor: "pointer", fontWeight: 600,
              }}>View all →</button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {mockData.subjects.map(s => (
                <div key={s.name}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{s.name}</span>
                    <span style={{ fontSize: 12, color: "#94A3B8" }}>{s.progress}% · {s.questions}Q</span>
                  </div>
                  <div style={{ background: "#F1F5F9", borderRadius: 999, height: 7 }}>
                    <div style={{
                      width: `${s.progress}%`, height: "100%",
                      background: s.color, borderRadius: 999,
                      transition: "width 0.8s ease",
                    }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Right column */}
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>

            {/* Recent Sessions */}
            <div style={{
              background: "#fff", borderRadius: 16, padding: "20px 22px",
              boxShadow: "0 1px 6px rgba(0,0,0,0.05)",
            }}>
              <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 14 }}>Recent Sessions</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {mockData.recentTopics.map(t => (
                  <div key={t.name} style={{
                    display: "flex", alignItems: "center",
                    justifyContent: "space-between",
                    padding: "10px 12px",
                    background: "#F8FAFF",
                    borderRadius: 10,
                  }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{t.name}</div>
                      <div style={{ fontSize: 11, color: "#94A3B8", marginTop: 2 }}>
                        {t.subject} · {t.questions}Q · {t.date}
                      </div>
                    </div>
                    <div style={{
                      fontSize: 13, fontWeight: 700,
                      color: t.score >= 80 ? "#10B981" : t.score >= 65 ? "#F59E0B" : "#EF4444",
                      background: t.score >= 80 ? "#ECFDF5" : t.score >= 65 ? "#FFFBEB" : "#FEF2F2",
                      padding: "4px 10px", borderRadius: 999,
                    }}>{t.score}%</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Up Next */}
            <div style={{
              background: "#fff", borderRadius: 16, padding: "20px 22px",
              boxShadow: "0 1px 6px rgba(0,0,0,0.05)",
            }}>
              <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 14 }}>Up Next</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {mockData.upcomingTopics.map((t, i) => (
                  <div key={t.name} style={{
                    display: "flex", alignItems: "center", gap: 12,
                    padding: "10px 12px",
                    background: "#F8FAFF", borderRadius: 10,
                    cursor: "pointer",
                    transition: "background 0.15s",
                  }}>
                    <div style={{
                      width: 28, height: 28, borderRadius: 8,
                      background: "linear-gradient(135deg, #4F8EF7, #38BDF8)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 12, fontWeight: 700, color: "#fff", flexShrink: 0,
                    }}>{i + 1}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{t.name}</div>
                      <div style={{ fontSize: 11, color: "#94A3B8" }}>{t.subject} · {t.questions} questions</div>
                    </div>
                    <span style={{ color: "#CBD5E1", fontSize: 16 }}>›</span>
                  </div>
                ))}
              </div>
            </div>

          </div>
        </div>

        {/* Start Button */}
        <div style={{ marginTop: 22, display: "flex", justifyContent: "center" }}>
          <button style={{
            background: "linear-gradient(135deg, #4F8EF7, #38BDF8)",
            color: "#fff", border: "none", borderRadius: 14,
            padding: "14px 48px", fontSize: 15, fontWeight: 700,
            cursor: "pointer", letterSpacing: "0.02em",
            boxShadow: "0 4px 16px rgba(79,142,247,0.35)",
            transition: "transform 0.15s, box-shadow 0.15s",
          }}
            onMouseEnter={e => {
              e.target.style.transform = "translateY(-2px)";
              e.target.style.boxShadow = "0 6px 20px rgba(79,142,247,0.45)";
            }}
            onMouseLeave={e => {
              e.target.style.transform = "translateY(0)";
              e.target.style.boxShadow = "0 4px 16px rgba(79,142,247,0.35)";
            }}
          >
            Start Today's Session →
          </button>
        </div>

      </main>
    </div>
  );
}

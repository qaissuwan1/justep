import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { mockData, days, colors, gradients } from "../theme";
import { Card, SectionTitle, Label, ProgressBar, PrimaryButton, PageHeader } from "../components/ui";

export default function Home() {
  const navigate = useNavigate();
  const [hoveredBar, setHoveredBar] = useState(null);

  const progressPercent = Math.round((mockData.todayGoal.done / mockData.todayGoal.total) * 100);
  const circumference = 2 * Math.PI * 36;
  const dashOffset = circumference - (progressPercent / 100) * circumference;

  return (
    <>
      <PageHeader
        title={`Good morning, ${mockData.user.name} 👋`}
        subtitle={`${mockData.user.university} · USMLE Step 1 Track`}
        right={
          <div
            style={{
              background: "#fff",
              borderRadius: 12,
              padding: "10px 18px",
              display: "flex",
              alignItems: "center",
              gap: 8,
              boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
              fontSize: 13,
              color: colors.textSoft,
            }}
          >
            <span>🔥</span>
            <span>
              <b style={{ color: colors.orange, fontSize: 16 }}>{mockData.streak}</b> day streak
            </span>
          </div>
        }
      />

      {/* Top Row */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 18, marginBottom: 22 }}>
        {/* Today's Goal */}
        <Card style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <svg width={88} height={88} viewBox="0 0 88 88">
            <circle cx={44} cy={44} r={36} fill="none" stroke="#EFF2FF" strokeWidth={8} />
            <circle
              cx={44}
              cy={44}
              r={36}
              fill="none"
              stroke="url(#grad)"
              strokeWidth={8}
              strokeDasharray={circumference}
              strokeDashoffset={dashOffset}
              strokeLinecap="round"
              transform="rotate(-90 44 44)"
              style={{ transition: "stroke-dashoffset 0.6s ease" }}
            />
            <defs>
              <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor={colors.blue} />
                <stop offset="100%" stopColor={colors.teal} />
              </linearGradient>
            </defs>
            <text x={44} y={48} textAnchor="middle" fontSize={18} fontWeight={800} fill={colors.navy}>
              {progressPercent}%
            </text>
          </svg>
          <div>
            <Label>Today's Goal</Label>
            <div style={{ fontSize: 28, fontWeight: 800, margin: "4px 0 2px" }}>
              {mockData.todayGoal.done}
              <span style={{ fontSize: 16, color: colors.textMuted, fontWeight: 400 }}>/{mockData.todayGoal.total}</span>
            </div>
            <div style={{ fontSize: 13, color: colors.textSoft }}>questions done</div>
          </div>
        </Card>

        {/* Weekly Chart */}
        <Card>
          <Label style={{ marginBottom: 14 }}>This Week</Label>
          <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 52 }}>
            {mockData.weeklyScore.map((score, i) => (
              <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                <div
                  onMouseEnter={() => setHoveredBar(i)}
                  onMouseLeave={() => setHoveredBar(null)}
                  style={{
                    width: "100%",
                    height: `${(score / 100) * 44}px`,
                    background: hoveredBar === i || i === 6 ? gradients.accentV : "#E8EEFF",
                    borderRadius: 5,
                    transition: "all 0.15s",
                    cursor: "pointer",
                    position: "relative",
                  }}
                >
                  {hoveredBar === i && (
                    <div
                      style={{
                        position: "absolute",
                        top: -24,
                        left: "50%",
                        transform: "translateX(-50%)",
                        background: colors.navy,
                        color: "#fff",
                        fontSize: 11,
                        borderRadius: 5,
                        padding: "2px 6px",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {score}%
                    </div>
                  )}
                </div>
                <div style={{ fontSize: 10, color: colors.textMuted }}>{days[i]}</div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 10, fontSize: 13, color: colors.textSoft }}>
            Avg: <b style={{ color: colors.navy }}>{Math.round(mockData.weeklyScore.reduce((a, b) => a + b) / 7)}%</b> accuracy
          </div>
        </Card>

        {/* Streak Card */}
        <Card style={{ background: gradients.navy, color: "#fff" }}>
          <Label style={{ color: "rgba(255,255,255,0.5)", marginBottom: 10 }}>Streak</Label>
          <div style={{ fontSize: 42, marginBottom: 2 }}>🔥</div>
          <div style={{ fontSize: 32, fontWeight: 800, lineHeight: 1 }}>{mockData.streak}</div>
          <div style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", marginTop: 4 }}>days in a row</div>
          <div
            style={{
              marginTop: 14,
              background: "rgba(255,255,255,0.1)",
              borderRadius: 8,
              padding: "8px 12px",
              fontSize: 12,
              color: "rgba(255,255,255,0.7)",
            }}
          >
            🏆 Best: {mockData.bestStreak} days
          </div>
        </Card>
      </div>

      {/* Bottom Row */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
        {/* Subjects Progress */}
        <Card>
          <SectionTitle
            action={
              <button
                onClick={() => navigate("/app/subjects")}
                style={{ fontSize: 12, color: colors.blue, background: "none", border: "none", cursor: "pointer", fontWeight: 600 }}
              >
                View all →
              </button>
            }
          >
            Subjects
          </SectionTitle>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {mockData.subjects.slice(0, 4).map((s) => (
              <div key={s.name}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{s.name}</span>
                  <span style={{ fontSize: 12, color: colors.textMuted }}>{s.progress}% · {s.questions}Q</span>
                </div>
                <ProgressBar value={s.progress} color={s.color} />
              </div>
            ))}
          </div>
        </Card>

        {/* Right column */}
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <Card style={{ padding: "20px 22px" }}>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 14 }}>Recent Sessions</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {mockData.recentTopics.map((t) => (
                <div
                  key={t.name}
                  style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", background: "#F8FAFF", borderRadius: 10 }}
                >
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{t.name}</div>
                    <div style={{ fontSize: 11, color: colors.textMuted, marginTop: 2 }}>
                      {t.subject} · {t.questions}Q · {t.date}
                    </div>
                  </div>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 700,
                      color: t.score >= 80 ? colors.green : t.score >= 65 ? colors.amber : colors.red,
                      background: t.score >= 80 ? "#ECFDF5" : t.score >= 65 ? "#FFFBEB" : "#FEF2F2",
                      padding: "4px 10px",
                      borderRadius: 999,
                    }}
                  >
                    {t.score}%
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card style={{ padding: "20px 22px" }}>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 14 }}>Up Next</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {mockData.upcomingTopics.map((t, i) => (
                <div
                  key={t.name}
                  onClick={() => navigate("/app/questions")}
                  style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", background: "#F8FAFF", borderRadius: 10, cursor: "pointer" }}
                >
                  <div
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 8,
                      background: gradients.accent,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: 12,
                      fontWeight: 700,
                      color: "#fff",
                      flexShrink: 0,
                    }}
                  >
                    {i + 1}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{t.name}</div>
                    <div style={{ fontSize: 11, color: colors.textMuted }}>{t.subject} · {t.questions} questions</div>
                  </div>
                  <span style={{ color: "#CBD5E1", fontSize: 16 }}>›</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>

      {/* Start Button */}
      <div style={{ marginTop: 22, display: "flex", justifyContent: "center" }}>
        <PrimaryButton style={{ padding: "14px 48px" }} onClick={() => navigate("/app/questions")}>
          Start Today's Session →
        </PrimaryButton>
      </div>
    </>
  );
}

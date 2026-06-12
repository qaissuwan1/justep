import { useState } from "react";
import { mockData, currentUser, colors, gradients } from "../theme";
import { Card, PageHeader, ProgressBar, StatCard } from "../components/ui";

const achievements = [
  { icon: "🔥", title: "Week Warrior", desc: "7-day streak", earned: true },
  { icon: "🎯", title: "Sharpshooter", desc: "90%+ on a session", earned: true },
  { icon: "📚", title: "Bookworm", desc: "500 questions done", earned: true },
  { icon: "🌙", title: "Night Owl", desc: "Study after midnight", earned: true },
  { icon: "💯", title: "Centurion", desc: "1000 questions", earned: false },
  { icon: "👑", title: "Top 3", desc: "Reach the podium", earned: false },
];

export default function Profile() {
  const [tab, setTab] = useState("overview");
  const { subjects } = mockData;
  const totalDone = subjects.reduce((a, s) => a + s.mastered, 0);

  return (
    <>
      <PageHeader title="Profile" subtitle="Your stats, achievements, and account settings" />

      {/* Banner */}
      <Card style={{ background: gradients.navy, color: "#fff", display: "flex", alignItems: "center", gap: 22, marginBottom: 20 }}>
        <div
          style={{
            width: 78,
            height: 78,
            borderRadius: "50%",
            background: gradients.accent,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 30,
            fontWeight: 800,
            border: "3px solid rgba(255,255,255,0.15)",
          }}
        >
          {currentUser.initial}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 24, fontWeight: 800 }}>{currentUser.name} Suwan</div>
          <div style={{ fontSize: 14, color: "rgba(255,255,255,0.6)", marginTop: 2 }}>
            {currentUser.university} · {currentUser.year} · Rank #4
          </div>
        </div>
        <div style={{ display: "flex", gap: 28, textAlign: "center" }}>
          <div>
            <div style={{ fontSize: 24, fontWeight: 800 }}>🔥 {mockData.streak}</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>Streak</div>
          </div>
          <div>
            <div style={{ fontSize: 24, fontWeight: 800 }}>8,120</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>Points</div>
          </div>
        </div>
      </Card>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 24, borderBottom: `1.5px solid ${colors.line}`, marginBottom: 22 }}>
        {["overview", "achievements", "settings"].map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            style={{
              background: "none",
              border: "none",
              borderBottom: tab === t ? `2.5px solid ${colors.blue}` : "2.5px solid transparent",
              padding: "10px 2px",
              marginBottom: -1.5,
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
              color: tab === t ? colors.navy : colors.textMuted,
              textTransform: "capitalize",
            }}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16, marginBottom: 20 }}>
            <StatCard label="Questions done" value="1,265" sub="all time" accent={colors.blue} icon="📋" />
            <StatCard label="Cards mastered" value={totalDone} sub="across 6 subjects" accent={colors.tealDeep} icon="🃏" />
            <StatCard label="Avg accuracy" value="84%" sub="last 30 days" accent={colors.green} icon="🎯" />
            <StatCard label="Best streak" value={`${mockData.bestStreak} days`} sub="personal record" accent={colors.orange} icon="🔥" />
          </div>

          <Card>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 18 }}>Mastery by subject</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {subjects.map((s) => (
                <div key={s.name}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{s.name}</span>
                    <span style={{ fontSize: 12, color: colors.textMuted }}>{s.progress}%</span>
                  </div>
                  <ProgressBar value={s.progress} color={s.color} />
                </div>
              ))}
            </div>
          </Card>
        </>
      )}

      {tab === "achievements" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 16 }}>
          {achievements.map((a) => (
            <Card key={a.title} style={{ textAlign: "center", opacity: a.earned ? 1 : 0.5 }}>
              <div
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: 14,
                  margin: "0 auto 12px",
                  background: a.earned ? "rgba(56,189,248,0.12)" : "#F1F5F9",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 28,
                  filter: a.earned ? "none" : "grayscale(1)",
                }}
              >
                {a.icon}
              </div>
              <div style={{ fontSize: 14, fontWeight: 700 }}>{a.title}</div>
              <div style={{ fontSize: 12, color: colors.textMuted, marginTop: 2 }}>{a.desc}</div>
              {!a.earned && <div style={{ fontSize: 11, color: colors.textMuted, marginTop: 8 }}>🔒 Locked</div>}
            </Card>
          ))}
        </div>
      )}

      {tab === "settings" && (
        <Card style={{ maxWidth: 560 }}>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 18 }}>Account settings</div>
          {[
            { label: "Full name", value: `${currentUser.name} Suwan` },
            { label: "Email", value: currentUser.email },
            { label: "University", value: currentUser.university },
            { label: "Year", value: currentUser.year },
          ].map((row) => (
            <div key={row.label} style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: colors.text, marginBottom: 6 }}>{row.label}</div>
              <input
                defaultValue={row.value}
                style={{
                  width: "100%",
                  padding: "12px 14px",
                  borderRadius: 10,
                  border: `1.5px solid ${colors.line}`,
                  fontSize: 14,
                  color: colors.text,
                  outline: "none",
                }}
              />
            </div>
          ))}
          <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
            <button
              style={{
                background: gradients.accent,
                color: "#fff",
                border: "none",
                borderRadius: 10,
                padding: "11px 24px",
                fontSize: 14,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Save changes
            </button>
            <button
              style={{
                background: "#fff",
                color: colors.red,
                border: `1.5px solid ${colors.red}`,
                borderRadius: 10,
                padding: "11px 24px",
                fontSize: 14,
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              Delete account
            </button>
          </div>
        </Card>
      )}
    </>
  );
}

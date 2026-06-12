import { useState } from "react";
import { leaderboard, colors, gradients, font } from "../theme";
import { Card, PageHeader } from "../components/ui";

const ranges = ["This Week", "This Month", "All Time"];
const medal = { 1: "🥇", 2: "🥈", 3: "🥉" };

export default function Leaderboard() {
  const [range, setRange] = useState("This Week");
  const top3 = leaderboard.slice(0, 3);
  const rest = leaderboard.slice(3);

  // podium order: 2nd, 1st, 3rd
  const podium = [top3[1], top3[0], top3[2]];
  const heights = [96, 130, 78];

  return (
    <>
      <PageHeader
        title="Leaderboard"
        subtitle="See how you rank against students across Jordan"
        right={
          <div style={{ display: "flex", gap: 6, background: "#fff", padding: 4, borderRadius: 12, boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
            {ranges.map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                style={{
                  padding: "8px 14px",
                  borderRadius: 9,
                  border: "none",
                  cursor: "pointer",
                  fontSize: 13,
                  fontWeight: 600,
                  fontFamily: font,
                  background: range === r ? gradients.accent : "transparent",
                  color: range === r ? "#fff" : colors.textSoft,
                }}
              >
                {r}
              </button>
            ))}
          </div>
        }
      />

      {/* Podium */}
      <Card style={{ background: gradients.navy, marginBottom: 20, padding: "32px 24px 0" }}>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "center", gap: 18 }}>
          {podium.map((p, i) => {
            const isFirst = p.rank === 1;
            return (
              <div key={p.rank} style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 150 }}>
                <div
                  style={{
                    width: isFirst ? 62 : 50,
                    height: isFirst ? 62 : 50,
                    borderRadius: "50%",
                    background: gradients.accent,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: isFirst ? 22 : 18,
                    fontWeight: 800,
                    color: "#fff",
                    border: `3px solid ${isFirst ? "#FBBF24" : "rgba(255,255,255,0.2)"}`,
                    marginBottom: 8,
                  }}
                >
                  {p.name[0]}
                </div>
                <div style={{ color: "#fff", fontSize: 14, fontWeight: 700, textAlign: "center" }}>{p.name.split(" ")[0]}</div>
                <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 12, marginBottom: 10 }}>{p.points.toLocaleString()} pts</div>
                <div
                  style={{
                    width: "100%",
                    height: heights[i],
                    background: isFirst ? gradients.accent : "rgba(255,255,255,0.08)",
                    borderRadius: "10px 10px 0 0",
                    display: "flex",
                    alignItems: "flex-start",
                    justifyContent: "center",
                    paddingTop: 10,
                    fontSize: 28,
                  }}
                >
                  {medal[p.rank]}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Rest of the list */}
      <Card style={{ padding: "8px 12px" }}>
        {rest.map((p) => (
          <div
            key={p.rank}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 16,
              padding: "14px 12px",
              borderRadius: 12,
              background: p.you ? "rgba(79,142,247,0.08)" : "transparent",
              border: p.you ? `1.5px solid ${colors.blue}` : "1.5px solid transparent",
              marginBottom: 2,
            }}
          >
            <div style={{ width: 28, textAlign: "center", fontSize: 15, fontWeight: 700, color: colors.textMuted }}>{p.rank}</div>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: "50%",
                background: p.you ? gradients.accent : "#EEF2FB",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 15,
                fontWeight: 700,
                color: p.you ? "#fff" : colors.textSoft,
                flexShrink: 0,
              }}
            >
              {p.name[0]}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600 }}>
                {p.name} {p.you && <span style={{ color: colors.blue, fontSize: 12 }}>(You)</span>}
              </div>
              <div style={{ fontSize: 12, color: colors.textMuted }}>{p.university} · 🔥 {p.streak} day streak</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: colors.navy }}>{p.points.toLocaleString()}</div>
              <div style={{ fontSize: 12, color: colors.green, fontWeight: 600 }}>{p.accuracy}% acc</div>
            </div>
          </div>
        ))}
      </Card>
    </>
  );
}

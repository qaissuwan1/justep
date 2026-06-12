import { useState } from "react";
import { adminStats, adminUsers, mockData, colors, gradients, font } from "../theme";
import { Card, PageHeader, StatCard, Pill } from "../components/ui";

const roleColor = { admin: colors.purple, instructor: colors.tealDeep, student: colors.blue };
const statusColor = { active: colors.green, suspended: colors.red };

export default function Admin() {
  const [tab, setTab] = useState("users");

  return (
    <>
      <PageHeader
        title="Admin Console"
        subtitle="Manage users, content, and platform settings"
        right={<Pill color={colors.purple} bg="rgba(139,92,246,0.12)">⚙️ Administrator</Pill>}
      />

      {/* Stat cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 16, marginBottom: 22 }}>
        <StatCard label="Total users" value={adminStats.totalUsers.toLocaleString()} sub="+124 this week" accent={colors.blue} icon="👥" />
        <StatCard label="Active today" value={adminStats.activeToday} sub="21% of users" accent={colors.tealDeep} icon="🟢" />
        <StatCard label="Questions" value={adminStats.totalQuestions.toLocaleString()} sub="across 6 subjects" accent={colors.navy} icon="📋" />
        <StatCard label="Flashcards" value={adminStats.totalFlashcards} sub="published" accent={colors.purple} icon="🃏" />
        <StatCard label="Reports" value={adminStats.pendingReports} sub="need review" accent={colors.red} icon="🚩" />
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 24, borderBottom: `1.5px solid ${colors.line}`, marginBottom: 22 }}>
        {["users", "content"].map((t) => (
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
            {t === "users" ? "User Management" : "Content Library"}
          </button>
        ))}
      </div>

      {tab === "users" && (
        <Card style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "18px 24px", borderBottom: `1px solid ${colors.line}` }}>
            <div style={{ fontSize: 15, fontWeight: 700 }}>Users</div>
            <button style={{ background: gradients.accent, color: "#fff", border: "none", borderRadius: 10, padding: "9px 18px", fontSize: 13, fontWeight: 700, cursor: "pointer", fontFamily: font }}>
              + Add user
            </button>
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#F8FAFF" }}>
                {["User", "Role", "Status", "Joined", ""].map((h) => (
                  <th key={h} style={{ textAlign: "left", padding: "12px 24px", fontSize: 12, fontWeight: 600, color: colors.textMuted, textTransform: "uppercase", letterSpacing: "0.04em" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {adminUsers.map((u) => (
                <tr key={u.id} style={{ borderTop: `1px solid ${colors.line}` }}>
                  <td style={{ padding: "14px 24px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <div
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: "50%",
                          background: "#EEF2FB",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 14,
                          fontWeight: 700,
                          color: colors.textSoft,
                        }}
                      >
                        {u.name[0]}
                      </div>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 600 }}>{u.name}</div>
                        <div style={{ fontSize: 12, color: colors.textMuted }}>{u.email}</div>
                      </div>
                    </div>
                  </td>
                  <td style={{ padding: "14px 24px" }}>
                    <Pill color={roleColor[u.role]} bg={`${roleColor[u.role]}1a`}>
                      {u.role}
                    </Pill>
                  </td>
                  <td style={{ padding: "14px 24px" }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, color: statusColor[u.status], fontWeight: 600 }}>
                      <span style={{ width: 7, height: 7, borderRadius: "50%", background: statusColor[u.status] }} />
                      {u.status}
                    </span>
                  </td>
                  <td style={{ padding: "14px 24px", fontSize: 13, color: colors.textSoft }}>{u.joined}</td>
                  <td style={{ padding: "14px 24px", textAlign: "right" }}>
                    <button style={{ background: "none", border: "none", cursor: "pointer", color: colors.textMuted, fontSize: 18 }}>⋯</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {tab === "content" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
          {mockData.subjects.map((s) => (
            <Card key={s.name}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: `${s.color}1a`, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, color: s.color }}>
                    {s.name[0]}
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 700 }}>{s.name}</div>
                </div>
                <button style={{ background: "none", border: "none", cursor: "pointer", color: colors.textMuted, fontSize: 18 }}>⋯</button>
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <div style={{ flex: 1, background: "#F8FAFF", borderRadius: 10, padding: "12px 14px" }}>
                  <div style={{ fontSize: 20, fontWeight: 800, color: colors.navy }}>{s.questions}</div>
                  <div style={{ fontSize: 12, color: colors.textMuted }}>Questions</div>
                </div>
                <div style={{ flex: 1, background: "#F8FAFF", borderRadius: 10, padding: "12px 14px" }}>
                  <div style={{ fontSize: 20, fontWeight: 800, color: colors.navy }}>{s.cards}</div>
                  <div style={{ fontSize: 12, color: colors.textMuted }}>Flashcards</div>
                </div>
              </div>
              <button
                style={{
                  width: "100%",
                  marginTop: 14,
                  background: "#fff",
                  border: `1.5px solid ${colors.line}`,
                  borderRadius: 10,
                  padding: "10px 0",
                  fontSize: 13,
                  fontWeight: 600,
                  color: colors.blue,
                  cursor: "pointer",
                  fontFamily: font,
                }}
              >
                Manage content →
              </button>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}

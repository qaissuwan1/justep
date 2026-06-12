import { useNavigate } from "react-router-dom";
import { mockData, colors } from "../theme";
import { Card, PageHeader, ProgressBar, Pill } from "../components/ui";

export default function Subjects() {
  const navigate = useNavigate();
  const { subjects } = mockData;

  const totalQ = subjects.reduce((a, s) => a + s.questions, 0);
  const avgProgress = Math.round(subjects.reduce((a, s) => a + s.progress, 0) / subjects.length);

  return (
    <>
      <PageHeader
        title="Subjects"
        subtitle="Browse the curriculum and track your mastery"
        right={
          <div style={{ display: "flex", gap: 12 }}>
            {[
              { v: subjects.length, l: "Subjects" },
              { v: totalQ, l: "Questions" },
              { v: `${avgProgress}%`, l: "Avg mastery" },
            ].map((s) => (
              <div key={s.l} style={{ background: "#fff", borderRadius: 12, padding: "10px 18px", boxShadow: "0 1px 4px rgba(0,0,0,0.06)", textAlign: "center" }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: colors.navy }}>{s.v}</div>
                <div style={{ fontSize: 11, color: colors.textMuted }}>{s.l}</div>
              </div>
            ))}
          </div>
        }
      />

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 18 }}>
        {subjects.map((s) => (
          <Card
            key={s.name}
            style={{ cursor: "pointer", transition: "transform 0.15s, box-shadow 0.15s" }}
            onClick={() => navigate("/app/questions")}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = "translateY(-3px)";
              e.currentTarget.style.boxShadow = "0 10px 26px rgba(30,42,74,0.1)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "translateY(0)";
              e.currentTarget.style.boxShadow = "0 1px 6px rgba(0,0,0,0.05)";
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 18 }}>
              <div
                style={{
                  width: 46,
                  height: 46,
                  borderRadius: 12,
                  background: `${s.color}1a`,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 22,
                  fontWeight: 800,
                  color: s.color,
                }}
              >
                {s.name[0]}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 16, fontWeight: 700 }}>{s.name}</div>
                <div style={{ fontSize: 12, color: colors.textMuted }}>{s.questions} questions · {s.cards} cards</div>
              </div>
              <Pill color={s.color} bg={`${s.color}1a`}>
                {s.progress}%
              </Pill>
            </div>

            <ProgressBar value={s.progress} color={s.color} height={8} />

            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 14, fontSize: 12, color: colors.textSoft }}>
              <span>
                <b style={{ color: colors.navy }}>{s.mastered}</b> mastered
              </span>
              <span>{s.cards - Math.round(s.cards * (s.progress / 100))} cards left</span>
            </div>
          </Card>
        ))}
      </div>
    </>
  );
}

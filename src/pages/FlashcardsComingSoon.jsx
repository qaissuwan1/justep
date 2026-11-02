import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { colors } from "../theme";
import { goToNextTask } from "../lib/session";

export default function FlashcardsComingSoon() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const sessionMode = params.get("session") === "1";
  const actionStyle = {
    display: "inline-block", padding: "13px 22px", borderRadius: 10,
    background: colors.navy, color: "#fff", textDecoration: "none",
    border: "none", font: "inherit", fontWeight: 600, cursor: "pointer",
  };

  return (
    <section aria-labelledby="flashcards-title" style={{ maxWidth: 680, margin: "48px auto", textAlign: "center", padding: "40px 24px", background: colors.card, border: `1px solid ${colors.line}`, borderRadius: 24 }}>
      <span className="eyebrow">FLASHCARDS</span>
      <h1 id="flashcards-title" style={{ fontSize: "clamp(36px, 6vw, 56px)", letterSpacing: "-2px", margin: "20px 0", color: colors.navy }}>Coming soon</h1>
      <p style={{ color: colors.textSoft, lineHeight: 1.8, margin: "0 auto 28px", maxWidth: 420 }}>
        We’re preparing a better flashcard experience. Your saved cards and progress are safe.
      </p>
      <div style={{ display: "flex", justifyContent: "center", flexWrap: "wrap", gap: 12 }}>
        <Link to="/app/home" style={actionStyle}>Back to overview</Link>
        {sessionMode && <button style={actionStyle} onClick={() => goToNextTask(navigate)}>Skip to next task →</button>}
      </div>
    </section>
  );
}

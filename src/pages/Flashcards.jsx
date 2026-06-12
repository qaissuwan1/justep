import { useMemo, useState } from "react";
import { flashcards, colors, gradients, font } from "../theme";
import { PageHeader, Pill, PrimaryButton } from "../components/ui";

const subjects = ["All", ...Array.from(new Set(flashcards.map((c) => c.subject)))];

export default function Flashcards() {
  const [filter, setFilter] = useState("All");
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [known, setKnown] = useState(0);

  const deck = useMemo(
    () => (filter === "All" ? flashcards : flashcards.filter((c) => c.subject === filter)),
    [filter]
  );
  const card = deck[index];

  const go = (dir, markKnown) => {
    if (markKnown) setKnown((k) => k + 1);
    setFlipped(false);
    setIndex((i) => (i + dir + deck.length) % deck.length);
  };

  const changeFilter = (s) => {
    setFilter(s);
    setIndex(0);
    setFlipped(false);
    setKnown(0);
  };

  return (
    <>
      <PageHeader
        title="Flashcards"
        subtitle="Tap a card to flip · review high-yield facts"
        right={
          <div style={{ background: "#fff", borderRadius: 12, padding: "10px 18px", boxShadow: "0 1px 4px rgba(0,0,0,0.06)", fontSize: 13, color: colors.textSoft }}>
            Reviewed <b style={{ color: colors.green }}>{known}</b> / {deck.length}
          </div>
        }
      />

      {/* Subject filters */}
      <div style={{ display: "flex", gap: 8, marginBottom: 28, flexWrap: "wrap" }}>
        {subjects.map((s) => (
          <button
            key={s}
            onClick={() => changeFilter(s)}
            style={{
              padding: "8px 16px",
              borderRadius: 999,
              border: "none",
              cursor: "pointer",
              fontSize: 13,
              fontWeight: 600,
              fontFamily: font,
              background: filter === s ? gradients.accent : "#fff",
              color: filter === s ? "#fff" : colors.textSoft,
              boxShadow: filter === s ? "0 4px 14px rgba(79,142,247,0.3)" : "0 1px 4px rgba(0,0,0,0.05)",
            }}
          >
            {s}
          </button>
        ))}
      </div>

      {/* Card */}
      <div style={{ maxWidth: 620, margin: "0 auto" }}>
        <div style={{ textAlign: "center", fontSize: 13, color: colors.textMuted, marginBottom: 12 }}>
          Card {index + 1} of {deck.length}
        </div>

        <div
          onClick={() => setFlipped((f) => !f)}
          style={{ perspective: 1600, cursor: "pointer", height: 320 }}
        >
          <div
            style={{
              position: "relative",
              width: "100%",
              height: "100%",
              transition: "transform 0.5s",
              transformStyle: "preserve-3d",
              transform: flipped ? "rotateY(180deg)" : "rotateY(0)",
            }}
          >
            {/* Front */}
            <div
              style={{
                position: "absolute",
                inset: 0,
                backfaceVisibility: "hidden",
                background: "#fff",
                borderRadius: 20,
                boxShadow: "0 4px 24px rgba(30,42,74,0.08)",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                padding: "40px",
                textAlign: "center",
              }}
            >
              <Pill color={colors.blue}>{card.subject}</Pill>
              <p style={{ fontSize: 24, fontWeight: 700, lineHeight: 1.4, color: colors.text, margin: "24px 0 0" }}>{card.front}</p>
              <span style={{ position: "absolute", bottom: 20, fontSize: 12, color: colors.textMuted }}>Tap to reveal answer</span>
            </div>

            {/* Back */}
            <div
              style={{
                position: "absolute",
                inset: 0,
                backfaceVisibility: "hidden",
                transform: "rotateY(180deg)",
                background: gradients.navy,
                color: "#fff",
                borderRadius: 20,
                boxShadow: "0 4px 24px rgba(30,42,74,0.18)",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                padding: "40px",
                textAlign: "center",
              }}
            >
              <span style={{ fontSize: 12, color: colors.teal, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em" }}>Answer</span>
              <p style={{ fontSize: 19, fontWeight: 500, lineHeight: 1.5, margin: "18px 0 0" }}>{card.back}</p>
            </div>
          </div>
        </div>

        {/* Controls */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, marginTop: 28 }}>
          <button
            onClick={() => go(-1, false)}
            style={{
              width: 48,
              height: 48,
              borderRadius: 12,
              border: `1.5px solid ${colors.line}`,
              background: "#fff",
              cursor: "pointer",
              fontSize: 18,
              color: colors.textSoft,
            }}
          >
            ‹
          </button>
          <button
            onClick={() => go(1, false)}
            style={{
              padding: "13px 24px",
              borderRadius: 12,
              border: `1.5px solid ${colors.red}`,
              background: "#fff",
              color: colors.red,
              cursor: "pointer",
              fontWeight: 700,
              fontSize: 14,
              fontFamily: font,
            }}
          >
            ✕ Still learning
          </button>
          <PrimaryButton onClick={() => go(1, true)} style={{ background: gradients.teal, boxShadow: "0 4px 16px rgba(20,184,166,0.35)" }}>
            ✓ Got it
          </PrimaryButton>
          <button
            onClick={() => go(1, false)}
            style={{
              width: 48,
              height: 48,
              borderRadius: 12,
              border: `1.5px solid ${colors.line}`,
              background: "#fff",
              cursor: "pointer",
              fontSize: 18,
              color: colors.textSoft,
            }}
          >
            ›
          </button>
        </div>
      </div>
    </>
  );
}

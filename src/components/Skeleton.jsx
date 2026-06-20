// Reusable loading + error UI shared by data-fetching pages.
import { colors, font } from "../theme";

// A single skeleton block: light gray with a gentle pulse. width/height/radius
// and an optional color (for dark surfaces) are configurable.
export default function Skeleton({ width = "100%", height = 16, radius = 8, color, style }) {
  return (
    <div
      style={{
        width,
        height,
        borderRadius: radius,
        background: color || colors.line,
        animation: "pulse 1.5s ease-in-out infinite",
        ...style,
      }}
    />
  );
}

// A clean error panel with a Retry action, matching theme.js styling.
export function ErrorState({ onRetry, message = "Couldn't load this page. Check your connection and try again." }) {
  return (
    <div
      style={{
        fontFamily: font,
        maxWidth: 420,
        margin: "40px auto",
        textAlign: "center",
        background: colors.card,
        border: `1px solid ${colors.line}`,
        borderRadius: 16,
        padding: "44px 24px",
        boxShadow: "0 1px 6px rgba(0,0,0,0.05)",
      }}
    >
      <div style={{ color: colors.textSoft, fontSize: 14, lineHeight: 1.6, marginBottom: 18 }}>{message}</div>
      <button
        onClick={onRetry}
        style={{ background: colors.blue, color: "#fff", border: "none", borderRadius: 10, padding: "11px 26px", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: font }}
      >
        Retry
      </button>
    </div>
  );
}

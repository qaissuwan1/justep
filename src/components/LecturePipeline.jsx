// SECURITY: the browser-side Anthropic pipeline is disabled.
//
// Vite inlines every `import.meta.env.VITE_*` value into the PUBLIC client
// bundle at build time, so reading VITE_ANTHROPIC_API_KEY here would ship the
// admin API key to anyone who loads the app. The whole pipeline (env read,
// `@anthropic-ai/sdk` client, and direct browser calls) has been removed.
//
// Admins should generate questions in Claude and use the Import JSON page
// (paste + publish) instead — no key in the client, free with Claude Max.
import { colors, font } from "../theme";

export default function LecturePipeline() {
  return (
    <div style={{ fontFamily: font, maxWidth: 640, margin: "0 auto" }}>
      <div
        style={{
          background: colors.card,
          border: `1px solid ${colors.line}`,
          borderRadius: 16,
          padding: "34px 30px",
          textAlign: "center",
        }}
      >
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: "50%",
            background: "#FFFBEB",
            border: `1px solid ${colors.amber}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 26,
            margin: "0 auto 16px",
          }}
        >
          🔒
        </div>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: colors.text, margin: "0 0 10px" }}>Automatic pipeline disabled</h2>
        <p style={{ fontSize: 14, lineHeight: 1.6, color: colors.textSoft, margin: "0 0 22px" }}>
          The automatic API pipeline is temporarily disabled for security. Please use the{" "}
          <strong style={{ color: colors.text }}>Import JSON</strong> page instead (free with Claude Max).
        </p>
        <button
          disabled
          style={{
            background: colors.line,
            color: colors.textMuted,
            border: "none",
            borderRadius: 10,
            padding: "12px 28px",
            fontSize: 15,
            fontWeight: 700,
            cursor: "not-allowed",
            fontFamily: font,
          }}
        >
          Generate (disabled)
        </button>
      </div>
    </div>
  );
}

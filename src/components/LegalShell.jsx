// Shared layout for the public legal pages (Privacy, Terms): top bar with logo,
// centered readable column, "Last updated" line, and footer links.
import { Link } from "react-router-dom";
import { colors, gradients, font } from "../theme";

export function LegalShell({ title, updated, children }) {
  return (
    <div style={{ fontFamily: font, minHeight: "100vh", background: colors.bg, color: colors.text }}>
      <div style={{ background: colors.card, borderBottom: `1px solid ${colors.line}`, padding: "0 20px", height: 60, display: "flex", alignItems: "center" }}>
        <Link to="/" style={{ textDecoration: "none", display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 32, height: 32, background: gradients.accent, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 800, color: "#fff" }}>J</div>
          <span style={{ fontSize: 18, fontWeight: 800, color: colors.navy, letterSpacing: "-0.4px" }}>
            JU<span style={{ color: colors.teal }}>step</span>
          </span>
        </Link>
      </div>

      <div style={{ maxWidth: 760, margin: "0 auto", padding: "40px 20px 64px" }}>
        <Link to="/" style={{ fontSize: 13, color: colors.blue, fontWeight: 600, textDecoration: "none" }}>← Back to home</Link>
        <h1 style={{ fontSize: 30, fontWeight: 800, color: colors.navy, margin: "16px 0 6px", letterSpacing: "-0.5px" }}>{title}</h1>
        <p style={{ fontSize: 13, color: colors.textMuted, margin: "0 0 28px" }}>Last updated: {updated}</p>

        <div style={{ background: colors.card, border: `1px solid ${colors.line}`, borderRadius: 16, padding: "28px 28px 8px" }}>
          {children}
        </div>

        <p style={{ fontSize: 13, color: colors.textMuted, textAlign: "center", marginTop: 28 }}>
          <Link to="/privacy" style={{ color: colors.textSoft, textDecoration: "none", marginRight: 16 }}>Privacy Policy</Link>
          <Link to="/terms" style={{ color: colors.textSoft, textDecoration: "none" }}>Terms of Service</Link>
        </p>
      </div>
    </div>
  );
}

export function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <h2 style={{ fontSize: 17, fontWeight: 700, color: colors.text, margin: "0 0 10px" }}>{title}</h2>
      {children}
    </div>
  );
}

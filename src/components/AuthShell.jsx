// Split-screen auth layout: navy branding panel + form card.
import { Link } from "react-router-dom";
import { colors, gradients, font } from "../theme";

export function AuthShell({ children, side }) {
  return (
    <div style={{ fontFamily: font, minHeight: "100vh", display: "flex", background: colors.bg }}>
      {/* Branding panel */}
      <div
        style={{
          flex: "1 1 0",
          background: gradients.navy,
          color: "#fff",
          padding: "48px 56px",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          minWidth: 0,
        }}
      >
        <Link to="/" style={{ textDecoration: "none", display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 36,
              height: 36,
              background: gradients.accent,
              borderRadius: 10,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 16,
              fontWeight: 800,
              color: "#fff",
            }}
          >
            J
          </div>
          <span style={{ fontSize: 20, fontWeight: 800, color: "#fff" }}>
            JU<span style={{ color: colors.teal }}>step</span>
          </span>
        </Link>
        <div>
          <h2 style={{ fontSize: 34, fontWeight: 800, lineHeight: 1.2, margin: "0 0 16px", letterSpacing: "-0.5px" }}>
            {side?.title || "Study smarter, not harder."}
          </h2>
          <p style={{ fontSize: 16, color: "rgba(255,255,255,0.7)", lineHeight: 1.6, margin: 0, maxWidth: 380 }}>
            {side?.subtitle ||
              "Your question bank, flashcards, and analytics — all in one place, built for medical students."}
          </p>
        </div>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.4)" }}>© 2026 JUstep</div>
      </div>

      {/* Form panel */}
      <div style={{ flex: "1 1 0", display: "flex", alignItems: "center", justifyContent: "center", padding: "40px 24px", minWidth: 0 }}>
        <div style={{ width: "100%", maxWidth: 400 }}>{children}</div>
      </div>
    </div>
  );
}

export function Field({ label, type = "text", value, onChange, placeholder, required }) {
  return (
    <label style={{ display: "block", marginBottom: 16 }}>
      <span style={{ fontSize: 13, fontWeight: 600, color: colors.text, display: "block", marginBottom: 6 }}>{label}</span>
      <input
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        required={required}
        style={{
          width: "100%",
          padding: "12px 14px",
          borderRadius: 10,
          border: `1.5px solid ${colors.line}`,
          fontSize: 14,
          fontFamily: font,
          outline: "none",
          color: colors.text,
          background: "#fff",
          transition: "border 0.15s",
        }}
        onFocus={(e) => (e.target.style.border = `1.5px solid ${colors.blue}`)}
        onBlur={(e) => (e.target.style.border = `1.5px solid ${colors.line}`)}
      />
    </label>
  );
}

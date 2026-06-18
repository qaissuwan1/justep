// Split-screen auth layout: navy branding panel + form card, plus the shared
// form primitives used by both Login and Signup (Field, Divider, GoogleButton,
// Banner, SubmitButton).
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
          {side?.eyebrow && (
            <span
              style={{
                display: "inline-block",
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: "0.1em",
                textTransform: "uppercase",
                color: colors.teal,
                marginBottom: 14,
              }}
            >
              {side.eyebrow}
            </span>
          )}
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

export function Field({
  label,
  type = "text",
  value,
  onChange,
  onBlur,
  placeholder,
  required,
  autoComplete,
  name,
  hint,
  error,
}) {
  const restingBorder = error ? colors.red : colors.line;
  return (
    <label style={{ display: "block", marginBottom: 16 }}>
      <span style={{ fontSize: 13, fontWeight: 600, color: colors.text, display: "block", marginBottom: 6 }}>
        {label}
        {required && <span style={{ color: colors.red }}> *</span>}
      </span>
      <input
        type={type}
        name={name}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        required={required}
        autoComplete={autoComplete}
        style={{
          width: "100%",
          padding: "12px 14px",
          borderRadius: 10,
          border: `1.5px solid ${restingBorder}`,
          fontSize: 14,
          fontFamily: font,
          outline: "none",
          color: colors.text,
          background: "#fff",
          transition: "border 0.15s",
          boxSizing: "border-box",
        }}
        onFocus={(e) => (e.target.style.border = `1.5px solid ${colors.blue}`)}
        onBlur={(e) => {
          e.target.style.border = `1.5px solid ${restingBorder}`;
          onBlur?.(e);
        }}
      />
      {error ? (
        <span style={{ fontSize: 12, color: colors.red, display: "block", marginTop: 6 }}>{error}</span>
      ) : hint ? (
        <span style={{ fontSize: 12, color: colors.textMuted, display: "block", marginTop: 6 }}>{hint}</span>
      ) : null}
    </label>
  );
}

export function Banner({ type = "error", children }) {
  const palette = {
    error: { background: "#FEF2F2", border: "#FECACA", color: "#991B1B" },
    success: { background: "#ECFDF5", border: "#BBF7D0", color: "#065F46" },
  };
  const s = palette[type] || palette.error;
  return (
    <div
      role={type === "error" ? "alert" : "status"}
      style={{
        background: s.background,
        border: `1.5px solid ${s.border}`,
        color: s.color,
        borderRadius: 10,
        padding: "11px 14px",
        fontSize: 13,
        marginBottom: 18,
      }}
    >
      {children}
    </div>
  );
}

export function Divider({ label = "or" }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "24px 0" }}>
      <div style={{ flex: 1, height: 1, background: colors.line }} />
      <span style={{ fontSize: 12, color: colors.textMuted }}>{label}</span>
      <div style={{ flex: 1, height: 1, background: colors.line }} />
    </div>
  );
}

function Spinner({ size = 16, light }) {
  return (
    <span
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        border: `2px solid ${light ? "rgba(255,255,255,0.4)" : colors.line}`,
        borderTopColor: light ? "#fff" : colors.blue,
        display: "inline-block",
        animation: "spin 0.6s linear infinite",
      }}
    />
  );
}

export function SubmitButton({ loading, loadingLabel, children, disabled }) {
  const off = loading || disabled;
  return (
    <button
      type="submit"
      disabled={off}
      style={{
        width: "100%",
        background: gradients.accent,
        color: "#fff",
        border: "none",
        borderRadius: 12,
        padding: "13px 28px",
        fontSize: 15,
        fontWeight: 700,
        cursor: off ? "not-allowed" : "pointer",
        opacity: off ? 0.7 : 1,
        letterSpacing: "0.02em",
        boxShadow: "0 4px 16px rgba(79,142,247,0.35)",
        fontFamily: font,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
        transition: "opacity 0.15s",
      }}
    >
      {loading && <Spinner light />}
      {loading ? loadingLabel : children}
    </button>
  );
}

export function GoogleButton({ onClick, disabled }) {
  return (
    <button
      onClick={onClick}
      type="button"
      disabled={disabled}
      style={{
        width: "100%",
        padding: "12px 20px",
        borderRadius: 12,
        border: "1px solid #e2e8f0",
        background: "#ffffff",
        fontSize: 15,
        fontWeight: 500,
        color: "#1a202c",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.6 : 1,
        fontFamily: font,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
        boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
        transition: "background 0.15s, border-color 0.15s",
      }}
      onMouseEnter={(e) => {
        if (disabled) return;
        e.currentTarget.style.background = "#f8fafc";
        e.currentTarget.style.borderColor = "#cbd5e0";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.background = "#ffffff";
        e.currentTarget.style.borderColor = "#e2e8f0";
      }}
    >
      <svg width="18" height="18" viewBox="0 0 18 18">
        <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z" />
        <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z" />
        <path fill="#FBBC05" d="M3.964 10.71c-.18-.54-.282-1.117-.282-1.71s.102-1.17.282-1.71V4.958H.957C.347 6.173 0 7.548 0 9s.348 2.827.957 4.042l3.007-2.332z" />
        <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" />
      </svg>
      Sign in with Google
    </button>
  );
}

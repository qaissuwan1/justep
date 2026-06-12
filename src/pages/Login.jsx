import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AuthShell, Field } from "../components/AuthShell";
import { colors, font } from "../theme";
import { PrimaryButton } from "../components/ui";

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const handleSubmit = (e) => {
    e.preventDefault();
    // Mock auth — go straight to the dashboard.
    navigate("/app/home");
  };

  return (
    <AuthShell
      side={{
        title: "Welcome back.",
        subtitle: "Pick up right where you left off — your streak is waiting.",
      }}
    >
      <h1 style={{ fontSize: 26, fontWeight: 800, margin: "0 0 6px", color: colors.text }}>Log in</h1>
      <p style={{ fontSize: 14, color: colors.textSoft, margin: "0 0 28px" }}>
        New here?{" "}
        <Link to="/signup" style={{ color: colors.blue, fontWeight: 600, textDecoration: "none" }}>
          Create an account
        </Link>
      </p>

      <form onSubmit={handleSubmit}>
        <Field label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@ju.edu.jo" required />
        <Field label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required />

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "4px 0 22px" }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: colors.textSoft, cursor: "pointer" }}>
            <input type="checkbox" defaultChecked style={{ accentColor: colors.blue }} /> Remember me
          </label>
          <a href="#" style={{ fontSize: 13, color: colors.blue, fontWeight: 600, textDecoration: "none" }}>
            Forgot password?
          </a>
        </div>

        <PrimaryButton type="submit" full>
          Log in →
        </PrimaryButton>
      </form>

      <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "24px 0" }}>
        <div style={{ flex: 1, height: 1, background: colors.line }} />
        <span style={{ fontSize: 12, color: colors.textMuted }}>or</span>
        <div style={{ flex: 1, height: 1, background: colors.line }} />
      </div>

      <button
        onClick={() => navigate("/app/home")}
        style={{
          width: "100%",
          padding: "12px 0",
          borderRadius: 10,
          border: `1.5px solid ${colors.line}`,
          background: "#fff",
          fontSize: 14,
          fontWeight: 600,
          color: colors.text,
          cursor: "pointer",
          fontFamily: font,
        }}
      >
        Continue with University SSO
      </button>
    </AuthShell>
  );
}

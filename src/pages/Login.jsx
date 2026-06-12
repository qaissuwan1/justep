import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AuthShell, Field } from "../components/AuthShell";
import { colors, font } from "../theme";
import { PrimaryButton } from "../components/ui";
import { supabase } from "../lib/supabase";

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    navigate("/app/home");
  };

  const handleGoogle = async () => {
    setError("");
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/app/home` },
    });
    if (error) setError(error.message);
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

      {error && (
        <div
          style={{
            background: "#FEF2F2",
            border: `1.5px solid #FECACA`,
            color: "#991B1B",
            borderRadius: 10,
            padding: "11px 14px",
            fontSize: 13,
            marginBottom: 18,
          }}
        >
          {error}
        </div>
      )}

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

        <PrimaryButton type="submit" full style={loading ? { opacity: 0.7, pointerEvents: "none" } : undefined}>
          {loading ? "Logging in…" : "Log in →"}
        </PrimaryButton>
      </form>

      <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "24px 0" }}>
        <div style={{ flex: 1, height: 1, background: colors.line }} />
        <span style={{ fontSize: 12, color: colors.textMuted }}>or</span>
        <div style={{ flex: 1, height: 1, background: colors.line }} />
      </div>

      <button
        onClick={handleGoogle}
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
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 10,
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
    </AuthShell>
  );
}

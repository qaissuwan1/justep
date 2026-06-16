import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AuthShell, Field, Divider, GoogleButton, Banner, SubmitButton } from "../components/AuthShell";
import { colors } from "../theme";
import { supabase, setRememberMe } from "../lib/supabase";
import { friendlyAuthError, isValidEmail } from "../lib/auth";

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState("");
  const [fieldError, setFieldError] = useState({});
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    // Client-side validation before hitting the network.
    if (!isValidEmail(email)) {
      setFieldError({ email: "Enter a valid email address." });
      return;
    }
    if (!password) {
      setFieldError({ password: "Enter your password." });
      return;
    }
    setFieldError({});

    setLoading(true);
    setRememberMe(remember); // route session to local- vs sessionStorage
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setLoading(false);

    if (error) {
      setError(friendlyAuthError(error));
      return;
    }
    navigate("/app/home");
  };

  const handleGoogle = async () => {
    setError("");
    setGoogleLoading(true);
    setRememberMe(remember); // honor the checkbox for the OAuth session too
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/app/home` },
    });
    // On success the browser redirects away; only reached on error.
    if (error) {
      setError(friendlyAuthError(error));
      setGoogleLoading(false);
    }
  };

  const busy = loading || googleLoading;

  return (
    <AuthShell
      side={{
        eyebrow: "Welcome back",
        title: "Pick up where you left off.",
        subtitle: "Your streak, your question bank, your progress — all waiting for you.",
      }}
    >
      <h1 style={{ fontSize: 26, fontWeight: 800, margin: "0 0 6px", color: colors.text }}>Welcome back</h1>
      <p style={{ fontSize: 14, color: colors.textSoft, margin: "0 0 28px" }}>
        Don't have an account?{" "}
        <Link to="/signup" style={{ color: colors.blue, fontWeight: 600, textDecoration: "none" }}>
          Sign up
        </Link>
      </p>

      {error && <Banner type="error">{error}</Banner>}

      <form onSubmit={handleSubmit} noValidate>
        <Field
          label="Email"
          type="email"
          name="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onBlur={() =>
            setFieldError((p) => ({ ...p, email: email && !isValidEmail(email) ? "Enter a valid email address." : undefined }))
          }
          placeholder="you@ju.edu.jo"
          required
          error={fieldError.email}
        />
        <Field
          label="Password"
          type="password"
          name="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
          required
          error={fieldError.password}
        />

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "4px 0 22px" }}>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: colors.textSoft, cursor: "pointer" }}>
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              style={{ accentColor: colors.blue }}
            />
            Remember me
          </label>
          <Link to="/forgot-password" style={{ fontSize: 13, color: colors.blue, fontWeight: 600, textDecoration: "none" }}>
            Forgot password?
          </Link>
        </div>

        <SubmitButton loading={loading} loadingLabel="Signing in…" disabled={busy}>
          Sign in
        </SubmitButton>
      </form>

      <Divider />

      <GoogleButton onClick={handleGoogle} label="Sign in with Google" disabled={busy} />
    </AuthShell>
  );
}

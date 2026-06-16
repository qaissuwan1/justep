import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AuthShell, Field, Banner, SubmitButton } from "../components/AuthShell";
import { colors } from "../theme";
import { supabase } from "../lib/supabase";
import { friendlyAuthError } from "../lib/auth";

export default function ResetPassword() {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);
  const [ready, setReady] = useState(false); // a recovery session exists
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [fieldError, setFieldError] = useState({});
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  // The recovery link redirects here with the session in the URL; the supabase
  // client (detectSessionInUrl) parses it and emits PASSWORD_RECOVERY / sets a
  // session. We allow the form only once that recovery session is present.
  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      if (data.session) setReady(true);
      setChecking(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      if (event === "PASSWORD_RECOVERY" || session) {
        setReady(true);
        setChecking(false);
      }
    });
    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    const errs = {};
    if (password.length < 8) errs.password = "Password must be at least 8 characters.";
    if (confirm !== password) errs.confirm = "Passwords do not match.";
    setFieldError(errs);
    if (Object.keys(errs).length) return;

    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setLoading(false);
      setError(friendlyAuthError(error));
      return;
    }
    setDone(true);
    // Drop the temporary recovery session and send them to sign in fresh.
    await supabase.auth.signOut();
    setLoading(false);
    setTimeout(() => navigate("/login"), 1600);
  };

  const side = {
    eyebrow: "Account recovery",
    title: "Set a new password",
    subtitle: "Choose a strong password you don't use anywhere else.",
  };

  if (checking) {
    return (
      <AuthShell side={side}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, padding: "40px 0", color: colors.textSoft, fontSize: 14 }}>
          <div style={{ width: 38, height: 38, borderRadius: "50%", border: `3px solid ${colors.line}`, borderTopColor: colors.blue, animation: "spin 0.7s linear infinite" }} />
          Verifying your reset link…
        </div>
      </AuthShell>
    );
  }

  if (!ready) {
    return (
      <AuthShell side={side}>
        <h1 style={{ fontSize: 26, fontWeight: 800, margin: "0 0 6px", color: colors.text }}>Link expired</h1>
        <p style={{ fontSize: 14, color: colors.textSoft, margin: "0 0 24px" }}>
          This password-reset link is invalid or has expired.
        </p>
        <Banner type="error">Request a fresh link to continue.</Banner>
        <Link to="/forgot-password" style={{ color: colors.blue, fontWeight: 600, textDecoration: "none", fontSize: 14 }}>
          ← Send a new reset link
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell side={side}>
      <h1 style={{ fontSize: 26, fontWeight: 800, margin: "0 0 6px", color: colors.text }}>Set a new password</h1>
      <p style={{ fontSize: 14, color: colors.textSoft, margin: "0 0 28px" }}>Almost done — pick your new password below.</p>

      {error && <Banner type="error">{error}</Banner>}

      {done ? (
        <Banner type="success">Password updated! Redirecting you to sign in…</Banner>
      ) : (
        <form onSubmit={handleSubmit} noValidate>
          <Field
            label="New password"
            type="password"
            name="new-password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 8 characters"
            required
            error={fieldError.password}
            hint="Use at least 8 characters."
          />
          <Field
            label="Confirm password"
            type="password"
            name="confirm-password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder="Re-enter your password"
            required
            error={fieldError.confirm}
          />
          <SubmitButton loading={loading} loadingLabel="Updating…">
            Update password
          </SubmitButton>
        </form>
      )}
    </AuthShell>
  );
}

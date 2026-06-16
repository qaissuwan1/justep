import { useState } from "react";
import { Link } from "react-router-dom";
import { AuthShell, Field, Banner, SubmitButton } from "../components/AuthShell";
import { colors } from "../theme";
import { supabase } from "../lib/supabase";
import { friendlyAuthError, isValidEmail } from "../lib/auth";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [fieldError, setFieldError] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (!isValidEmail(email)) {
      setFieldError("Enter a valid email address.");
      return;
    }
    setFieldError("");
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setLoading(false);
    if (error) {
      setError(friendlyAuthError(error));
      return;
    }
    setSent(true);
  };

  return (
    <AuthShell
      side={{
        eyebrow: "Account recovery",
        title: "Forgot your password?",
        subtitle: "Enter your email and we'll send a secure link to set a new one.",
      }}
    >
      <h1 style={{ fontSize: 26, fontWeight: 800, margin: "0 0 6px", color: colors.text }}>Reset your password</h1>
      <p style={{ fontSize: 14, color: colors.textSoft, margin: "0 0 28px" }}>
        Remembered it?{" "}
        <Link to="/login" style={{ color: colors.blue, fontWeight: 600, textDecoration: "none" }}>
          Sign in
        </Link>
      </p>

      {error && <Banner type="error">{error}</Banner>}

      {sent ? (
        <Banner type="success">
          If an account exists for <strong>{email.trim()}</strong>, a password-reset link is on its way. Check your inbox (and spam).
        </Banner>
      ) : (
        <form onSubmit={handleSubmit} noValidate>
          <Field
            label="Email"
            type="email"
            name="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onBlur={() => setFieldError(email && !isValidEmail(email) ? "Enter a valid email address." : "")}
            placeholder="you@ju.edu.jo"
            required
            error={fieldError}
          />
          <SubmitButton loading={loading} loadingLabel="Sending…">
            Send reset link
          </SubmitButton>
        </form>
      )}
    </AuthShell>
  );
}

import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AuthShell, Field, Divider, GoogleButton, Banner, SubmitButton } from "../components/AuthShell";
import { colors } from "../theme";
import { supabase, setRememberMe } from "../lib/supabase";
import { friendlyAuthError, isValidEmail, isExistingUserSignup, isAlreadyRegisteredError } from "../lib/auth";

export default function Signup() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [fieldError, setFieldError] = useState({});
  const [confirmSent, setConfirmSent] = useState(false); // confirmation email sent
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const validate = () => {
    const errs = {};
    if (!form.name.trim()) errs.name = "Please enter your full name.";
    if (!isValidEmail(form.email)) errs.email = "Enter a valid email address.";
    if (form.password.length < 8) errs.password = "Password must be at least 8 characters.";
    return errs;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (loading || googleLoading) return; // prevent double-submit
    setError("");
    setNotice("");
    setConfirmSent(false);

    const errs = validate();
    setFieldError(errs);
    if (Object.keys(errs).length) return;

    setLoading(true);
    setRememberMe(true); // new accounts persist by default
    const { data, error } = await supabase.auth.signUp({
      email: form.email.trim(),
      password: form.password,
      options: {
        // full_name is read by the handle_new_user trigger to populate profiles.
        data: { full_name: form.name.trim() },
        emailRedirectTo: `${window.location.origin}/app/home`,
      },
    });
    setLoading(false);

    // Existing account (explicit error, or Supabase's silent empty-identities
    // case — which also covers Google-registered emails) → straight to sign in
    // with the email prefilled. No banner, no enumeration.
    if (isAlreadyRegisteredError(error) || isExistingUserSignup(data)) {
      navigate("/login", { state: { email: form.email.trim() } });
      return;
    }
    if (error) {
      setError(friendlyAuthError(error));
      return;
    }
    if (data.session) {
      // Email confirmation disabled — user is signed in immediately.
      navigate("/app/home");
    } else {
      // Email confirmation required — no session until they verify.
      setNotice("Account created! Check your email to confirm your account, then sign in.");
      setConfirmSent(true);
    }
  };

  const handleGoogle = async () => {
    if (loading || googleLoading) return; // prevent double-submit
    setError("");
    setNotice("");
    setConfirmSent(false);
    setGoogleLoading(true);
    setRememberMe(true); // full_name comes from Google automatically
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/app/home` },
    });
    if (error) {
      setError(friendlyAuthError(error));
      setGoogleLoading(false);
    }
  };

  const busy = loading || googleLoading;
  const passwordTooShort = form.password.length > 0 && form.password.length < 8;

  return (
    <AuthShell
      side={{
        eyebrow: "Get started",
        title: "Start your journey.",
        subtitle: "Join thousands of medical students mastering their exams with JUstep.",
      }}
    >
      <h1 style={{ fontSize: 26, fontWeight: 800, margin: "0 0 6px", color: colors.text }}>Create your account</h1>
      <p style={{ fontSize: 14, color: colors.textSoft, margin: "0 0 28px" }}>
        Already have an account?{" "}
        <Link to="/login" style={{ color: colors.blue, fontWeight: 600, textDecoration: "none" }}>
          Sign in
        </Link>
      </p>

      {error && <Banner type="error">{error}</Banner>}
      {notice && <Banner type="success">{notice}</Banner>}
      {confirmSent && (
        <Link to="/login" state={{ email: form.email.trim() }} style={ctaLink}>
          Go to sign in →
        </Link>
      )}

      <form onSubmit={handleSubmit} noValidate>
        <Field
          label="Full name"
          name="name"
          autoComplete="name"
          value={form.name}
          onChange={set("name")}
          onBlur={() => setFieldError((p) => ({ ...p, name: !form.name.trim() ? "Please enter your full name." : undefined }))}
          placeholder="Qais Suwan"
          required
          error={fieldError.name}
        />
        <Field
          label="Email"
          type="email"
          name="email"
          autoComplete="email"
          value={form.email}
          onChange={set("email")}
          onBlur={() =>
            setFieldError((p) => ({ ...p, email: form.email && !isValidEmail(form.email) ? "Enter a valid email address." : undefined }))
          }
          placeholder="you@ju.edu.jo"
          required
          error={fieldError.email}
        />
        <Field
          label="Password"
          type="password"
          name="password"
          autoComplete="new-password"
          value={form.password}
          onChange={set("password")}
          placeholder="At least 8 characters"
          required
          error={fieldError.password || (passwordTooShort ? "Password must be at least 8 characters." : undefined)}
          hint="Use at least 8 characters."
        />

        <label style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 13, color: colors.textSoft, marginBottom: 22, cursor: "pointer" }}>
          <input type="checkbox" required style={{ accentColor: colors.blue, marginTop: 2 }} />
          <span>
            I agree to the{" "}
            <Link to="/terms" style={{ color: colors.blue, textDecoration: "none" }}>Terms</Link> and{" "}
            <Link to="/privacy" style={{ color: colors.blue, textDecoration: "none" }}>Privacy Policy</Link>.
          </span>
        </label>

        <SubmitButton loading={loading} loadingLabel="Creating account…" disabled={busy}>
          Create account
        </SubmitButton>
      </form>

      <Divider />

      <GoogleButton onClick={handleGoogle} label="Sign up with Google" disabled={busy} />
    </AuthShell>
  );
}

const ctaLink = {
  display: "inline-block",
  margin: "-6px 0 18px",
  color: colors.blue,
  fontWeight: 700,
  fontSize: 14,
  textDecoration: "none",
};

import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AuthShell, Field } from "../components/AuthShell";
import { colors, font } from "../theme";
import { PrimaryButton } from "../components/ui";
import { supabase } from "../lib/supabase";

const universities = ["University of Jordan", "JUST", "Hashemite University", "Mutah University", "Yarmouk University"];
const years = ["1st Year", "2nd Year", "3rd Year", "4th Year", "5th Year", "6th Year"];

export default function Signup() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: "", email: "", password: "", university: universities[0], year: years[1] });
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setNotice("");
    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email: form.email,
      password: form.password,
      options: {
        data: { full_name: form.name, university: form.university, year: form.year },
        emailRedirectTo: `${window.location.origin}/app/home`,
      },
    });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    if (data.session) {
      // Email confirmation disabled — user is signed in immediately.
      navigate("/app/home");
    } else {
      // Email confirmation required — no session until they verify.
      setNotice("Almost there! Check your email to confirm your account, then log in.");
    }
  };

  const handleGoogle = async () => {
    setError("");
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/app/home` },
    });
    if (error) setError(error.message);
  };

  const selectStyle = {
    width: "100%",
    padding: "12px 14px",
    borderRadius: 10,
    border: `1.5px solid ${colors.line}`,
    fontSize: 14,
    outline: "none",
    color: colors.text,
    background: "#fff",
  };

  return (
    <AuthShell
      side={{
        title: "Start your journey.",
        subtitle: "Join thousands of medical students mastering their exams with JUstep.",
      }}
    >
      <h1 style={{ fontSize: 26, fontWeight: 800, margin: "0 0 6px", color: colors.text }}>Create your account</h1>
      <p style={{ fontSize: 14, color: colors.textSoft, margin: "0 0 28px" }}>
        Already have one?{" "}
        <Link to="/login" style={{ color: colors.blue, fontWeight: 600, textDecoration: "none" }}>
          Log in
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

      {notice && (
        <div
          style={{
            background: "#ECFDF5",
            border: `1.5px solid #BBF7D0`,
            color: "#065F46",
            borderRadius: 10,
            padding: "11px 14px",
            fontSize: 13,
            marginBottom: 18,
          }}
        >
          {notice}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <Field label="Full name" value={form.name} onChange={set("name")} placeholder="Qais Suwan" required />
        <Field label="Email" type="email" value={form.email} onChange={set("email")} placeholder="you@ju.edu.jo" required />
        <Field label="Password" type="password" value={form.password} onChange={set("password")} placeholder="At least 8 characters" required />

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 22 }}>
          <label style={{ display: "block" }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: colors.text, display: "block", marginBottom: 6 }}>University</span>
            <select value={form.university} onChange={set("university")} style={selectStyle}>
              {universities.map((u) => (
                <option key={u}>{u}</option>
              ))}
            </select>
          </label>
          <label style={{ display: "block" }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: colors.text, display: "block", marginBottom: 6 }}>Year</span>
            <select value={form.year} onChange={set("year")} style={selectStyle}>
              {years.map((y) => (
                <option key={y}>{y}</option>
              ))}
            </select>
          </label>
        </div>

        <label style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 13, color: colors.textSoft, marginBottom: 22, cursor: "pointer" }}>
          <input type="checkbox" required style={{ accentColor: colors.blue, marginTop: 2 }} />
          <span>
            I agree to the <a href="#" style={{ color: colors.blue, textDecoration: "none" }}>Terms</a> and{" "}
            <a href="#" style={{ color: colors.blue, textDecoration: "none" }}>Privacy Policy</a>.
          </span>
        </label>

        <PrimaryButton type="submit" full style={loading ? { opacity: 0.7, pointerEvents: "none" } : undefined}>
          {loading ? "Creating account…" : "Create account →"}
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
        Sign up with Google
      </button>
    </AuthShell>
  );
}

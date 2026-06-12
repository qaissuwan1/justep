import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AuthShell, Field } from "../components/AuthShell";
import { colors } from "../theme";
import { PrimaryButton } from "../components/ui";

const universities = ["University of Jordan", "JUST", "Hashemite University", "Mutah University", "Yarmouk University"];
const years = ["1st Year", "2nd Year", "3rd Year", "4th Year", "5th Year", "6th Year"];

export default function Signup() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: "", email: "", password: "", university: universities[0], year: years[1] });

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const handleSubmit = (e) => {
    e.preventDefault();
    navigate("/app/home");
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
        stats: [
          { value: "Free", label: "To start" },
          { value: "6", label: "Subjects" },
          { value: "24/7", label: "Access" },
        ],
      }}
    >
      <h1 style={{ fontSize: 26, fontWeight: 800, margin: "0 0 6px", color: colors.text }}>Create your account</h1>
      <p style={{ fontSize: 14, color: colors.textSoft, margin: "0 0 28px" }}>
        Already have one?{" "}
        <Link to="/login" style={{ color: colors.blue, fontWeight: 600, textDecoration: "none" }}>
          Log in
        </Link>
      </p>

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

        <PrimaryButton type="submit" full>
          Create account →
        </PrimaryButton>
      </form>
    </AuthShell>
  );
}

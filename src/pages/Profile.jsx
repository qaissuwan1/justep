import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { colors, font } from "../theme";
import { computeStreak, dayKey } from "../lib/progress";
import { validateUsername } from "../lib/profanity";

/* ------------------------------------------------------------------ */
/*  Profile — clean stats page + editable display name (username)     */
/* ------------------------------------------------------------------ */

export default function Profile() {
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState(null);
  const [profile, setProfile] = useState(null);
  const [stats, setStats] = useState({ questions: 0, accuracy: 0, cards: 0, daysToExam: null, streak: 0, bySubject: [] });

  // username editing
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saveErr, setSaveErr] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setLoading(false); return; }
      setUserId(user.id);

      const [{ data: prof }, { data: prog }, { data: fcProg }, { data: subjects }, { data: questions }] =
        await Promise.all([
          supabase.from("profiles").select("full_name,username,email,avatar_url").eq("id", user.id).single(),
          supabase.from("user_progress").select("question_id,is_correct,answered_at").eq("user_id", user.id),
          supabase.from("flashcard_progress").select("id").eq("user_id", user.id),
          supabase.from("subjects").select("id,name,exam_date"),
          supabase.from("questions").select("id,subject_id").is("deleted_at", null),
        ]);

      const latest = {};
      (prog || []).forEach((p) => {
        const prev = latest[p.question_id];
        if (!prev || new Date(p.answered_at) > new Date(prev.answered_at)) latest[p.question_id] = p;
      });
      const attempts = Object.values(latest);
      const correct = attempts.filter((a) => a.is_correct).length;
      const accuracy = attempts.length ? Math.round((correct / attempts.length) * 100) : 0;

      const daysSet = new Set((prog || []).map((p) => dayKey(p.answered_at)));
      const streak = computeStreak(daysSet);

      const now = new Date();
      const upcoming = (subjects || [])
        .filter((s) => s.exam_date && new Date(s.exam_date) >= now)
        .sort((a, b) => new Date(a.exam_date) - new Date(b.exam_date))[0];
      const daysToExam = upcoming ? Math.ceil((new Date(upcoming.exam_date) - now) / 86400000) : null;

      const qSubject = {}; (questions || []).forEach((q) => (qSubject[q.id] = q.subject_id));
      const subjName = {}; (subjects || []).forEach((s) => (subjName[s.id] = s.name));
      const bySub = {};
      attempts.forEach((a) => {
        const sid = qSubject[a.question_id]; if (!sid) return;
        if (!bySub[sid]) bySub[sid] = { total: 0, correct: 0 };
        bySub[sid].total++; if (a.is_correct) bySub[sid].correct++;
      });
      const bySubject = Object.entries(bySub)
        .map(([sid, v]) => ({ name: subjName[sid] || "—", pct: Math.round((v.correct / v.total) * 100), total: v.total }))
        .sort((a, b) => b.total - a.total);

      setProfile(prof || { full_name: user.email, email: user.email });
      setDraft(prof?.username || "");
      setStats({ questions: attempts.length, accuracy, cards: (fcProg || []).length, daysToExam, streak, bySubject });
      setLoading(false);
    })();
  }, []);

  async function saveUsername() {
    setSaveErr(null);
    const { ok, error } = validateUsername(draft);
    if (!ok) { setSaveErr(error); return; }
    setSaving(true);
    const { error: dbErr } = await supabase.from("profiles").update({ username: draft.trim() }).eq("id", userId);
    setSaving(false);
    if (dbErr) {
      setSaveErr(dbErr.code === "23505" ? "That username is already taken." : "Could not save. Try again.");
      return;
    }
    setProfile((p) => ({ ...p, username: draft.trim() }));
    setEditing(false);
  }

  if (loading) {
    return <div style={{ display: "flex", justifyContent: "center", paddingTop: 80 }}><div style={spinner} /></div>;
  }

  // display name priority: username > full_name > email prefix
  const displayName = profile?.username || profile?.full_name || profile?.email?.split("@")[0] || "Student";
  const initial = displayName.trim().charAt(0).toUpperCase();

  return (
    <div style={{ fontFamily: font, maxWidth: 880, margin: "0 auto", color: colors.text }}>
      {/* header */}
      <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "4px 2px 22px" }}>
        <div style={avatar}>{profile?.avatar_url ? <img src={profile.avatar_url} alt="" style={{ width: "100%", height: "100%", borderRadius: "50%" }} /> : initial}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          {editing ? (
            <div>
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Choose a display name"
                  maxLength={24}
                  style={input}
                  autoFocus
                />
                <button onClick={saveUsername} disabled={saving} style={saveBtn}>{saving ? "Saving…" : "Save"}</button>
                <button onClick={() => { setEditing(false); setDraft(profile?.username || ""); setSaveErr(null); }} style={cancelBtn}>Cancel</button>
              </div>
              {saveErr && <div style={{ color: colors.red, fontSize: 12, marginTop: 6 }}>{saveErr}</div>}
              <div style={{ fontSize: 12, color: colors.textSoft, marginTop: 6 }}>This is the name shown on the leaderboard.</div>
            </div>
          ) : (
            <>
              <div style={{ fontSize: 19, fontWeight: 600, display: "flex", alignItems: "center", gap: 10 }}>
                {displayName}
                <button onClick={() => setEditing(true)} style={editLink}>Edit name</button>
              </div>
              <div style={{ fontSize: 13, color: colors.textSoft }}>{profile?.email}</div>
            </>
          )}
        </div>
        {!editing && stats.streak > 0 && <span style={chip}>{stats.streak}-day streak</span>}
      </div>

      {/* stat grid */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10, marginBottom: 14 }}>
        <Stat n={stats.questions} l="Questions done" />
        <Stat n={`${stats.accuracy}%`} l="Accuracy" />
        <Stat n={stats.cards.toLocaleString()} l="Cards reviewed" />
        <Stat n={stats.daysToExam != null ? stats.daysToExam : "—"} l={stats.daysToExam != null ? "Days to exam" : "No exam set"} />
      </div>

      {/* accuracy by subject */}
      <div style={card}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 14 }}>Accuracy by subject</div>
        {stats.bySubject.length === 0 ? (
          <div style={{ fontSize: 13, color: colors.textSoft }}>Answer some questions to see your breakdown here.</div>
        ) : (
          stats.bySubject.map((s) => (
            <div key={s.name} style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 11 }}>
              <span style={{ fontSize: 13, width: 120, color: colors.textSoft, textTransform: "capitalize", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</span>
              <div style={{ flex: 1, height: 6, background: colors.line, borderRadius: 999, overflow: "hidden" }}>
                <div style={{ width: `${s.pct}%`, height: "100%", background: colors.textSoft, opacity: 0.55 }} />
              </div>
              <span style={{ fontSize: 13, fontWeight: 500, width: 36, textAlign: "right" }}>{s.pct}%</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function Stat({ n, l }) {
  return (
    <div style={card}>
      <div style={{ fontSize: 24, fontWeight: 600, color: colors.text }}>{n}</div>
      <div style={{ fontSize: 12, color: colors.textSoft, marginTop: 3 }}>{l}</div>
    </div>
  );
}

const card = { background: colors.card, border: `0.5px solid ${colors.line}`, borderRadius: 14, padding: 20 };
const avatar = { width: 60, height: 60, borderRadius: "50%", background: colors.bg, color: colors.text, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, fontWeight: 600, flexShrink: 0, border: `0.5px solid ${colors.line}` };
const chip = { fontSize: 13, color: colors.textSoft, border: `0.5px solid ${colors.line}`, padding: "5px 12px", borderRadius: 999, whiteSpace: "nowrap" };
const editLink = { fontSize: 12, fontWeight: 600, color: colors.blue, background: "none", border: "none", cursor: "pointer", fontFamily: font, padding: 0 };
const input = { fontSize: 15, padding: "8px 12px", border: `1px solid ${colors.line}`, borderRadius: 8, fontFamily: font, minWidth: 200, color: colors.text };
const saveBtn = { fontSize: 13, fontWeight: 600, color: "#fff", background: colors.blue, border: "none", borderRadius: 8, padding: "9px 16px", cursor: "pointer", fontFamily: font };
const cancelBtn = { fontSize: 13, fontWeight: 600, color: colors.textSoft, background: "none", border: `1px solid ${colors.line}`, borderRadius: 8, padding: "9px 16px", cursor: "pointer", fontFamily: font };
const spinner = { width: 32, height: 32, border: `3px solid ${colors.line}`, borderTopColor: colors.blue, borderRadius: "50%", animation: "spin 0.8s linear infinite" };

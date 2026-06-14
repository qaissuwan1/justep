// Reusable student dashboard analytics. Used by Home.jsx (mode="self", current
// user) and the Admin User Management detail view (mode="admin", any user).
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { colors, font } from "../theme";
import { Card, PageHeader, ProgressBar, PrimaryButton, StatCard } from "./ui";
import { dayKey, computeStreak, timeAgo } from "../lib/progress";

function Spinner() {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, minHeight: "50vh", color: colors.textSoft, fontSize: 14 }}>
      <div style={{ width: 40, height: 40, borderRadius: "50%", border: `3px solid ${colors.line}`, borderTopColor: colors.blue, animation: "spin 0.7s linear infinite" }} />
      Loading analytics…
    </div>
  );
}

function QuickActions({ navigate }) {
  return (
    <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
      <PrimaryButton onClick={() => navigate("/app/questions")} style={{ padding: "13px 26px" }}>
        Start Question Block →
      </PrimaryButton>
      <button
        onClick={() => navigate("/app/flashcards")}
        style={{ background: "#fff", color: colors.navy, border: `1.5px solid ${colors.line}`, borderRadius: 12, padding: "13px 26px", fontSize: 15, fontWeight: 700, cursor: "pointer", fontFamily: font }}
      >
        Review Flashcards
      </button>
    </div>
  );
}

export default function StudentAnalytics({ userId = null, mode = "self" }) {
  const navigate = useNavigate();
  const self = mode === "self";
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState({ name: "Student", email: "" });
  const [stats, setStats] = useState({ total: 0, correct: 0, accuracy: 0, flashcards: 0, streak: 0 });
  const [perf, setPerf] = useState([]);
  const [recent, setRecent] = useState([]);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      let uid = userId;
      if (!uid) {
        const { data: { user } } = await supabase.auth.getUser();
        if (!active) return;
        uid = user?.id;
      }
      if (!uid) {
        if (active) setLoading(false);
        return;
      }

      const [profileRes, progressRes, fcRes] = await Promise.all([
        supabase.from("profiles").select("full_name, email").eq("id", uid).maybeSingle(),
        supabase
          .from("user_progress")
          .select("is_correct, answered_at, questions(topic, subjects(id, name, color))")
          .eq("user_id", uid)
          .order("answered_at", { ascending: false }),
        supabase.from("flashcard_progress").select("*", { count: "exact", head: true }).eq("user_id", uid),
      ]);
      if (!active) return;

      const rows = progressRes.data || [];
      const total = rows.length;
      const correct = rows.filter((r) => r.is_correct).length;
      const accuracy = total ? Math.round((correct / total) * 100) : 0;
      const flashcards = fcRes.count || 0;
      const streak = computeStreak(new Set(rows.map((r) => dayKey(r.answered_at))));

      const map = new Map();
      rows.forEach((r) => {
        const subj = r.questions?.subjects;
        if (!subj) return;
        const cur = map.get(subj.id) || { name: subj.name, color: subj.color, total: 0, correct: 0 };
        cur.total++;
        if (r.is_correct) cur.correct++;
        map.set(subj.id, cur);
      });
      const perfArr = [...map.values()]
        .map((s) => ({ ...s, accuracy: s.total ? Math.round((s.correct / s.total) * 100) : 0 }))
        .sort((a, b) => b.total - a.total);

      const recentArr = rows.slice(0, 5).map((r) => ({
        topic: r.questions?.topic || "Question",
        subject: r.questions?.subjects?.name,
        is_correct: r.is_correct,
        answered_at: r.answered_at,
      }));

      const p = profileRes.data;
      setProfile({ name: p?.full_name || p?.email?.split("@")[0] || "Student", email: p?.email || "" });
      setStats({ total, correct, accuracy, flashcards, streak });
      setPerf(perfArr);
      setRecent(recentArr);
      setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [userId]);

  if (loading) return <Spinner />;

  const today = new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
  const hasActivity = stats.total > 0 || stats.flashcards > 0;

  return (
    <>
      <PageHeader title={self ? `Welcome back, ${profile.name}` : profile.name} subtitle={self ? today : profile.email || "Student analytics"} />

      {!hasActivity ? (
        self ? (
          <Card style={{ textAlign: "center", padding: "48px 32px" }}>
            <div style={{ fontSize: 44, marginBottom: 12 }}>📊</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: colors.navy, marginBottom: 8 }}>Let's get started</div>
            <p style={{ fontSize: 14, color: colors.textSoft, maxWidth: 420, margin: "0 auto 22px", lineHeight: 1.6 }}>
              Answer your first question to see your stats, streak, and performance here.
            </p>
            <div style={{ display: "flex", justifyContent: "center" }}>
              <QuickActions navigate={navigate} />
            </div>
          </Card>
        ) : (
          <Card style={{ textAlign: "center", padding: "44px 32px" }}>
            <div style={{ fontSize: 40, marginBottom: 10 }}>📭</div>
            <div style={{ fontSize: 17, fontWeight: 700, color: colors.navy, marginBottom: 6 }}>No activity yet</div>
            <p style={{ fontSize: 14, color: colors.textSoft, margin: 0 }}>This student hasn't answered any questions or reviewed flashcards yet.</p>
          </Card>
        )
      ) : (
        <>
          {/* STAT CARDS */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16, marginBottom: 22 }}>
            <StatCard label="Questions answered" value={stats.total.toLocaleString()} sub="all time" accent={colors.blue} icon="📝" />
            <StatCard label="Correct answers" value={stats.correct.toLocaleString()} sub={`${stats.accuracy}% accuracy`} accent={colors.green} icon="🎯" />
            <StatCard label="Flashcards reviewed" value={stats.flashcards.toLocaleString()} sub="cards" accent={colors.tealDeep} icon="🃏" />
            <StatCard label="Current streak" value={stats.streak} sub={stats.streak === 1 ? "day" : "days"} accent={colors.orange} icon="🔥" />
          </div>

          {/* PERFORMANCE + RECENT */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18, marginBottom: self ? 22 : 0 }}>
            <Card>
              <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 18 }}>Performance by subject</div>
              {perf.length === 0 ? (
                <div style={{ color: colors.textMuted, fontSize: 14, padding: "12px 0" }}>No subject data yet.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  {perf.map((s) => (
                    <div key={s.name}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                        <span style={{ fontSize: 13, fontWeight: 600 }}>{s.name}</span>
                        <span style={{ fontSize: 12, color: colors.textMuted }}>{s.accuracy}% · {s.total} answered</span>
                      </div>
                      <ProgressBar value={s.accuracy} color={s.color || colors.blue} />
                    </div>
                  ))}
                </div>
              )}
            </Card>

            <Card>
              <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 18 }}>Recent activity</div>
              {recent.length === 0 ? (
                <div style={{ color: colors.textMuted, fontSize: 14, padding: "12px 0" }}>No answered questions yet.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {recent.map((r, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", background: "#F8FAFF", borderRadius: 10 }}>
                      <span style={{ width: 26, height: 26, borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700, fontSize: 13, background: r.is_correct ? colors.green : colors.red }}>
                        {r.is_correct ? "✓" : "✗"}
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.topic}</div>
                        <div style={{ fontSize: 11, color: colors.textMuted }}>{r.subject ? `${r.subject} · ` : ""}{timeAgo(r.answered_at)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>

          {/* QUICK ACTIONS (self only) */}
          {self && (
            <Card>
              <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 14 }}>Quick actions</div>
              <QuickActions navigate={navigate} />
            </Card>
          )}
        </>
      )}
    </>
  );
}

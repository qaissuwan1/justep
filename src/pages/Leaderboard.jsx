import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { colors, font } from "../theme";

/* ------------------------------------------------------------------ */
/*  Leaderboard — real rankings from user_progress                    */
/*  Ranked by: questions answered, then accuracy                      */
/* ------------------------------------------------------------------ */

export default function Leaderboard() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows]       = useState([]);
  const [myId, setMyId]       = useState(null);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) setMyId(user.id);

      const [{ data: profiles }, { data: progress }] = await Promise.all([
        supabase.from("profiles").select("id,full_name,username,avatar_url"),
        supabase.from("user_progress").select("user_id,question_id,is_correct,answered_at"),
      ]);

      // aggregate per user — latest attempt per question
      const byUser = {};
      (progress || []).forEach((p) => {
        if (!byUser[p.user_id]) byUser[p.user_id] = {};
        const prev = byUser[p.user_id][p.question_id];
        if (!prev || new Date(p.answered_at) > new Date(prev.answered_at)) {
          byUser[p.user_id][p.question_id] = p;
        }
      });

      const ranked = (profiles || [])
        .map((pr) => {
          const attempts = Object.values(byUser[pr.id] || {});
          const total    = attempts.length;
          const correct  = attempts.filter((a) => a.is_correct).length;
          const accuracy = total ? Math.round((correct / total) * 100) : 0;
          // streak: consecutive answered days
          const days = new Set(attempts.map((a) => {
            const d = new Date(a.answered_at);
            return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
          }));
          let streak = 0;
          const cursor = new Date(); cursor.setHours(0,0,0,0);
          const key = (dt) => `${dt.getFullYear()}-${dt.getMonth()}-${dt.getDate()}`;
          if (!days.has(key(cursor))) cursor.setDate(cursor.getDate() - 1);
          while (days.has(key(cursor))) { streak++; cursor.setDate(cursor.getDate() - 1); }
          return { ...pr, total, accuracy, streak };
        })
        .filter((r) => r.total > 0)
        .sort((a, b) => b.total - a.total || b.accuracy - a.accuracy);

      setRows(ranked);
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return <div style={{ display:"flex", justifyContent:"center", paddingTop:80 }}><div style={spinner}/></div>;
  }

  return (
    <div style={{ fontFamily:font, maxWidth:720, margin:"0 auto", color:colors.text }}>
      <h1 style={{ fontSize:24, margin:"0 0 4px" }}>Leaderboard</h1>
      <p style={{ color:colors.textSoft, margin:"0 0 20px", fontSize:14 }}>
        Ranked by questions answered. Keep your streak going!
      </p>

      {rows.length === 0 ? (
        <div style={{ ...card, textAlign:"center", padding:"48px 20px", color:colors.textSoft }}>
          No activity yet — answer some questions to appear here.
        </div>
      ) : (
        <div style={card}>
          {/* header */}
          <div style={headerRow}>
            <span style={{ width:36 }}>#</span>
            <span style={{ flex:1 }}>Student</span>
            <span style={col}>Questions</span>
            <span style={col}>Accuracy</span>
            <span style={col}>Streak</span>
          </div>

          {rows.map((r, i) => {
            const isMe = r.id === myId;
            const name = r.username || r.full_name || "Student";
            const initial = name.trim().charAt(0).toUpperCase();
            const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : null;

            return (
              <div key={r.id} style={{
                ...dataRow,
                background: isMe ? "#EFF6FF" : "transparent",
                borderLeft: isMe ? `3px solid ${colors.blue}` : "3px solid transparent",
              }}>
                <span style={{ width:36, fontWeight:700, color: i < 3 ? colors.blue : colors.textSoft, fontSize:15 }}>
                  {medal || i + 1}
                </span>
                <div style={{ flex:1, display:"flex", alignItems:"center", gap:10 }}>
                  <div style={avatar}>
                    {r.avatar_url
                      ? <img src={r.avatar_url} alt="" style={{ width:"100%", height:"100%", borderRadius:"50%" }}/>
                      : initial}
                  </div>
                  <div>
                    <div style={{ fontWeight:600, fontSize:14 }}>{name}{isMe && <span style={{ fontSize:11, color:colors.blue, marginLeft:6 }}>you</span>}</div>
                  </div>
                </div>
                <span style={{ ...col, fontWeight:700 }}>{r.total.toLocaleString()}</span>
                <span style={{ ...col, color: r.accuracy >= 70 ? colors.green : r.accuracy >= 50 ? colors.amber : colors.red }}>
                  {r.accuracy}%
                </span>
                <span style={{ ...col, color:colors.textSoft }}>
                  {r.streak > 0 ? `${r.streak}d` : "—"}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const card = {
  background: colors.card,
  border: `0.5px solid ${colors.line}`,
  borderRadius: 14,
  overflow: "hidden",
};
const headerRow = {
  display:"flex", alignItems:"center", gap:12,
  padding:"10px 16px",
  fontSize:11, fontWeight:700, textTransform:"uppercase",
  letterSpacing:"0.05em", color:colors.textSoft,
  borderBottom:`1px solid ${colors.line}`,
  background: colors.bg,
};
const dataRow = {
  display:"flex", alignItems:"center", gap:12,
  padding:"13px 16px",
  borderBottom:`1px solid ${colors.line}`,
  transition:"background .15s",
};
const col = {
  width:90, textAlign:"right", fontSize:14,
};
const avatar = {
  width:34, height:34, borderRadius:"50%",
  background: colors.line, color:colors.text,
  display:"flex", alignItems:"center", justifyContent:"center",
  fontSize:14, fontWeight:600, flexShrink:0,
};
const spinner = {
  width:32, height:32,
  border:`3px solid ${colors.line}`,
  borderTopColor:colors.blue,
  borderRadius:"50%",
  animation:"spin .8s linear infinite",
};

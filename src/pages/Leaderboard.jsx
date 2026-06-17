import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { colors, font } from "../theme";

/* ------------------------------------------------------------------ */
/*  Leaderboard — server-aggregated via get_leaderboard() RPC         */
/*  Scales to many students: the DB computes ranks and returns ~100   */
/*  rows instead of every progress row being downloaded per client.   */
/* ------------------------------------------------------------------ */

export default function Leaderboard() {
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(false);
  const [rows, setRows]       = useState([]);
  const [myId, setMyId]       = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(false);
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user && !cancelled) setMyId(user.id);

        const { data, error: rpcErr } = await supabase.rpc("get_leaderboard");
        if (cancelled) return;
        if (rpcErr) { setError(true); setLoading(false); return; }
        setRows(data || []);
      } catch {
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return <div style={{ display: "flex", justifyContent: "center", paddingTop: 80 }}><div style={spinner} /></div>;
  }

  if (error) {
    return (
      <div style={{ fontFamily: font, maxWidth: 720, margin: "0 auto", color: colors.text }}>
        <h1 style={{ fontSize: 24, margin: "0 0 4px" }}>Leaderboard</h1>
        <div style={{ ...card, textAlign: "center", padding: "40px 20px" }}>
          <div style={{ color: colors.textSoft, marginBottom: 12 }}>Couldn't load the leaderboard. Check your connection and try again.</div>
          <button onClick={() => window.location.reload()} style={retryBtn}>Retry</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ fontFamily: font, maxWidth: 720, margin: "0 auto", color: colors.text }}>
      <h1 style={{ fontSize: 24, margin: "0 0 4px" }}>Leaderboard</h1>
      <p style={{ color: colors.textSoft, margin: "0 0 20px", fontSize: 14 }}>
        Ranked by questions answered, then accuracy.
      </p>

      {rows.length === 0 ? (
        <div style={{ ...card, textAlign: "center", padding: "48px 20px", color: colors.textSoft }}>
          No activity yet — answer some questions to appear here.
        </div>
      ) : (
        <div style={card}>
          <div style={{ overflowX: "auto" }}>
            <div style={{ minWidth: 420 }}>
              <div style={headerRow}>
                <span style={{ width: 36 }}>#</span>
                <span style={{ flex: 1 }}>Student</span>
                <span style={col}>Questions</span>
                <span style={col}>Accuracy</span>
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
                    <span style={{ width: 36, fontWeight: 700, color: i < 3 ? colors.blue : colors.textSoft, fontSize: 15 }}>
                      {medal || i + 1}
                    </span>
                    <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                      <div style={avatar}>
                        {r.avatar_url ? <img src={r.avatar_url} alt="" style={{ width: "100%", height: "100%", borderRadius: "50%" }} /> : initial}
                      </div>
                      <div style={{ fontWeight: 600, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {name}{isMe && <span style={{ fontSize: 11, color: colors.blue, marginLeft: 6 }}>you</span>}
                      </div>
                    </div>
                    <span style={{ ...col, fontWeight: 700 }}>{Number(r.total).toLocaleString()}</span>
                    <span style={{ ...col, color: r.accuracy >= 70 ? colors.green : r.accuracy >= 50 ? colors.amber : colors.red }}>
                      {r.accuracy}%
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const card = { background: colors.card, border: `0.5px solid ${colors.line}`, borderRadius: 14, overflow: "hidden" };
const headerRow = { display: "flex", alignItems: "center", gap: 12, padding: "10px 16px", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: colors.textSoft, borderBottom: `1px solid ${colors.line}`, background: colors.bg };
const dataRow = { display: "flex", alignItems: "center", gap: 12, padding: "13px 16px", borderBottom: `1px solid ${colors.line}` };
const col = { width: 90, textAlign: "right", fontSize: 14 };
const avatar = { width: 34, height: 34, borderRadius: "50%", background: colors.line, color: colors.text, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 600, flexShrink: 0 };
const retryBtn = { background: colors.blue, color: "#fff", border: "none", borderRadius: 8, padding: "10px 22px", fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: font };
const spinner = { width: 32, height: 32, border: `3px solid ${colors.line}`, borderTopColor: colors.blue, borderRadius: "50%", animation: "spin 0.8s linear infinite" };

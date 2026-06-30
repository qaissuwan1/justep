// Thin fixed bar shown at the very top of any task page during a guided
// Study Session (URL has ?session=1). Reads the session from sessionStorage and
// shows "Task N of M" + progress + an Exit (×) control. Renders nothing when
// there's no active session, so it's safe to drop into any page unconditionally.
import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { readSession, clearSession, currentUserId } from "../lib/session";

export const SESSION_BAR_H = 38;

export default function SessionBar() {
  const [params] = useSearchParams();
  const inSession = params.get("session") === "1";
  const navigate = useNavigate();
  const [session, setSession] = useState(null);

  useEffect(() => {
    if (!inSession) return;
    let active = true;
    (async () => {
      const uid = await currentUserId();
      if (active) setSession(uid ? readSession(uid) : null);
    })();
    return () => {
      active = false;
    };
  }, [inSession]);

  if (!inSession || !session || !session.tasks?.length) return null;

  const total = session.tasks.length;
  const idx = Math.min(session.currentIndex ?? 0, total - 1);
  const pct = Math.round((idx / total) * 100); // tasks completed before the current one

  const exit = async () => {
    const uid = await currentUserId();
    if (uid) clearSession(uid);
    navigate("/app/home");
  };

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        height: SESSION_BAR_H,
        zIndex: 5000,
        background: "#2B5CE6",
        color: "#fff",
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "0 14px",
        fontSize: 13,
        fontFamily: "inherit",
        boxShadow: "0 1px 6px rgba(0,0,0,0.18)",
      }}
    >
      <span style={{ fontWeight: 600, whiteSpace: "nowrap" }}>
        Session · Task {idx + 1} of {total}
      </span>
      <div style={{ flex: 1, height: 6, background: "rgba(255,255,255,0.25)", borderRadius: 999, overflow: "hidden", minWidth: 40 }}>
        <div style={{ height: "100%", width: `${pct}%`, background: "#fff", borderRadius: 999, transition: "width .3s" }} />
      </div>
      <button
        onClick={exit}
        aria-label="Exit session"
        style={{ background: "transparent", border: "none", color: "#fff", fontSize: 20, lineHeight: 1, cursor: "pointer", padding: "0 4px" }}
      >
        ×
      </button>
    </div>
  );
}

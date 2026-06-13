// Guards authenticated routes: checks for a Supabase session and redirects
// unauthenticated users to /login. Renders its children once a session exists.
import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { colors, font } from "../theme";

export default function ProtectedRoute({ children }) {
  // undefined = still checking, null = no session, object = signed in
  const [session, setSession] = useState(undefined);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (mounted) setSession(data.session);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });

    return () => {
      mounted = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  if (session === undefined) {
    // Session still resolving — show a spinner so the UI doesn't flash to /login
    // before getSession() restores a persisted session from localStorage.
    return (
      <div
        style={{
          fontFamily: font,
          minHeight: "100vh",
          background: colors.bg,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 16,
          color: colors.textSoft,
          fontSize: 14,
        }}
      >
        <style>{`@keyframes ju-spin{to{transform:rotate(360deg)}}`}</style>
        <div
          style={{
            width: 42,
            height: 42,
            borderRadius: "50%",
            border: `3px solid ${colors.line}`,
            borderTopColor: colors.blue,
            animation: "ju-spin 0.7s linear infinite",
          }}
        />
        Checking your session…
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  return children;
}

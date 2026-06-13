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
    // Brief loading state while the session is resolved.
    return (
      <div
        style={{
          fontFamily: font,
          minHeight: "100vh",
          background: colors.bg,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: colors.textSoft,
          fontSize: 14,
        }}
      >
        Loading…
      </div>
    );
  }

  if (!session) {
    return <Navigate to="/login" replace />;
  }

  return children;
}

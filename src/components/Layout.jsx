// Authenticated app shell: navy sidebar + main content via <Outlet />.
// Desktop: fixed 220px sidebar. Mobile (<=768px): sidebar becomes a slide-in
// drawer behind a hamburger top bar, and main content goes full-width.
import { useEffect, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { colors, gradients, font } from "../theme";
import { supabase } from "../lib/supabase";
import useIsMobile from "../lib/useIsMobile";

const navItems = [
  { to: "/app/home", icon: "⊞", label: "Dashboard" },
  { to: "/app/questions", icon: "☰", label: "Question Bank" },
  { to: "/app/flashcards", icon: "▣", label: "Flashcards" },
  { to: "/app/subjects", icon: "◈", label: "Library" },
  { to: "/app/leaderboard", icon: "≡", label: "Leaderboard" },
  { to: "/app/profile", icon: "○", label: "Profile" },
];

// Shared so the Admin link (rendered separately) matches the mapped links exactly.
const navLinkStyle = ({ isActive }) => ({
  width: "100%",
  display: "flex",
  alignItems: "center",
  gap: 12,
  padding: "11px 14px",
  borderRadius: 10,
  marginBottom: 4,
  textDecoration: "none",
  background: isActive ? "rgba(79,142,247,0.18)" : "transparent",
  color: isActive ? colors.blue : "rgba(255,255,255,0.55)",
  fontSize: 14,
  fontWeight: isActive ? 600 : 400,
  transition: "all 0.15s",
});

export default function Layout() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const closeDrawer = () => setDrawerOpen(false);
  const [user, setUser] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    // Resolve the user, then look up their role to decide if the Admin link shows.
    const applyUser = async (u) => {
      setUser(u);
      if (!u) {
        setIsAdmin(false);
        return;
      }
      const { data: profile } = await supabase.from("profiles").select("role").eq("id", u.id).maybeSingle();
      setIsAdmin(profile?.role === "admin");
    };

    supabase.auth.getUser().then(({ data }) => applyUser(data.user));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      applyUser(session?.user ?? null);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/login");
  };

  const email = user?.email || "";
  const initial = (email[0] || "U").toUpperCase();
  const fullName = user?.user_metadata?.full_name;

  return (
    <div style={{ fontFamily: font, background: colors.bg, minHeight: "100vh", display: "flex", color: colors.text }}>
      {/* Mobile top bar */}
      {isMobile && (
        <header
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            height: 56,
            background: colors.card,
            borderBottom: `1px solid ${colors.line}`,
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "0 16px",
            zIndex: 20,
          }}
        >
          <button
            onClick={() => setDrawerOpen(true)}
            aria-label="Open menu"
            style={{ background: "transparent", border: "none", fontSize: 22, lineHeight: 1, color: colors.text, cursor: "pointer", padding: 4 }}
          >
            ☰
          </button>
          <NavLink to="/app/home" onClick={closeDrawer} style={{ textDecoration: "none", display: "flex", alignItems: "center", gap: 8 }}>
            <div
              style={{
                width: 30,
                height: 30,
                background: gradients.accent,
                borderRadius: 8,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 14,
                fontWeight: 800,
                color: "#fff",
              }}
            >
              J
            </div>
            <span style={{ fontSize: 18, fontWeight: 800, color: colors.navy, letterSpacing: "-0.5px" }}>
              JU<span style={{ color: colors.teal }}>step</span>
            </span>
          </NavLink>
        </header>
      )}

      {/* Mobile drawer overlay */}
      {isMobile && drawerOpen && (
        <div onClick={closeDrawer} style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.5)", zIndex: 30 }} />
      )}

      {/* Sidebar */}
      <aside
        style={{
          width: 220,
          background: colors.navy,
          display: "flex",
          flexDirection: "column",
          padding: "28px 0",
          position: "fixed",
          top: 0,
          left: 0,
          height: "100vh",
          zIndex: isMobile ? 40 : 10,
          transform: isMobile && !drawerOpen ? "translateX(-100%)" : "translateX(0)",
          transition: "transform 0.25s ease",
          boxShadow: isMobile && drawerOpen ? "0 0 40px rgba(0,0,0,0.4)" : "none",
        }}
      >
        {/* Logo */}
        <NavLink to="/app/home" onClick={closeDrawer} style={{ textDecoration: "none", padding: "0 24px 32px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                width: 36,
                height: 36,
                background: gradients.accent,
                borderRadius: 10,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 16,
                fontWeight: 800,
                color: "#fff",
              }}
            >
              J
            </div>
            <span style={{ fontSize: 20, fontWeight: 800, color: "#fff", letterSpacing: "-0.5px" }}>
              JU<span style={{ color: colors.teal }}>step</span>
            </span>
          </div>
        </NavLink>

        {/* Nav */}
        <nav style={{ flex: 1, padding: "0 12px", overflowY: "auto" }}>
          {navItems.map((item) => (
            <NavLink key={item.to} to={item.to} onClick={closeDrawer} style={navLinkStyle}>
              <span style={{ fontSize: 16 }}>{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
          {isAdmin && (
            <NavLink to="/app/admin" onClick={closeDrawer} style={navLinkStyle}>
              <span style={{ fontSize: 16 }}>⚙</span>
              Admin
            </NavLink>
          )}
        </nav>

        {/* User + logout */}
        <div style={{ padding: "0 16px" }}>
          <div
            style={{
              background: "rgba(255,255,255,0.07)",
              borderRadius: 12,
              padding: "12px 14px",
              display: "flex",
              alignItems: "center",
              gap: 10,
              marginBottom: 10,
            }}
          >
            <div
              style={{
                width: 34,
                height: 34,
                borderRadius: "50%",
                background: gradients.accent,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 14,
                fontWeight: 700,
                color: "#fff",
                flexShrink: 0,
              }}
            >
              {initial}
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: "#fff",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
                title={email}
              >
                {email || "Signed in"}
              </div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>{fullName || "Student"}</div>
            </div>
          </div>
          <button
            onClick={handleLogout}
            style={{
              width: "100%",
              background: "transparent",
              border: "1px solid rgba(255,255,255,0.12)",
              color: "rgba(255,255,255,0.55)",
              borderRadius: 10,
              padding: "9px 0",
              fontSize: 13,
              cursor: "pointer",
              fontFamily: font,
            }}
          >
            ↩ Log out
          </button>
        </div>
      </aside>

      {/* Main */}
      <main
        style={
          isMobile
            ? { marginLeft: 0, flex: 1, padding: "72px 16px 28px", maxWidth: "100vw", boxSizing: "border-box" }
            : { marginLeft: 220, flex: 1, padding: "32px 36px", maxWidth: "calc(100vw - 220px)" }
        }
      >
        <Outlet />
      </main>
    </div>
  );
}

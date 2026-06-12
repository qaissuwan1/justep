// Authenticated app shell: navy sidebar + main content via <Outlet />.
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { colors, gradients, font, currentUser } from "../theme";

const navItems = [
  { to: "/app/home", icon: "⊞", label: "Dashboard" },
  { to: "/app/questions", icon: "📋", label: "Question Bank" },
  { to: "/app/flashcards", icon: "🃏", label: "Flashcards" },
  { to: "/app/subjects", icon: "📚", label: "Subjects" },
  { to: "/app/leaderboard", icon: "🏆", label: "Leaderboard" },
  { to: "/app/profile", icon: "👤", label: "Profile" },
  { to: "/app/admin", icon: "⚙️", label: "Admin" },
];

export default function Layout() {
  const navigate = useNavigate();

  return (
    <div style={{ fontFamily: font, background: colors.bg, minHeight: "100vh", display: "flex", color: colors.text }}>
      {/* Sidebar */}
      <aside
        style={{
          width: 220,
          background: colors.navy,
          display: "flex",
          flexDirection: "column",
          padding: "28px 0",
          position: "fixed",
          height: "100vh",
          zIndex: 10,
        }}
      >
        {/* Logo */}
        <NavLink to="/app/home" style={{ textDecoration: "none", padding: "0 24px 32px" }}>
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
            <NavLink
              key={item.to}
              to={item.to}
              style={({ isActive }) => ({
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
              })}
            >
              <span style={{ fontSize: 16 }}>{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
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
              {currentUser.initial}
            </div>
            <div>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#fff" }}>{currentUser.name}</div>
              <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)" }}>{currentUser.year}</div>
            </div>
          </div>
          <button
            onClick={() => navigate("/login")}
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
      <main style={{ marginLeft: 220, flex: 1, padding: "32px 36px", maxWidth: "calc(100vw - 220px)" }}>
        <Outlet />
      </main>
    </div>
  );
}

import { BrowserRouter, Routes, Route, Navigate, Link } from "react-router-dom";
import Layout from "./components/Layout";
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import Home from "./pages/Home";
import Questions from "./pages/Questions";
import Flashcards from "./pages/Flashcards";
import Subjects from "./pages/Subjects";
import Leaderboard from "./pages/Leaderboard";
import Profile from "./pages/Profile";
import Admin from "./pages/Admin";
import { colors, font, gradients } from "./theme";

function NotFound() {
  return (
    <div style={{ fontFamily: font, minHeight: "100vh", background: colors.bg, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: colors.text }}>
      <div style={{ fontSize: 72, fontWeight: 800, color: colors.navy }}>404</div>
      <p style={{ fontSize: 16, color: colors.textSoft, margin: "8px 0 24px" }}>This page wandered off the syllabus.</p>
      <Link to="/" style={{ background: gradients.accent, color: "#fff", textDecoration: "none", padding: "12px 28px", borderRadius: 12, fontWeight: 700 }}>
        Back home
      </Link>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public */}
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />

        {/* Authenticated app shell */}
        <Route path="/app" element={<Layout />}>
          <Route index element={<Navigate to="/app/home" replace />} />
          <Route path="home" element={<Home />} />
          <Route path="questions" element={<Questions />} />
          <Route path="flashcards" element={<Flashcards />} />
          <Route path="subjects" element={<Subjects />} />
          <Route path="leaderboard" element={<Leaderboard />} />
          <Route path="profile" element={<Profile />} />
          <Route path="admin" element={<Admin />} />
        </Route>

        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  );
}

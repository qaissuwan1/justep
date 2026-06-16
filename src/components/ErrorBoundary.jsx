// Top-level error boundary: catches render/runtime errors anywhere below it so
// a single crashing component shows a clean fallback instead of a white screen.
import { Component } from "react";
import { colors, gradients, font } from "../theme";

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    // Surface the error for debugging; swap for a logging service in production.
    console.error("Uncaught error:", error, info);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

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
          padding: "40px 24px",
          textAlign: "center",
          color: colors.text,
        }}
      >
        <div style={{ fontSize: 48, marginBottom: 12 }}>⚠️</div>
        <h1 style={{ fontSize: 24, fontWeight: 800, margin: "0 0 8px", color: colors.navy }}>Something went wrong</h1>
        <p style={{ fontSize: 15, color: colors.textSoft, margin: "0 0 24px", maxWidth: 380, lineHeight: 1.6 }}>
          An unexpected error occurred. Reloading the page usually fixes it.
        </p>
        <button
          onClick={() => window.location.reload()}
          style={{
            background: gradients.accent,
            color: "#fff",
            border: "none",
            borderRadius: 12,
            padding: "12px 28px",
            fontSize: 15,
            fontWeight: 700,
            cursor: "pointer",
            fontFamily: font,
            boxShadow: "0 4px 16px rgba(79,142,247,0.35)",
          }}
        >
          Reload page
        </button>
      </div>
    );
  }
}

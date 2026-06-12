// Small reusable UI primitives shared across pages.
import { colors, card, gradients, font, labelStyle } from "../theme";

export function Card({ children, style, ...rest }) {
  return (
    <div style={{ ...card, ...style }} {...rest}>
      {children}
    </div>
  );
}

export function SectionTitle({ children, action }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
      <div style={{ fontSize: 15, fontWeight: 700, color: colors.text }}>{children}</div>
      {action}
    </div>
  );
}

export function Label({ children, style }) {
  return <div style={{ ...labelStyle, ...style }}>{children}</div>;
}

export function Pill({ children, color = colors.blue, bg }) {
  return (
    <span
      style={{
        fontSize: 12,
        fontWeight: 700,
        color,
        background: bg || "rgba(79,142,247,0.12)",
        padding: "4px 10px",
        borderRadius: 999,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
}

export function ProgressBar({ value, color = colors.blue, height = 7 }) {
  return (
    <div style={{ background: "#F1F5F9", borderRadius: 999, height }}>
      <div
        style={{
          width: `${value}%`,
          height: "100%",
          background: color,
          borderRadius: 999,
          transition: "width 0.8s ease",
        }}
      />
    </div>
  );
}

export function PageHeader({ title, subtitle, right }) {
  return (
    <div style={{ marginBottom: 28, display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, flexWrap: "wrap" }}>
      <div>
        <h1 style={{ fontSize: 26, fontWeight: 800, margin: 0, letterSpacing: "-0.5px", color: colors.text }}>{title}</h1>
        {subtitle && <p style={{ margin: "4px 0 0", color: colors.textSoft, fontSize: 14 }}>{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}

export function PrimaryButton({ children, style, onClick, type = "button", full }) {
  return (
    <button
      type={type}
      onClick={onClick}
      style={{
        background: gradients.accent,
        color: "#fff",
        border: "none",
        borderRadius: 12,
        padding: "13px 28px",
        fontSize: 15,
        fontWeight: 700,
        cursor: "pointer",
        letterSpacing: "0.02em",
        boxShadow: "0 4px 16px rgba(79,142,247,0.35)",
        transition: "transform 0.15s, box-shadow 0.15s",
        fontFamily: font,
        width: full ? "100%" : undefined,
        ...style,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = "translateY(-2px)";
        e.currentTarget.style.boxShadow = "0 6px 20px rgba(79,142,247,0.45)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = "translateY(0)";
        e.currentTarget.style.boxShadow = "0 4px 16px rgba(79,142,247,0.35)";
      }}
    >
      {children}
    </button>
  );
}

export function StatCard({ label, value, sub, accent = colors.blue, icon }) {
  return (
    <Card style={{ padding: "20px 22px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <Label>{label}</Label>
        {icon && <span style={{ fontSize: 18 }}>{icon}</span>}
      </div>
      <div style={{ fontSize: 30, fontWeight: 800, margin: "8px 0 2px", color: accent }}>{value}</div>
      {sub && <div style={{ fontSize: 13, color: colors.textSoft }}>{sub}</div>}
    </Card>
  );
}

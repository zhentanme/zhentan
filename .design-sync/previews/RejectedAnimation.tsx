import { RejectedAnimation } from "zhentan-client";

function Frame({ children }: { children: React.ReactNode }) {
  if (typeof document !== "undefined") {
    document.documentElement.classList.add("dark");
    document.body.style.background = "#0a0d0e";
    document.body.style.margin = "0";
  }
  return (
    <div style={{ background: "#0a0d0e", padding: 32, display: "flex", flexDirection: "column", alignItems: "center", gap: 14, fontFamily: "var(--font-manrope)", color: "var(--ink-0)" }}>
      {children}
    </div>
  );
}

export function Rejected() {
  return (
    <Frame>
      <RejectedAnimation size={96} loop />
      <span className="text-sm font-semibold text-danger">Rejected</span>
    </Frame>
  );
}

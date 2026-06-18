import { StatusBadge } from "zhentan-client";

function Frame({ children }: { children: React.ReactNode }) {
  if (typeof document !== "undefined") {
    document.documentElement.classList.add("dark");
    document.body.style.background = "#0a0d0e";
    document.body.style.margin = "0";
  }
  return (
    <div style={{ background: "#0a0d0e", padding: 28, fontFamily: "var(--font-manrope)", color: "var(--ink-0)" }}>
      {children}
    </div>
  );
}

export function AllStates() {
  return (
    <Frame>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <StatusBadge status="pending" />
        <StatusBadge status="in_review" />
        <StatusBadge status="executed" />
        <StatusBadge status="rejected" />
      </div>
    </Frame>
  );
}

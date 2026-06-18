import { Button } from "zhentan-client";

function Frame({ children, pad = 28 }: { children: React.ReactNode; pad?: number }) {
  if (typeof document !== "undefined") {
    document.documentElement.classList.add("dark");
    document.body.style.background = "#0a0d0e";
    document.body.style.margin = "0";
  }
  return (
    <div style={{ background: "#0a0d0e", padding: pad, fontFamily: "var(--font-manrope)", color: "var(--ink-0)" }}>
      {children}
    </div>
  );
}

export function Variants() {
  return (
    <Frame>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        <Button variant="primary">Send</Button>
        <Button variant="secondary">Receive</Button>
        <Button variant="ghost">Cancel</Button>
      </div>
    </Frame>
  );
}

export function Loading() {
  return (
    <Frame>
      <Button variant="primary" loading>Confirming…</Button>
    </Frame>
  );
}

export function Disabled() {
  return (
    <Frame>
      <div style={{ display: "flex", gap: 12 }}>
        <Button variant="primary" disabled>Unavailable</Button>
        <Button variant="secondary" disabled>Disabled</Button>
      </div>
    </Frame>
  );
}

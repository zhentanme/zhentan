import { Spinner } from "zhentan-client";

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

export function Default() {
  return (
    <Frame>
      <Spinner />
    </Frame>
  );
}

export function Sizes() {
  return (
    <Frame>
      <div style={{ display: "flex", gap: 20, alignItems: "center" }}>
        <Spinner size={16} />
        <Spinner size={24} />
        <Spinner size={40} />
      </div>
    </Frame>
  );
}

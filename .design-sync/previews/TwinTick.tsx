import { TwinTick, BrandMarkSprite } from "zhentan-client";

function Frame({ children }: { children: React.ReactNode }) {
  if (typeof document !== "undefined") {
    document.documentElement.classList.add("dark");
    document.body.style.background = "#0a0d0e";
    document.body.style.margin = "0";
  }
  return (
    <div style={{ background: "#0a0d0e", padding: 32, fontFamily: "var(--font-manrope)", color: "var(--ink-0)" }}>
      {/* sprite defines the gold gradient the mark fills with */}
      <BrandMarkSprite />
      {children}
    </div>
  );
}

export function Mark() {
  return (
    <Frame>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <TwinTick size={56} halo="#0a0d0e" />
        <span style={{ fontWeight: 700, fontSize: 24, letterSpacing: "-0.01em" }}>Zhentan</span>
      </div>
    </Frame>
  );
}

export function Sizes() {
  return (
    <Frame>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 18 }}>
        <TwinTick size={24} halo="#0a0d0e" />
        <TwinTick size={40} halo="#0a0d0e" />
        <TwinTick size={64} halo="#0a0d0e" />
      </div>
    </Frame>
  );
}

import { BrandMarkSprite, TwinTick } from "zhentan-client";

// BrandMarkSprite renders no visible UI — it injects the shared gold gradient
// (#ztgb) that every TwinTick fills with. Render it once near the document root.
function Frame({ children }: { children: React.ReactNode }) {
  if (typeof document !== "undefined") {
    document.documentElement.classList.add("dark");
    document.body.style.background = "#0a0d0e";
    document.body.style.margin = "0";
  }
  return (
    <div style={{ background: "#0a0d0e", padding: 32, fontFamily: "var(--font-manrope)", color: "var(--ink-0)" }}>
      {children}
    </div>
  );
}

export function GradientSource() {
  return (
    <Frame>
      <BrandMarkSprite />
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <p className="eyebrow text-muted-foreground">Renders no UI · powers the gold gradient</p>
        <TwinTick size={48} halo="#0a0d0e" />
      </div>
    </Frame>
  );
}

import { Card } from "zhentan-client";

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

export function BalanceCard() {
  return (
    <Frame>
      <Card className="p-5" >
        <p className="eyebrow text-muted-foreground">Portfolio</p>
        <p className="mt-2 text-3xl font-mono font-semibold gradient-text tracking-tight tabular-nums">$12,480.55</p>
        <p className="mt-1 text-xs text-muted-foreground">Across 4 assets on BNB Chain</p>
      </Card>
    </Frame>
  );
}

export function Plain() {
  return (
    <Frame>
      <Card className="p-5">
        <h3 className="text-sm font-semibold text-foreground">Screening active</h3>
        <p className="mt-1 text-xs text-muted-foreground">
          The agent reviews each signature against your patterns before co-signing.
        </p>
      </Card>
    </Frame>
  );
}

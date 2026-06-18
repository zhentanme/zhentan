import { Skeleton } from "zhentan-client";

function Frame({ children }: { children: React.ReactNode }) {
  if (typeof document !== "undefined") {
    document.documentElement.classList.add("dark");
    document.body.style.background = "#0a0d0e";
    document.body.style.margin = "0";
  }
  return (
    <div style={{ background: "#0a0d0e", padding: 28, fontFamily: "var(--font-manrope)", color: "var(--ink-0)", maxWidth: 360 }}>
      {children}
    </div>
  );
}

export function Lines() {
  return (
    <Frame>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-2/3" />
      </div>
    </Frame>
  );
}

export function TokenRow() {
  return (
    <Frame>
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <Skeleton className="h-10 w-10 rounded-pill" />
        <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: 1 }}>
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-3 w-32" />
        </div>
        <Skeleton className="h-5 w-16" />
      </div>
    </Frame>
  );
}

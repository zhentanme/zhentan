import { Dialog, Button } from "zhentan-client";

// Dialog portals into document.body, so push the dark scope to <html> (not just
// a wrapper) — otherwise the portaled panel renders with light tokens.
function ensureDark() {
  if (typeof document !== "undefined") {
    document.documentElement.classList.add("dark");
    document.body.style.background = "#0a0d0e";
    document.body.style.margin = "0";
  }
}

export function SendDialog() {
  ensureDark();
  return (
    <Dialog open onClose={() => {}} title="Send crypto">
      <div className="space-y-4" style={{ fontFamily: "var(--font-manrope)" }}>
        <p className="text-sm text-muted-foreground">
          Confirm this transfer. The agent screens it before co-signing.
        </p>
        <div className="flex items-center justify-between rounded-md bg-foreground/6 p-4">
          <span className="text-base font-semibold text-foreground">120.00 USDC</span>
          <span className="font-mono text-xs text-muted-foreground">to 0x9f…3a21</span>
        </div>
        <Button variant="primary" className="w-full">Confirm</Button>
      </div>
    </Dialog>
  );
}

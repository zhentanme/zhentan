import { Input } from "zhentan-client";

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

export function WithLabel() {
  return (
    <Frame>
      <Input label="Recipient" placeholder="0x… or name.bnb" />
    </Frame>
  );
}

export function WithSuffix() {
  return (
    <Frame>
      <Input label="Amount" placeholder="0.00" suffix={<span className="font-mono">USDC</span>} />
    </Frame>
  );
}

export function Plain() {
  return (
    <Frame>
      <Input placeholder="Search assets" />
    </Frame>
  );
}

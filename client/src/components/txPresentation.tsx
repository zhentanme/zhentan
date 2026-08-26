import Image from "next/image";
import {
  ArrowUpRight,
  ArrowDownLeft,
  Repeat2,
  Shield,
  ShieldCheck,
  ShieldOff,
  Zap,
  ArrowDownToLine,
  ArrowUpFromLine,
  Wallet,
  Settings2,
  KeyRound,
  RefreshCw,
  Users,
  type LucideIcon,
} from "lucide-react";
import type { TransactionWithStatus } from "@/types";
import type { RiskSeverity } from "@/lib/format";

/* ── Operation presentation — the ONE map shared by the activity row and the
   detail dialog, so a transaction never changes look between the two.
   Outflows use the neutral foreground: `danger` is reserved for risk. ── */

export interface OpConfig {
  Icon: LucideIcon;
  label: string;
  /** "+", "-", or "" for no sign */
  sign: "+" | "-" | "";
  /** Tailwind color class for the inline icon */
  iconColor: string;
}

export const OP_CONFIG: Record<string, OpConfig> = {
  receive:  { Icon: ArrowDownLeft,   label: "Receive",  sign: "+", iconColor: "text-safe" },
  send:     { Icon: ArrowUpRight,    label: "Send",     sign: "-", iconColor: "text-muted-foreground" },
  trade:    { Icon: Repeat2,         label: "Trade",    sign: "+", iconColor: "text-muted-foreground" },
  approve:  { Icon: ShieldCheck,     label: "Approve",  sign: "",  iconColor: "text-gold" },
  execute:  { Icon: Zap,             label: "Execute",  sign: "",  iconColor: "text-gold" },
  deposit:  { Icon: ArrowDownToLine, label: "Deposit",  sign: "-", iconColor: "text-muted-foreground" },
  withdraw: { Icon: ArrowUpFromLine, label: "Withdraw", sign: "+", iconColor: "text-safe" },
  borrow:   { Icon: ArrowDownLeft,   label: "Borrow",   sign: "+", iconColor: "text-safe" },
  repay:    { Icon: ArrowUpRight,    label: "Repay",    sign: "-", iconColor: "text-muted-foreground" },
  mint:     { Icon: ArrowDownLeft,   label: "Mint",     sign: "+", iconColor: "text-safe" },
  burn:     { Icon: ArrowUpRight,    label: "Burn",     sign: "-", iconColor: "text-muted-foreground" },
};

export const FALLBACK_CONFIG: OpConfig = {
  Icon: ArrowUpRight, label: "Transaction", sign: "", iconColor: "text-muted-foreground",
};

/* ── Wallet events (txKind rows) — one icon + explainer per server label.
   The label strings are the server's contract (server/src/lib/safe/txKind.ts);
   unknown labels fall back by kind. ── */

export const KIND_ICONS: Record<string, LucideIcon> = {
  "Safe account created": Wallet,
  "Protection activated": ShieldCheck,
  "Screening agent enabled": ShieldCheck,
  "Backup key added": KeyRound,
  "Backup key changed": RefreshCw,
  "Screening agent removed": ShieldOff,
  "Owners changed": Users,
  "Wallet configuration": Settings2,
};

export const KIND_DESCRIPTIONS: Record<string, string> = {
  "Safe account created": "Deployed on-chain at its permanent address",
  "Protection activated": "Backup key and agent added as owners",
  "Screening agent enabled": "The agent was added as an owner. Screening is on",
  "Backup key added": "A key you control was added as an owner",
  "Backup key changed": "Backup key replaced. Same address",
  "Screening agent removed": "Agent removed. Stock Safe from here on",
  "Owners changed": "The wallet's owner set changed",
  "Wallet configuration": "Configuration call. No funds moved",
};

export function getOpConfig(tx: TransactionWithStatus): OpConfig & { description?: string } {
  if (tx.txKind) {
    const label =
      tx.kindLabel ?? (tx.txKind === "creation" ? "Safe account created" : "Wallet configuration");
    return {
      Icon: KIND_ICONS[label] ?? (tx.txKind === "creation" ? Wallet : Settings2),
      label,
      sign: "",
      iconColor: "text-gold",
      description: KIND_DESCRIPTIONS[label],
    };
  }
  const op = tx.operationType ?? (tx.direction === "receive" ? "receive" : "send");
  return OP_CONFIG[op] ?? FALLBACK_CONFIG;
}

/* ── Shared helpers ── */

export function formatUsd(n?: number): string {
  if (!n || n === 0) return "";
  if (n < 0.01) return `$${n.toPrecision(3)}`;
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;
}

/** Static class pairs for risk severities (Tailwind needs literal class names). */
export const SEVERITY_CLASSES: Record<RiskSeverity, { text: string; bg: string }> = {
  safe: { text: "text-safe", bg: "bg-safe" },
  watch: { text: "text-watch", bg: "bg-watch" },
  danger: { text: "text-danger", bg: "bg-danger" },
};

/* Full-width link-buttons used at the foot of transaction dialogs. */
export const LINK_BUTTON_GOLD =
  "flex items-center justify-center gap-2 w-full rounded-md py-3 border border-gold/30 text-gold hover:bg-gold/10 transition-colors text-sm font-semibold cursor-pointer";
export const LINK_BUTTON_NEUTRAL =
  "flex items-center justify-center gap-2 w-full rounded-md py-3 bg-foreground/8 text-foreground/80 hover:text-foreground hover:bg-foreground/12 transition-colors text-sm font-semibold cursor-pointer";

/** Gold shield note used above approve/reject actions (WalletConnect flows). */
export function ScreeningNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 rounded-md bg-gold/[0.08] border border-gold/20 px-4 py-3 w-full">
      <Shield className="h-5 w-5 text-gold shrink-0 mt-0.5" aria-hidden />
      <p className="text-xs text-foreground/80 leading-relaxed">{children}</p>
    </div>
  );
}

export function TokenAvatar({
  iconUrl,
  symbol,
  size = 40,
}: {
  iconUrl?: string | null;
  symbol?: string;
  size?: number;
}) {
  if (iconUrl) {
    return (
      <Image
        src={iconUrl}
        alt=""
        width={size}
        height={size}
        className="object-cover w-full h-full"
        unoptimized
      />
    );
  }
  return (
    <span className="text-[11px] font-bold text-muted-foreground leading-none">
      {(symbol || "?").slice(0, 4)}
    </span>
  );
}

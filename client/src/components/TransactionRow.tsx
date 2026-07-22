"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import type { TransactionWithStatus } from "@/types";
import { truncateAddress, formatTokenAmount, timeAgo } from "@/lib/format";
import { StatusBadge } from "./StatusBadge";
import {
  ArrowUpRight,
  ArrowDownLeft,
  Repeat2,
  ShieldCheck,
  Sparkles,
  Settings2,
  Zap,
  ArrowDownToLine,
  ArrowUpFromLine,
  type LucideIcon,
} from "lucide-react";

// ── Operation config ─────────────────────────────────────────────────────────

interface OpConfig {
  Icon: LucideIcon;
  label: string;
  /** "+", "-", or "" for no sign */
  sign: "+" | "-" | "";
  /** Tailwind color class for the inline icon */
  iconColor: string;
}

const OP_CONFIG: Record<string, OpConfig> = {
  receive:  { Icon: ArrowDownLeft,   label: "Receive",  sign: "+", iconColor: "text-safe"   },
  send:     { Icon: ArrowUpRight,    label: "Send",     sign: "-", iconColor: "text-danger" },
  trade:    { Icon: Repeat2,         label: "Trade",    sign: "+", iconColor: "text-watch"  },
  approve:  { Icon: ShieldCheck,     label: "Approve",  sign: "",  iconColor: "text-gold"   },
  execute:  { Icon: Zap,             label: "Execute",  sign: "",  iconColor: "text-gold"   },
  deposit:  { Icon: ArrowDownToLine, label: "Deposit",  sign: "-", iconColor: "text-danger" },
  withdraw: { Icon: ArrowUpFromLine, label: "Withdraw", sign: "+", iconColor: "text-safe"   },
  borrow:   { Icon: ArrowDownLeft,   label: "Borrow",   sign: "+", iconColor: "text-safe"   },
  repay:    { Icon: ArrowUpRight,    label: "Repay",    sign: "-", iconColor: "text-danger" },
  mint:     { Icon: ArrowDownLeft,   label: "Mint",     sign: "+", iconColor: "text-safe"   },
  burn:     { Icon: ArrowUpRight,    label: "Burn",     sign: "-", iconColor: "text-danger" },
};

const FALLBACK_CONFIG: OpConfig = {
  Icon: ArrowUpRight, label: "Transaction", sign: "", iconColor: "text-muted-foreground",
};

function getConfig(tx: TransactionWithStatus): OpConfig {
  // Wallet events (Safe creation, owner/config transitions) — not transfers.
  if (tx.txKind) {
    return {
      Icon: tx.txKind === "creation" ? Sparkles : Settings2,
      label:
        tx.kindLabel ?? (tx.txKind === "creation" ? "Safe account created" : "Wallet configuration"),
      sign: "",
      iconColor: "text-gold",
    };
  }
  const op = tx.operationType ?? (tx.direction === "receive" ? "receive" : "send");
  return OP_CONFIG[op] ?? FALLBACK_CONFIG;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatUsd(n?: number): string {
  if (!n || n === 0) return "";
  if (n < 0.01) return `$${n.toPrecision(3)}`;
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function TokenAvatar({ iconUrl, symbol }: { iconUrl?: string | null; symbol?: string }) {
  if (iconUrl) {
    return (
      <Image
        src={iconUrl}
        alt=""
        width={40}
        height={40}
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

interface AmountProps {
  tx: TransactionWithStatus;
  config: OpConfig;
}

function AmountDisplay({ tx, config }: AmountProps) {
  const { sign } = config;
  const op = tx.operationType ?? (tx.direction === "receive" ? "receive" : "send");

  // Approve — show "Unlimited TOKEN" or the amount
  if (op === "approve") {
    return (
      <p className="text-sm font-mono font-semibold text-foreground tabular-nums text-right">
        {tx.amount ? `${formatTokenAmount(tx.amount)} ${tx.token}` : `Unlimited${tx.token ? ` ${tx.token}` : ""}`}
      </p>
    );
  }

  // Execute — no token amount usually
  if (op === "execute" && !tx.amount) {
    return null;
  }

  const isPositive = sign === "+";

  // Trade — show received on top (green), sent below (gray)
  if (op === "trade" && tx.tradeReceived) {
    return (
      <div className="text-right tabular-nums font-mono">
        <p className="text-sm font-semibold text-safe">
          +{formatTokenAmount(tx.tradeReceived.amount)} {tx.tradeReceived.symbol}
        </p>
        {tx.amount && tx.token && (
          <p className="text-xs text-muted-foreground/80 mt-0.5">
            -{formatTokenAmount(tx.amount)} {tx.token}
          </p>
        )}
      </div>
    );
  }

  // Standard amount line
  const usd = formatUsd(tx.valueUSD);
  return (
    <div className="text-right tabular-nums font-mono">
      <p className={`text-sm font-semibold ${isPositive ? "text-safe" : "text-foreground"}`}>
        {sign}{formatTokenAmount(tx.amount)} {tx.token}
      </p>
      {usd && <p className="text-xs text-muted-foreground/80 mt-0.5">{usd}</p>}
    </div>
  );
}

// ── Row ───────────────────────────────────────────────────────────────────────

interface TransactionRowProps {
  tx: TransactionWithStatus;
  index?: number;
  onClick?: () => void;
}

export function TransactionRow({ tx, index = 0, onClick }: TransactionRowProps) {
  const config = getConfig(tx);
  const { Icon, label, iconColor } = config;
  const time = timeAgo(tx.proposedAt);

  // Counterparty address — skip for ops where it's not meaningful, and for
  // wallet events (the "counterparty" is the Safe itself).
  const op = tx.operationType ?? (tx.direction === "receive" ? "receive" : "send");
  const showAddress = !tx.txKind && !!tx.to && op !== "execute" && op !== "approve";
  const addressPrefix = tx.direction === "receive" ? "from" : "to";

  return (
    <motion.div
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={onClick ? (e) => e.key === "Enter" && onClick() : undefined}
      className={`flex items-center gap-3 px-4 sm:px-6 py-4 transition-colors hover:bg-foreground/3 ${
        onClick ? "cursor-pointer active:bg-foreground/4" : ""
      } ${tx.status === "rejected" ? "opacity-55" : ""} touch-manipulation`}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04, duration: 0.3, type: "spring", bounce: 0.1 }}
    >
      {/* Avatar: token for transfers, gold event tile for wallet events */}
      {tx.txKind ? (
        <div className="w-10 h-10 rounded-full bg-gold/10 flex items-center justify-center shrink-0">
          <Icon className="h-5 w-5 text-gold" />
        </div>
      ) : (
        <div className="w-10 h-10 rounded-full bg-foreground/8 flex items-center justify-center shrink-0 overflow-hidden">
          <TokenAvatar iconUrl={tx.tokenIconUrl} symbol={tx.token} />
        </div>
      )}

      {/* Middle: label + time / address */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <Icon className={`h-3.5 w-3.5 shrink-0 ${iconColor}`} />
          <span className="text-sm font-semibold text-foreground">{label}</span>
          {tx.source !== "zhentan-only" || tx.status === "executed" ? (
            <span className="ml-1 text-xs text-muted-foreground/80 shrink-0">{time}</span>
          ) : null}
          {/* Status badge for in_review / rejected — inline after time */}
          {tx.source !== "zerion-only" && (tx.status === "in_review" || tx.status === "rejected") && (
            <StatusBadge status={tx.status} />
          )}
        </div>
        {showAddress && (
          <p className="text-xs text-muted-foreground/80 mt-0.5 pl-5">
            {addressPrefix} {truncateAddress(tx.to)}
          </p>
        )}
        {tx.dappMetadata && (
          <p className="text-xs text-muted-foreground/80 mt-0.5 pl-5 truncate">
            {tx.dappMetadata.name}
          </p>
        )}
      </div>

      {/* Right: amount + USD (wallet events move no funds) */}
      {!tx.txKind && <AmountDisplay tx={tx} config={config} />}
    </motion.div>
  );
}

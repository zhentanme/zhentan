"use client";

import { useState } from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import type { TransactionWithStatus } from "@/types";
import { useLiveTransaction } from "@/hooks/useLiveTransaction";
import { useAuth } from "@/app/context/AuthContext";
import { truncateAddress, formatDate, statusLabel, formatTokenAmount } from "@/lib/format";
import { Dialog } from "./ui/Dialog";
import { ExecutedAnimation, ReviewAnimation, RejectedAnimation } from "./animations/StatusAnimation";
import {
  ArrowUpRight,
  ArrowDownLeft,
  Repeat2,
  ShieldCheck,
  Zap,
  ArrowDownToLine,
  ArrowUpFromLine,
  Clock,
  Search,
  XCircle,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  ShieldAlert,
  type LucideIcon,
} from "lucide-react";
import { BSC_EXPLORER_URL } from "@/lib/constants";

// ── Operation config (mirrors TransactionRow) ─────────────────────────────────

interface OpConfig {
  Icon: LucideIcon;
  label: string;
  sign: "+" | "-" | "";
  iconColor: string;
}

const OP_CONFIG: Record<string, OpConfig> = {
  receive:  { Icon: ArrowDownLeft,   label: "Receive",  sign: "+", iconColor: "text-safe" },
  send:     { Icon: ArrowUpRight,    label: "Send",     sign: "-", iconColor: "text-muted-foreground"   },
  trade:    { Icon: Repeat2,         label: "Trade",    sign: "+", iconColor: "text-muted-foreground"  },
  approve:  { Icon: ShieldCheck,     label: "Approve",  sign: "",  iconColor: "text-gold"        },
  execute:  { Icon: Zap,             label: "Execute",  sign: "",  iconColor: "text-gold"        },
  deposit:  { Icon: ArrowDownToLine, label: "Deposit",  sign: "-", iconColor: "text-muted-foreground"   },
  withdraw: { Icon: ArrowUpFromLine, label: "Withdraw", sign: "+", iconColor: "text-safe" },
  borrow:   { Icon: ArrowDownLeft,   label: "Borrow",   sign: "+", iconColor: "text-safe" },
  repay:    { Icon: ArrowUpRight,    label: "Repay",    sign: "-", iconColor: "text-muted-foreground"   },
  mint:     { Icon: ArrowDownLeft,   label: "Mint",     sign: "+", iconColor: "text-safe" },
  burn:     { Icon: ArrowUpRight,    label: "Burn",     sign: "-", iconColor: "text-muted-foreground"   },
};

const FALLBACK_CONFIG: OpConfig = {
  Icon: ArrowUpRight, label: "Transaction", sign: "", iconColor: "text-muted-foreground",
};

function getConfig(tx: TransactionWithStatus): OpConfig {
  const op = tx.operationType ?? (tx.direction === "receive" ? "receive" : "send");
  return OP_CONFIG[op] ?? FALLBACK_CONFIG;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatUsd(n?: number): string {
  if (!n || n === 0) return "";
  if (n < 0.01) return `$${n.toPrecision(3)}`;
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function TokenAvatar({ iconUrl, symbol, size = 40 }: { iconUrl?: string | null; symbol?: string; size?: number }) {
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

// ── Hero amount card ──────────────────────────────────────────────────────────

function HeroAmount({ tx, config }: { tx: TransactionWithStatus; config: OpConfig }) {
  const { Icon, label, sign, iconColor } = config;
  const op = tx.operationType ?? (tx.direction === "receive" ? "receive" : "send");
  const usd = formatUsd(tx.valueUSD);

  // Trade: dual-token layout — [sent] → [received]
  if (op === "trade" && tx.tradeReceived) {
    return (
      <div className="rounded-2xl bg-foreground/6 p-4">
        {/* Op label */}
        <div className={`flex items-center gap-1.5 mb-3 ${iconColor}`}>
          <Icon className="h-4 w-4" />
          <span className="text-xs font-semibold uppercase tracking-wide">{label}</span>
        </div>
        {/* Token pair row */}
        <div className="flex items-center gap-3">
          {/* Sent side */}
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div className="w-10 h-10 rounded-full bg-foreground/8 flex items-center justify-center shrink-0 overflow-hidden">
              <TokenAvatar iconUrl={tx.tokenIconUrl} symbol={tx.token} size={40} />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground truncate">
                -{formatTokenAmount(tx.amount)} {tx.token}
              </p>
              {usd && <p className="text-xs text-muted-foreground/80 mt-0.5">{usd}</p>}
            </div>
          </div>
          {/* Arrow */}
          <ArrowUpRight className="h-4 w-4 text-muted-foreground/80 shrink-0 rotate-45" />
          {/* Received side */}
          <div className="flex items-center gap-2 flex-1 min-w-0 justify-end">
            <div className="min-w-0 text-right">
              <p className="text-sm font-semibold text-safe truncate">
                +{formatTokenAmount(tx.tradeReceived.amount)} {tx.tradeReceived.symbol}
              </p>
              {usd && <p className="text-xs text-muted-foreground/80 mt-0.5">{usd}</p>}
            </div>
            <div className="w-10 h-10 rounded-full bg-foreground/8 flex items-center justify-center shrink-0 overflow-hidden">
              <TokenAvatar iconUrl={tx.tradeReceived.iconUrl} symbol={tx.tradeReceived.symbol} size={40} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Standard layout: [op icon] [token avatar] [amount]
  return (
    <div className="rounded-2xl bg-foreground/6 p-4 flex items-center gap-3">
      {/* Op icon */}
      <div className={`w-10 h-10 rounded-2xl bg-foreground/[0.08] flex items-center justify-center shrink-0 ${iconColor}`}>
        <Icon className="h-5 w-5" />
      </div>

      {/* Token avatar */}
      <div className="w-9 h-9 rounded-full bg-foreground/8 flex items-center justify-center shrink-0 overflow-hidden">
        <TokenAvatar iconUrl={tx.tokenIconUrl} symbol={tx.token} size={36} />
      </div>

      {/* Amount */}
      <div className="flex-1 min-w-0">
        {op === "approve" ? (
          <p className="text-base font-semibold text-foreground">
            {tx.amount ? `${formatTokenAmount(tx.amount)} ${tx.token}` : `Unlimited${tx.token ? ` ${tx.token}` : ""}`}
          </p>
        ) : op === "execute" && !tx.amount ? (
          <p className="text-base font-semibold text-foreground/80">{label}</p>
        ) : (
          <>
            <p className={`text-base font-semibold ${sign === "+" ? "text-safe" : "text-foreground"}`}>
              {sign}{formatTokenAmount(tx.amount)} {tx.token}
            </p>
            {usd && <p className="text-xs text-muted-foreground/80 mt-0.5">{usd}</p>}
          </>
        )}
      </div>
    </div>
  );
}

// ── Risk section ──────────────────────────────────────────────────────────────

/** Severity bucket → tailwind text/bg classes. */
function severity(score: number): { tone: "safe" | "watch" | "danger"; text: string; bg: string } {
  if (score >= 70) return { tone: "danger", text: "text-danger", bg: "bg-danger" };
  if (score >= 40) return { tone: "watch", text: "text-watch", bg: "bg-watch" };
  return { tone: "safe", text: "text-safe", bg: "bg-safe" };
}

function RiskDetailsSection({
  riskScore,
  riskVerdict,
  riskReasons,
  reviewReason,
  rejectReason,
}: {
  riskScore?: number;
  riskVerdict?: "APPROVE" | "REVIEW" | "BLOCK";
  riskReasons?: string[];
  reviewReason?: string;
  rejectReason?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const sev = riskScore != null ? severity(riskScore) : null;

  return (
    <div className="rounded-2xl bg-foreground/6 overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        aria-expanded={expanded}
        className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-foreground/6 transition-colors cursor-pointer"
      >
        <ShieldAlert className="h-4 w-4 text-watch/90 shrink-0" />
        <span className="text-sm font-medium text-foreground flex-1">View analysis</span>
        {sev && (
          <span className={`font-mono text-xs font-semibold ${sev.text}`}>
            {riskScore}
            <span className="text-muted-foreground/60">/100</span>
          </span>
        )}
        {expanded ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground/80 shrink-0" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground/80 shrink-0" />
        )}
      </button>
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="border-t border-foreground/10"
          >
            <div className="px-4 py-3.5 space-y-3.5 text-sm">
              {/* Risk score + bar */}
              {riskScore != null && sev && (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-muted-foreground/80">Risk score</span>
                    <span className={`font-mono font-semibold ${sev.text}`}>
                      {riskScore}
                      <span className="text-muted-foreground/60">/100</span>
                    </span>
                  </div>
                  <div className="h-1.5 rounded-pill bg-foreground/10 overflow-hidden">
                    <motion.span
                      className={`block h-full rounded-pill ${sev.bg}`}
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.min(100, Math.max(0, riskScore))}%` }}
                      transition={{ duration: 0.5, ease: "easeOut" }}
                    />
                  </div>
                </div>
              )}

              {/* Verdict */}
              {riskVerdict && (
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground/80">Verdict</span>
                  <span
                    className={`font-mono uppercase tracking-wide text-xs font-semibold ${
                      riskVerdict === "APPROVE"
                        ? "text-safe"
                        : riskVerdict === "BLOCK"
                          ? "text-danger"
                          : "text-watch"
                    }`}
                  >
                    {riskVerdict}
                  </span>
                </div>
              )}

              {/* Agent message */}
              {reviewReason && (
                <div>
                  <span className="text-muted-foreground/80 block mb-1">Message</span>
                  <p className="text-foreground/85 leading-relaxed">{reviewReason}</p>
                </div>
              )}

              {/* Rejection reason */}
              {rejectReason && (
                <div>
                  <span className="text-muted-foreground/80 block mb-1">Rejection reason</span>
                  <p className="text-danger leading-relaxed">{rejectReason}</p>
                </div>
              )}

              {/* Signals */}
              {riskReasons && riskReasons.length > 0 && (
                <div>
                  <span className="text-muted-foreground/80 block mb-1">Signals</span>
                  <ul className="list-disc list-inside space-y-0.5 text-foreground/80">
                    {riskReasons.map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Status animation ──────────────────────────────────────────────────────────

function StatusAnimation({ status }: { status: TransactionWithStatus["status"] }) {
  switch (status) {
    case "pending":
    case "in_review":
      return <ReviewAnimation size={80} />;
    case "executed":
      return <ExecutedAnimation size={80} />;
    case "rejected":
      return <RejectedAnimation size={80} />;
  }
}

// ── Main dialog ───────────────────────────────────────────────────────────────

interface TransactionDetailDialogProps {
  tx: TransactionWithStatus | null;
  open: boolean;
  onClose: () => void;
}

export function TransactionDetailDialog({ tx: txProp, open, onClose }: TransactionDetailDialogProps) {
  // While the dialog is open on a Zhentan tx, poll it live so a pending/in-review
  // item flips to executed/rejected in place (e.g. after a Telegram decision).
  // Zerion-only items are already terminal on-chain — nothing to poll.
  const live = useLiveTransaction(
    open && txProp && txProp.source !== "zerion-only" ? txProp.id : null
  );
  const { safeConfig } = useAuth();
  const overrideAvailable = safeConfig?.profile === "protected";

  if (!txProp) return null;

  // Freshest record wins; fall back to the passed-in copy before the first poll.
  const tx = live ?? txProp;

  const config = getConfig(tx);
  const op = tx.operationType ?? (tx.direction === "receive" ? "receive" : "send");
  const explorerTxUrl = tx.txHash ? `${BSC_EXPLORER_URL}/tx/${tx.txHash}` : null;

  // Whether this is a zhentan-tracked tx (has our metadata)
  const isZhentanTx = tx.source !== "zerion-only";
  // Whether counterparty address is meaningful for this op
  const showCounterparty = !!tx.to && op !== "execute" && op !== "approve";
  const counterpartyLabel =
    op === "receive" ? "From" : op === "send" ? "To" : "Interacted with";

  // Analysis section: any zhentan tx that carries screening data, regardless of
  // status — so executed / rejected decisions show their analysis too.
  const showRisk =
    isZhentanTx &&
    (tx.riskScore != null ||
      tx.riskVerdict != null ||
      (tx.riskReasons?.length ?? 0) > 0 ||
      !!tx.reviewReason ||
      !!tx.rejectReason);

  return (
    <Dialog open={open} onClose={onClose} title="Transaction details" className="max-w-md">
      <div className="space-y-6">
        {/* Status animation — morphs in place when the live status changes */}
        <AnimatePresence mode="wait">
          <motion.div
            key={tx.status}
            className="flex flex-col items-center gap-3"
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.92 }}
            transition={{ duration: 0.28, ease: "easeOut" }}
          >
            <StatusAnimation status={tx.status} />
            <span
              className={`text-sm font-semibold ${
                tx.status === "executed"
                  ? "text-gold"
                  : tx.status === "rejected"
                    ? "text-danger"
                    : tx.status === "in_review"
                      ? "text-gold"
                      : "text-watch"
              }`}
            >
              {statusLabel(tx.status)}
            </span>
          </motion.div>
        </AnimatePresence>

        {/* Hero: op icon + token + amount(s) */}
        <HeroAmount tx={tx} config={config} />

        {/* Details list */}
        <dl className="space-y-3 text-sm min-w-0">
          {/* Counterparty */}
          {showCounterparty && (
            <div className="flex justify-between gap-2 sm:gap-4">
              <dt className="text-muted-foreground/80 shrink-0">{counterpartyLabel}</dt>
              <dd
                className="min-w-0 max-w-[50%] sm:max-w-[200px] truncate"
                title={tx.to}
              >
                <a
                  href={`${BSC_EXPLORER_URL}/address/${tx.to}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group inline-flex items-center gap-2 font-mono text-foreground hover:text-foreground transition-colors underline-offset-4 hover:underline truncate"
                >
                  <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground/80 group-hover:text-foreground" />
                  <span className="truncate">{truncateAddress(tx.to, 10)}</span>
                </a>
              </dd>
            </div>
          )}

          {/* Trade: explicit swap pair */}
          {op === "trade" && tx.tradeReceived && tx.amount && tx.token && (
            <div className="flex justify-between gap-2 sm:gap-4">
              <dt className="text-muted-foreground/80 shrink-0">Swapped</dt>
              <dd className="text-foreground/80 text-right">
                <span className="text-safe">+{formatTokenAmount(tx.tradeReceived.amount)} {tx.tradeReceived.symbol}</span>
                <span className="text-muted-foreground/80 mx-1.5">for</span>
                <span>{formatTokenAmount(tx.amount)} {tx.token}</span>
              </dd>
            </div>
          )}

          {/* DApp */}
          {tx.dappMetadata && (
            <div className="flex justify-between gap-2 sm:gap-4 items-center">
              <dt className="text-muted-foreground/80 shrink-0">DApp</dt>
              <dd className="flex items-center gap-2 min-w-0 max-w-[50%] sm:max-w-[200px]">
                {tx.dappMetadata.icons?.[0] && (
                  <img
                    src={tx.dappMetadata.icons[0]}
                    alt=""
                    className="w-5 h-5 rounded-md shrink-0 bg-foreground/10"
                  />
                )}
                <span className="text-foreground/80 truncate" title={tx.dappMetadata.url}>
                  {tx.dappMetadata.name}
                </span>
              </dd>
            </div>
          )}

          {/* USD value (zerion enriched) */}
          {tx.valueUSD != null && tx.valueUSD > 0 && (
            <div className="flex justify-between gap-2 sm:gap-4">
              <dt className="text-muted-foreground/80 shrink-0">Value</dt>
              <dd className="text-foreground/80">{formatUsd(tx.valueUSD)}</dd>
            </div>
          )}

          {/* Proposed — zhentan txs only */}
          {isZhentanTx && (
            <div className="flex justify-between gap-2 sm:gap-4">
              <dt className="text-muted-foreground/80 shrink-0">Proposed</dt>
              <dd className="text-foreground/80 truncate min-w-0">{formatDate(tx.proposedAt)}</dd>
            </div>
          )}

          {/* Signatures — zhentan txs only */}
          {isZhentanTx && (
            <div className="flex justify-between gap-2 sm:gap-4">
              <dt className="text-muted-foreground/80 shrink-0">Signatures</dt>
              <dd className="text-foreground/80">
                {tx.txHash ? tx.threshold : 1} of {tx.threshold}
              </dd>
            </div>
          )}

          {/* Executed at */}
          {tx.executedAt && (
            <div className="flex justify-between gap-2 sm:gap-4">
              <dt className="text-muted-foreground/80 shrink-0">Executed</dt>
              <dd className="text-foreground/80 truncate min-w-0">{formatDate(tx.executedAt)}</dd>
            </div>
          )}

        </dl>

        {/* Agent analysis — expandable: score, message, signals */}
        {showRisk && (
          <RiskDetailsSection
            riskScore={tx.riskScore}
            riskVerdict={tx.riskVerdict}
            riskReasons={tx.riskReasons}
            reviewReason={tx.reviewReason}
            rejectReason={tx.rejectReason}
          />
        )}

        {/* Override path: a flagged SafeTx already sits in the Safe app queue
            at 1 of 2 — the user can confirm with their backup key and execute
            there, going around the agent entirely. Only protected wallets
            have a backup key to sign with. */}
        {tx.txType === "safetx" && tx.status === "in_review" && !tx.txHash && overrideAvailable && (
          <motion.a
            href={`https://app.safe.global/transactions/queue?safe=bnb:${tx.safeAddress}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full rounded-2xl py-3 border border-gold/30 text-gold hover:bg-gold/10 transition-colors text-sm font-medium"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            Sign with your backup key at Safe
            <ExternalLink className="h-3.5 w-3.5 opacity-60" />
          </motion.a>
        )}

        {/* BSCScan explorer link */}
        {explorerTxUrl && (
          <motion.a
            href={explorerTxUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full rounded-2xl py-3 bg-foreground/8 text-foreground/80 hover:text-foreground hover:bg-foreground/12 transition-colors text-sm font-medium"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <span className="relative w-[18px] h-[18px] shrink-0">
              <Image src="/bscscan.png" alt="" fill className="object-contain rounded" sizes="18px" />
            </span>
            View on BSC Explorer
            <ExternalLink className="h-3.5 w-3.5 opacity-50" />
          </motion.a>
        )}
      </div>
    </Dialog>
  );
}

"use client";

import { useState } from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import type { TransactionWithStatus } from "@/types";
import { truncateAddress, formatDate, statusLabel, formatTokenAmount } from "@/lib/format";
import { Dialog } from "./ui/Dialog";
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
  receive:  { Icon: ArrowDownLeft,   label: "Receive",  sign: "+", iconColor: "text-emerald-400" },
  send:     { Icon: ArrowUpRight,    label: "Send",     sign: "-", iconColor: "text-slate-400"   },
  trade:    { Icon: Repeat2,         label: "Trade",    sign: "+", iconColor: "text-violet-400"  },
  approve:  { Icon: ShieldCheck,     label: "Approve",  sign: "",  iconColor: "text-gold"        },
  execute:  { Icon: Zap,             label: "Execute",  sign: "",  iconColor: "text-gold"        },
  deposit:  { Icon: ArrowDownToLine, label: "Deposit",  sign: "-", iconColor: "text-slate-400"   },
  withdraw: { Icon: ArrowUpFromLine, label: "Withdraw", sign: "+", iconColor: "text-emerald-400" },
  borrow:   { Icon: ArrowDownLeft,   label: "Borrow",   sign: "+", iconColor: "text-emerald-400" },
  repay:    { Icon: ArrowUpRight,    label: "Repay",    sign: "-", iconColor: "text-slate-400"   },
  mint:     { Icon: ArrowDownLeft,   label: "Mint",     sign: "+", iconColor: "text-emerald-400" },
  burn:     { Icon: ArrowUpRight,    label: "Burn",     sign: "-", iconColor: "text-slate-400"   },
};

const FALLBACK_CONFIG: OpConfig = {
  Icon: ArrowUpRight, label: "Transaction", sign: "", iconColor: "text-slate-400",
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
    <span className="text-[11px] font-bold text-slate-400 leading-none">
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
      <div className="rounded-2xl bg-white/6 p-4">
        {/* Op label */}
        <div className={`flex items-center gap-1.5 mb-3 ${iconColor}`}>
          <Icon className="h-4 w-4" />
          <span className="text-xs font-semibold uppercase tracking-wide">{label}</span>
        </div>
        {/* Token pair row */}
        <div className="flex items-center gap-3">
          {/* Sent side */}
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <div className="w-10 h-10 rounded-full bg-white/8 flex items-center justify-center shrink-0 overflow-hidden">
              <TokenAvatar iconUrl={tx.tokenIconUrl} symbol={tx.token} size={40} />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-white truncate">
                -{formatTokenAmount(tx.amount)} {tx.token}
              </p>
              {usd && <p className="text-xs text-slate-500 mt-0.5">{usd}</p>}
            </div>
          </div>
          {/* Arrow */}
          <ArrowUpRight className="h-4 w-4 text-slate-500 shrink-0 rotate-45" />
          {/* Received side */}
          <div className="flex items-center gap-2 flex-1 min-w-0 justify-end">
            <div className="min-w-0 text-right">
              <p className="text-sm font-semibold text-emerald-400 truncate">
                +{formatTokenAmount(tx.tradeReceived.amount)} {tx.tradeReceived.symbol}
              </p>
              {usd && <p className="text-xs text-slate-500 mt-0.5">{usd}</p>}
            </div>
            <div className="w-10 h-10 rounded-full bg-white/8 flex items-center justify-center shrink-0 overflow-hidden">
              <TokenAvatar iconUrl={tx.tradeReceived.iconUrl} symbol={tx.tradeReceived.symbol} size={40} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Standard layout: [op icon] [token avatar] [amount]
  return (
    <div className="rounded-2xl bg-white/6 p-4 flex items-center gap-3">
      {/* Op icon */}
      <div className={`w-10 h-10 rounded-2xl bg-white/[0.08] flex items-center justify-center shrink-0 ${iconColor}`}>
        <Icon className="h-5 w-5" />
      </div>

      {/* Token avatar */}
      <div className="w-9 h-9 rounded-full bg-white/8 flex items-center justify-center shrink-0 overflow-hidden">
        <TokenAvatar iconUrl={tx.tokenIconUrl} symbol={tx.token} size={36} />
      </div>

      {/* Amount */}
      <div className="flex-1 min-w-0">
        {op === "approve" ? (
          <p className="text-base font-semibold text-white">
            {tx.amount ? `${formatTokenAmount(tx.amount)} ${tx.token}` : `Unlimited${tx.token ? ` ${tx.token}` : ""}`}
          </p>
        ) : op === "execute" && !tx.amount ? (
          <p className="text-base font-semibold text-slate-300">{label}</p>
        ) : (
          <>
            <p className={`text-base font-semibold ${sign === "+" ? "text-emerald-400" : "text-white"}`}>
              {sign}{formatTokenAmount(tx.amount)} {tx.token}
            </p>
            {usd && <p className="text-xs text-slate-500 mt-0.5">{usd}</p>}
          </>
        )}
      </div>
    </div>
  );
}

// ── Risk section ──────────────────────────────────────────────────────────────

function RiskDetailsSection({
  riskScore,
  riskVerdict,
  riskReasons,
}: {
  riskScore?: number;
  riskVerdict?: "APPROVE" | "REVIEW" | "BLOCK";
  riskReasons?: string[];
}) {
  const [expanded, setExpanded] = useState(false);
  const reasonCount = riskReasons?.length ?? 0;
  const summary =
    riskScore != null
      ? reasonCount > 0
        ? `Risk: ${riskScore} — ${reasonCount} reason${reasonCount === 1 ? "" : "s"}`
        : `Risk score: ${riskScore}`
      : reasonCount > 0
        ? `${reasonCount} risk reason${reasonCount === 1 ? "" : "s"}`
        : "Risk details";

  return (
    <div className="rounded-2xl bg-white/6 overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-white/6 transition-colors cursor-pointer"
      >
        <ShieldAlert className="h-4 w-4 text-amber-400/90 shrink-0" />
        <span className="text-sm font-medium text-slate-200 flex-1">{summary}</span>
        {expanded ? (
          <ChevronUp className="h-4 w-4 text-slate-500 shrink-0" />
        ) : (
          <ChevronDown className="h-4 w-4 text-slate-500 shrink-0" />
        )}
      </button>
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="border-t border-white/10"
          >
            <div className="px-4 py-3 space-y-2 text-sm">
              {riskScore != null && (
                <div className="flex justify-between gap-2">
                  <span className="text-slate-500">Score</span>
                  <span className="text-slate-200 font-medium">{riskScore}/100</span>
                </div>
              )}
              {riskVerdict && (
                <div className="flex justify-between gap-2">
                  <span className="text-slate-500">Verdict</span>
                  <span
                    className={`font-medium ${
                      riskVerdict === "APPROVE"
                        ? "text-emerald-400"
                        : riskVerdict === "BLOCK"
                          ? "text-red-400"
                          : "text-amber-400"
                    }`}
                  >
                    {riskVerdict}
                  </span>
                </div>
              )}
              {riskReasons && riskReasons.length > 0 && (
                <div>
                  <span className="text-slate-500 block mb-1">Reasons</span>
                  <ul className="list-disc list-inside space-y-0.5 text-slate-300">
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
  const common = "rounded-2xl flex items-center justify-center";
  const size = "w-20 h-20";

  switch (status) {
    case "pending":
      return (
        <motion.div
          className={`${size} ${common} bg-amber-400/15 text-amber-400`}
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1, rotate: [0, 5, -5, 0] }}
          transition={{
            opacity: { duration: 0.3 },
            scale: { type: "spring", bounce: 0.4 },
            rotate: { repeat: Infinity, duration: 2, ease: "easeInOut" },
          }}
        >
          <Clock className="h-10 w-10" />
        </motion.div>
      );
    case "in_review":
      return (
        <motion.div
          className={`${size} ${common} bg-gold/15 text-gold`}
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: [1, 1.05, 1], opacity: 1 }}
          transition={{
            opacity: { duration: 0.3 },
            scale: { repeat: Infinity, duration: 1.5, ease: "easeInOut" },
          }}
        >
          <Search className="h-10 w-10" />
        </motion.div>
      );
    case "executed":
      return (
        <motion.div
          className={`${size} ${common} bg-emerald-500/20 text-gold`}
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: [0, 1.2, 1], opacity: 1 }}
          transition={{ duration: 0.5, scale: { times: [0, 0.6, 1], duration: 0.5 } }}
        >
          <span className="relative w-12 h-12 flex items-center justify-center">
            <Image src="/bsc-yellow.png" alt="BNB Chain" width={48} height={48} className="object-contain" />
          </span>
        </motion.div>
      );
    case "rejected":
      return (
        <motion.div
          className={`${size} ${common} bg-red-400/15 text-red-400`}
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1, x: [0, -6, 6, -4, 4, 0] }}
          transition={{
            opacity: { duration: 0.3 },
            scale: { type: "spring", bounce: 0.3 },
            x: { duration: 0.4 },
          }}
        >
          <XCircle className="h-10 w-10" />
        </motion.div>
      );
  }
}

// ── Main dialog ───────────────────────────────────────────────────────────────

interface TransactionDetailDialogProps {
  tx: TransactionWithStatus | null;
  open: boolean;
  onClose: () => void;
}

export function TransactionDetailDialog({ tx, open, onClose }: TransactionDetailDialogProps) {
  if (!tx) return null;

  const config = getConfig(tx);
  const op = tx.operationType ?? (tx.direction === "receive" ? "receive" : "send");
  const explorerTxUrl = tx.txHash ? `${BSC_EXPLORER_URL}/tx/${tx.txHash}` : null;

  // Whether this is a zhentan-tracked tx (has our metadata)
  const isZhentanTx = tx.source !== "zerion-only";
  // Whether counterparty address is meaningful for this op
  const showCounterparty = !!tx.to && op !== "execute" && op !== "approve";
  const counterpartyLabel =
    op === "receive" ? "From" : op === "send" ? "To" : "Interacted with";

  // Risk section: only for zhentan txs with risk data
  const showRisk =
    isZhentanTx &&
    (tx.inReview || tx.status === "in_review") &&
    (tx.riskScore != null || (tx.riskReasons && tx.riskReasons.length > 0));

  return (
    <Dialog open={open} onClose={onClose} title="Transaction details" className="max-w-md">
      <div className="space-y-6">
        {/* Status animation */}
        <div className="flex flex-col items-center gap-3">
          <StatusAnimation status={tx.status} />
          <span
            className={`text-sm font-semibold ${
              tx.status === "executed"
                ? "text-gold"
                : tx.status === "rejected"
                  ? "text-red-400"
                  : tx.status === "in_review"
                    ? "text-gold"
                    : "text-amber-400"
            }`}
          >
            {statusLabel(tx.status)}
          </span>
        </div>

        {/* Hero: op icon + token + amount(s) */}
        <HeroAmount tx={tx} config={config} />

        {/* Details list */}
        <dl className="space-y-3 text-sm min-w-0">
          {/* Counterparty */}
          {showCounterparty && (
            <div className="flex justify-between gap-2 sm:gap-4">
              <dt className="text-slate-500 shrink-0">{counterpartyLabel}</dt>
              <dd
                className="min-w-0 max-w-[50%] sm:max-w-[200px] truncate"
                title={tx.to}
              >
                <a
                  href={`${BSC_EXPLORER_URL}/address/${tx.to}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group inline-flex items-center gap-2 font-mono text-slate-200 hover:text-white transition-colors underline-offset-4 hover:underline truncate"
                >
                  <ExternalLink className="h-3.5 w-3.5 shrink-0 text-slate-500 group-hover:text-slate-200" />
                  <span className="truncate">{truncateAddress(tx.to, 10)}</span>
                </a>
              </dd>
            </div>
          )}

          {/* Trade: explicit swap pair */}
          {op === "trade" && tx.tradeReceived && tx.amount && tx.token && (
            <div className="flex justify-between gap-2 sm:gap-4">
              <dt className="text-slate-500 shrink-0">Swapped</dt>
              <dd className="text-slate-300 text-right">
                <span className="text-emerald-400">+{formatTokenAmount(tx.tradeReceived.amount)} {tx.tradeReceived.symbol}</span>
                <span className="text-slate-500 mx-1.5">for</span>
                <span>{formatTokenAmount(tx.amount)} {tx.token}</span>
              </dd>
            </div>
          )}

          {/* DApp */}
          {tx.dappMetadata && (
            <div className="flex justify-between gap-2 sm:gap-4 items-center">
              <dt className="text-slate-500 shrink-0">DApp</dt>
              <dd className="flex items-center gap-2 min-w-0 max-w-[50%] sm:max-w-[200px]">
                {tx.dappMetadata.icons?.[0] && (
                  <img
                    src={tx.dappMetadata.icons[0]}
                    alt=""
                    className="w-5 h-5 rounded-md shrink-0 bg-white/10"
                  />
                )}
                <span className="text-slate-300 truncate" title={tx.dappMetadata.url}>
                  {tx.dappMetadata.name}
                </span>
              </dd>
            </div>
          )}

          {/* USD value (zerion enriched) */}
          {tx.valueUSD != null && tx.valueUSD > 0 && (
            <div className="flex justify-between gap-2 sm:gap-4">
              <dt className="text-slate-500 shrink-0">Value</dt>
              <dd className="text-slate-300">{formatUsd(tx.valueUSD)}</dd>
            </div>
          )}

          {/* Proposed — zhentan txs only */}
          {isZhentanTx && (
            <div className="flex justify-between gap-2 sm:gap-4">
              <dt className="text-slate-500 shrink-0">Proposed</dt>
              <dd className="text-slate-300 truncate min-w-0">{formatDate(tx.proposedAt)}</dd>
            </div>
          )}

          {/* Signatures — zhentan txs only */}
          {isZhentanTx && (
            <div className="flex justify-between gap-2 sm:gap-4">
              <dt className="text-slate-500 shrink-0">Signatures</dt>
              <dd className="text-slate-300">
                {tx.txHash ? tx.threshold : 1} of {tx.threshold}
              </dd>
            </div>
          )}

          {/* Executed at */}
          {tx.executedAt && (
            <div className="flex justify-between gap-2 sm:gap-4">
              <dt className="text-slate-500 shrink-0">Executed</dt>
              <dd className="text-slate-300 truncate min-w-0">{formatDate(tx.executedAt)}</dd>
            </div>
          )}

          {/* Rejection reason */}
          {tx.rejectReason && (
            <div className="flex justify-between gap-2 sm:gap-4">
              <dt className="text-slate-500 shrink-0">Reason</dt>
              <dd className="text-red-400 truncate min-w-0">{tx.rejectReason}</dd>
            </div>
          )}
        </dl>

        {/* Risk details */}
        {showRisk && (
          <RiskDetailsSection
            riskScore={tx.riskScore}
            riskVerdict={tx.riskVerdict}
            riskReasons={tx.riskReasons}
          />
        )}

        {/* BSCScan explorer link */}
        {explorerTxUrl && (
          <motion.a
            href={explorerTxUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full rounded-2xl py-3 bg-white/8 text-slate-300 hover:text-white hover:bg-white/12 transition-colors text-sm font-medium"
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

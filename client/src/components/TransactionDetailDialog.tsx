"use client";

import { useState } from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import type { TransactionWithStatus } from "@/types";
import { useLiveTransaction } from "@/hooks/useLiveTransaction";
import { CoSignButton } from "@/components/CoSignButton";
import { useAuth } from "@/app/context/AuthContext";
import { truncateAddress, formatDate, statusLabel, formatTokenAmount } from "@/lib/format";
import { Dialog } from "./ui/Dialog";
import { ExecutedAnimation, ReviewAnimation, RejectedAnimation } from "./animations/StatusAnimation";
import { MaoAvatar } from "./MaoAvatar";
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
  ShieldOff,
  Sparkles,
  Settings2,
  KeyRound,
  RefreshCw,
  Users,
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

// ── Wallet events (txKind rows) — one icon + explainer per server label ──────
// Labels are the server's hardcoded contract (server/src/lib/safe/txKind.ts +
// the synthesized creation row); unknown labels fall back by kind.

const KIND_ICONS: Record<string, LucideIcon> = {
  "Safe account created": Sparkles,
  "Protection activated": ShieldCheck,
  "Screening agent enabled": ShieldCheck,
  "Backup key added": KeyRound,
  "Backup key changed": RefreshCw,
  "Screening agent removed": ShieldOff,
  "Owners changed": Users,
  "Wallet configuration": Settings2,
};

const KIND_DESCRIPTIONS: Record<string, string> = {
  "Safe account created": "Your vault was deployed on-chain at its permanent address",
  "Protection activated": "Backup key and screening agent added as owners of your vault",
  "Screening agent enabled": "The screening agent was added as an owner — screening is on",
  "Backup key added": "A key you control was added as an owner — your override at app.safe.global",
  "Backup key changed": "Your backup key was swapped for a new one at the same address",
  "Screening agent removed": "The agent was removed as an owner — a stock Safe from here on",
  "Owners changed": "The owner set of your vault changed",
  "Wallet configuration": "A configuration call on your vault — no funds moved",
};

function kindConfig(tx: TransactionWithStatus): OpConfig & { description?: string } {
  const label =
    tx.kindLabel ?? (tx.txKind === "creation" ? "Safe account created" : "Wallet configuration");
  return {
    Icon: KIND_ICONS[label] ?? (tx.txKind === "creation" ? Sparkles : Settings2),
    label,
    sign: "",
    iconColor: "text-gold",
    description: KIND_DESCRIPTIONS[label],
  };
}

function getConfig(tx: TransactionWithStatus): OpConfig & { description?: string } {
  if (tx.txKind) return kindConfig(tx);
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

function HeroAmount({
  tx,
  config,
}: {
  tx: TransactionWithStatus;
  config: OpConfig & { description?: string };
}) {
  const { Icon, label, sign, iconColor } = config;
  const op = tx.operationType ?? (tx.direction === "receive" ? "receive" : "send");
  const usd = formatUsd(tx.valueUSD);

  // Wallet event (creation / config): gold event tile + label + explainer —
  // these rows move no funds, so no token avatar or amount.
  if (tx.txKind) {
    return (
      <div className="rounded-md bg-foreground/6 p-4 flex items-center gap-3">
        <div className="w-10 h-10 rounded-md bg-gold/10 flex items-center justify-center shrink-0 text-gold">
          <Icon className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-base font-semibold text-foreground">{label}</p>
          {config.description && (
            <p className="text-xs text-muted-foreground/80 mt-0.5 leading-relaxed">
              {config.description}
            </p>
          )}
        </div>
      </div>
    );
  }

  // Trade: dual-token layout — [sent] → [received]
  if (op === "trade" && tx.tradeReceived) {
    return (
      <div className="rounded-md bg-foreground/6 p-4">
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
    <div className="rounded-md bg-foreground/6 p-4 flex items-center gap-3">
      {/* Op icon */}
      <div className={`w-10 h-10 rounded-md bg-foreground/[0.08] flex items-center justify-center shrink-0 ${iconColor}`}>
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
    <div className="rounded-md bg-foreground/6 overflow-hidden">
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
                  <div className="h-1.5 rounded-full bg-foreground/10 overflow-hidden">
                    <motion.span
                      className={`block h-full rounded-full ${sev.bg}`}
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

// ── Co-sign section ───────────────────────────────────────────────────────────

/**
 * Backup-key completion actions for a SafeTx queued below threshold: sign
 * in-app (relay-only execution — the agent never signs what it didn't screen,
 * and once the user's keys meet the threshold it doesn't need to), or finish
 * in the Safe app. Available whether screening is on (executes ahead of — or
 * over — the agent's verdict) or off (the backup key is the only completion
 * path). When the backup wallet has no live session, the button opens Privy's
 * connect modal first.
 */
function CoSignSection({ tx }: { tx: TransactionWithStatus }) {
  const caption =
    tx.status === "in_review"
      ? "Flagged for your review — signing with your backup key executes it anyway."
      : tx.screeningDisabled
        ? `Waiting for your backup key — ${1 + (tx.userSignatures?.length ?? 0)} of ${tx.threshold} signatures.`
        : "Zhentan is screening — signing with your backup key executes it right away.";
  // On success, useLiveTransaction flips the dialog to executed in place.
  return (
    <div className="space-y-2.5">
      <p className="text-xs text-muted-foreground/80 text-center">{caption}</p>
      <CoSignButton tx={tx} />
      <motion.a
        href={`https://app.safe.global/transactions/queue?safe=bnb:${tx.safeAddress}`}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center justify-center gap-2 w-full rounded-md py-3 border border-gold/30 text-gold hover:bg-gold/10 transition-colors text-sm font-medium"
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
      >
        Sign in Safe app
        <ExternalLink className="h-3.5 w-3.5 opacity-60" />
      </motion.a>
    </div>
  );
}

// ── Status animation ──────────────────────────────────────────────────────────

function StatusAnimation({
  status,
  screening,
}: {
  status: TransactionWithStatus["status"];
  /** Whether the agent is screening this tx — Mao only appears for agent work. */
  screening: boolean;
}) {
  switch (status) {
    case "pending":
      // Screening on: Mao is reading it. Off: a plain wait for the backup key.
      return screening ? <MaoAvatar state="scanning" size={80} /> : <ReviewAnimation size={80} />;
    case "in_review":
      // The agent paused ON PURPOSE — the decision is yours now.
      return <MaoAvatar state="asking" size={80} />;
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
            <StatusAnimation status={tx.status} screening={tx.screeningDisabled !== true} />
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
                  <span className="truncate">{truncateAddress(tx.to)}</span>
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

        {/* Unresolved SafeTx below threshold: the backup key can complete it —
            in-app co-sign (relay-only execution) or the Safe app. Screening
            off: the only completion path. Screening on (pending/in_review):
            the user-override path — their two keys meet the threshold, so
            signing executes without waiting on the agent's verdict. Only
            protected wallets have a backup key to sign with. */}
        {tx.txType === "safetx" &&
          (tx.status === "pending" || tx.status === "in_review") &&
          !tx.txHash &&
          overrideAvailable &&
          1 + (tx.userSignatures?.length ?? 0) < (tx.threshold ?? 2) && (
            <CoSignSection tx={tx} />
          )}

        {/* BSCScan explorer link */}
        {explorerTxUrl && (
          <motion.a
            href={explorerTxUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full rounded-md py-3 bg-foreground/8 text-foreground/80 hover:text-foreground hover:bg-foreground/12 transition-colors text-sm font-medium"
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

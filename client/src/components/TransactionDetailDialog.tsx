"use client";

import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import type { TransactionWithStatus } from "@/types";
import { useLiveTransaction } from "@/hooks/useLiveTransaction";
import { CoSignButton } from "@/components/CoSignButton";
import { useAuth } from "@/app/context/AuthContext";
import { truncateAddress, formatDate, statusLabel, formatTokenAmount } from "@/lib/format";
import { Dialog } from "./ui/Dialog";
import { RiskSection } from "./RiskSection";
import { ExecutedAnimation, ReviewAnimation, RejectedAnimation } from "./animations/StatusAnimation";
import { MaoAvatar } from "./MaoAvatar";
import { ArrowUpRight, ExternalLink } from "lucide-react";
import { BSC_EXPLORER_URL } from "@/lib/constants";
import {
  getOpConfig,
  formatUsd,
  TokenAvatar,
  LINK_BUTTON_GOLD,
  LINK_BUTTON_NEUTRAL,
  type OpConfig,
} from "./txPresentation";

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
      ? "Flagged for review. Signing with your backup key executes it anyway."
      : tx.screeningDisabled
        ? `Waiting for your backup key — ${1 + (tx.userSignatures?.length ?? 0)} of ${tx.threshold} signatures.`
        : "Zhentan is screening. Your backup key can execute it now.";
  // On success, useLiveTransaction flips the dialog to executed in place.
  return (
    <div className="space-y-2.5">
      <p className="text-xs text-muted-foreground/80 text-center">{caption}</p>
      <CoSignButton tx={tx} />
      <a
        href={`https://app.safe.global/transactions/queue?safe=bnb:${tx.safeAddress}`}
        target="_blank"
        rel="noopener noreferrer"
        className={LINK_BUTTON_GOLD}
      >
        Sign in Safe app
        <ExternalLink className="h-3.5 w-3.5 opacity-60" />
      </a>
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

  const config = getOpConfig(tx);
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
          <RiskSection
            riskScore={tx.riskScore}
            riskVerdict={tx.riskVerdict}
            riskReasons={tx.riskReasons}
            message={tx.reviewReason}
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

        {/* BscScan explorer link */}
        {explorerTxUrl && (
          <a
            href={explorerTxUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={LINK_BUTTON_NEUTRAL}
          >
            <span className="relative w-[18px] h-[18px] shrink-0">
              <Image src="/bscscan.png" alt="" fill className="object-contain rounded" sizes="18px" />
            </span>
            View on BscScan
            <ExternalLink className="h-3.5 w-3.5 opacity-50" />
          </a>
        )}
      </div>
    </Dialog>
  );
}

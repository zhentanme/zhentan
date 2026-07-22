"use client";

import { useMemo, useState, useEffect } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { clsx } from "clsx";
import {
  Bot,
  User,
  Activity,
  CheckCircle2,
  AlertTriangle,
  ArrowUpRight,
  ArrowRight,
} from "lucide-react";
import { useScreeningStatus } from "@/app/context/ScreeningStatusContext";
import { useActivityData } from "@/app/context/ActivityDataContext";
import { truncateAddress, timeAgo, formatTokenAmount } from "@/lib/format";
import { TwinTick } from "@/components/BrandMark";
import { TransactionDetailDialog } from "@/components/TransactionDetailDialog";
import { RequestDetailDialog } from "@/components/RequestDetailDialog";
import { useRequestActions } from "@/hooks/useRequestActions";
import type { TransactionWithStatus, QueuedRequest } from "@/types";

/* ── Rolling agent readout — rotating idle messages ─────────────── */

const IDLE_MESSAGES: { text: string; em: string | null }[] = [
  { text: "All clear. Nothing suspicious in the last hour.", em: null },
  { text: "Every signature goes through me before it lands.", em: null },
  { text: "Watching the mempool.", em: "Nothing gets past." },
  { text: "Your vault is clean.", em: "I'll tell you if that changes." },
  { text: "No unusual activity detected.", em: "Staying sharp." },
  { text: "I screen every transaction — even the boring ones.", em: null },
  { text: "On duty.", em: "24 / 7, no days off." },
  { text: "Running policy checks in the background.", em: null },
];

const PAUSED_MESSAGES: { text: string; em: string | null }[] = [
  { text: "Screening is off.", em: "Transactions skip AI review." },
  { text: "I'm standing down.", em: "Re-enable me in settings." },
  { text: "Guard paused — nothing is being checked.", em: null },
];

const ROLL_INTERVAL = 5000;

function RollingReadout({ isActive }: { isActive: boolean }) {
  const pool = isActive ? IDLE_MESSAGES : PAUSED_MESSAGES;
  const [index, setIndex] = useState(0);

  useEffect(() => {
    setIndex(0);
  }, [isActive]);

  useEffect(() => {
    const id = setInterval(() => {
      setIndex((i) => (i + 1) % pool.length);
    }, ROLL_INTERVAL);
    return () => clearInterval(id);
  }, [pool.length]);

  const msg = pool[index % pool.length];

  return (
    <div className="min-h-[42px] flex items-start justify-center">
      <AnimatePresence mode="wait">
        <motion.p
          key={index}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className="text-[13px] leading-relaxed text-muted-foreground text-center max-w-[230px]"
        >
          {msg.text}
          {msg.em && (
            <>
              {" "}
              <em className="not-italic text-gold-300">{msg.em}</em>
            </>
          )}
        </motion.p>
      </AnimatePresence>
    </div>
  );
}

/* ── Live readout — empty state scanner card ────────────────────── */

function LiveReadout({ isActive }: { isActive: boolean }) {
  return (
    <div className="p-3 pt-4 flex-1 flex min-h-0">
      <Link
        href="/settings"
        aria-label="Agent screening settings"
        className="group relative flex-1 overflow-hidden rounded-xl bg-foreground/[0.03] border border-border transition-colors hover:bg-foreground/[0.05] hover:border-gold/25"
      >
        {/* Gold top-edge accent */}
        <div
          className="absolute top-0 left-0 right-0 h-px"
          style={{
            background:
              "linear-gradient(90deg, transparent, rgba(196,148,40,0.55), transparent)",
          }}
        />

        <div className="h-full flex flex-col items-center justify-center py-9 px-5">
          {/* Zhentan scanner — sonar sweep */}
          <div className="relative mb-7 flex items-center justify-center w-[72px] h-[72px]">
            {isActive && (
              <>
                <span className="absolute inset-0 rounded-full border-[1.5px] border-gold/70 [animation:sonar_2.4s_ease-out_infinite]" />
                <span className="absolute inset-0 rounded-full border-[1.5px] border-gold/70 [animation:sonar_2.4s_ease-out_0.8s_infinite]" />
                <span className="absolute inset-0 rounded-full border-[1.5px] border-gold/70 [animation:sonar_2.4s_ease-out_1.6s_infinite]" />
              </>
            )}
            <div
              className={clsx(
                "relative w-10 h-10 rounded-full flex items-center justify-center",
                isActive
                  ? "bg-gold/10 [animation:signal-pulse_2.4s_ease-in-out_infinite]"
                  : "bg-foreground/6 grayscale opacity-60"
              )}
            >
              <TwinTick size={22} halo="none" />
            </div>
          </div>

          {/* Rolling agent text */}
          <RollingReadout isActive={isActive} />
        </div>
      </Link>
    </div>
  );
}

/* ── Pending card — agent-proposed or user-proposed ─────────────── */

function PendingCard({
  kind,
  amount,
  token,
  time,
  party,
  meta,
  note,
  risk,
  onClick,
}: {
  kind: "queued" | "review";
  amount: string;
  token: string;
  time: string;
  party: string;
  meta?: string;
  note: string;
  risk?: number | null;
  /** When set, the whole card is clickable (opens the detail dialog) and no CTA is shown. */
  onClick?: () => void;
}) {
  const isQueued = kind === "queued";
  const accentRgba = isQueued
    ? "rgba(245,158,11,0.65)"
    : "rgba(196,148,40,0.65)";
  const lowRisk = (risk ?? 100) < 40;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28 }}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={onClick ? (e) => e.key === "Enter" && onClick() : undefined}
      className={clsx(
        "relative overflow-hidden rounded-xl bg-foreground/[0.04] border border-border",
        onClick &&
          "cursor-pointer transition-colors hover:bg-foreground/[0.06] hover:border-gold/25"
      )}
    >
      {/* Top accent gradient line */}
      <div
        className="absolute top-0 left-0 right-0 h-px"
        style={{
          background: `linear-gradient(90deg, transparent, ${accentRgba}, transparent)`,
        }}
      />

      <div className="p-4">
        {/* Origin chip + time */}
        <div className="flex items-center justify-between gap-2 mb-3.5">
          <span
            className={clsx(
              "inline-flex items-center gap-1.5 font-mono uppercase tracking-wide text-[10px] font-semibold",
              isQueued ? "text-watch" : "text-gold"
            )}
          >
            {isQueued ? <Bot className="h-3 w-3" /> : <User className="h-3 w-3" />}
            {isQueued ? "Agent proposed" : "You proposed"}
          </span>
          <span className="font-mono text-[10px] text-muted-foreground/55">
            {timeAgo(time)}
          </span>
        </div>

        {/* Amount — prominent */}
        <p className="font-mono font-bold text-[22px] leading-none text-foreground tabular-nums">
          {formatTokenAmount(amount)}
          <span className="ml-1.5 text-sm font-medium text-muted-foreground">
            {token}
          </span>
        </p>

        {/* Recipient */}
        <p className="mt-1.5 font-mono text-[11px] text-muted-foreground/80 truncate">
          → {party}
          {meta && (
            <span className="text-muted-foreground/50"> · {meta}</span>
          )}
        </p>

        {/* Risk note */}
        <div className="flex items-start gap-1.5 mt-3 pt-3 border-t border-border">
          {lowRisk ? (
            <CheckCircle2 className="h-3 w-3 shrink-0 mt-0.5 text-safe" />
          ) : (
            <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5 text-watch" />
          )}
          <span className="text-[11px] leading-snug text-foreground/65">
            {note}
          </span>
        </div>

        {/* CTA → full queue. Agent-proposed only; the user-proposed card just
            opens the detail dialog. The card itself opens a dialog (onClick), so
            stop propagation here to let the button navigate instead. */}
        {isQueued && (
          <Link
            href="/requests"
            onClick={(e) => e.stopPropagation()}
            className="mt-3 w-full inline-flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-semibold transition-colors bg-watch/[0.13] text-watch hover:bg-watch/20"
          >
            Screen &amp; accept
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        )}
      </div>
    </motion.div>
  );
}

/* ── Rail ────────────────────────────────────────────────────────── */

export function RightRail() {
  const { isScreeningActive } = useScreeningStatus();
  const { requests, transactions } = useActivityData();
  const { handleApprove, handleReject, refresh } = useRequestActions();
  const [selectedTx, setSelectedTx] = useState<TransactionWithStatus | null>(null);
  const [selectedRequest, setSelectedRequest] = useState<QueuedRequest | null>(null);

  // Most recent agent-proposed request (queued)
  const lastQueued = useMemo(() => {
    const q = [...requests.filter((x) => x.status === "queued")].sort(
      (a, b) => new Date(b.queuedAt).getTime() - new Date(a.queuedAt).getTime()
    );
    return q[0] ?? null;
  }, [requests]);

  // Most recent user-proposed transaction (in_review)
  const lastReview = useMemo(() => {
    const r = [...transactions.filter((x) => x.status === "in_review")].sort(
      (a, b) =>
        new Date(b.proposedAt).getTime() - new Date(a.proposedAt).getTime()
    );
    return r[0] ?? null;
  }, [transactions]);

  const hasPending = lastQueued !== null || lastReview !== null;

  // Screened terminal decisions
  const decisions = useMemo(
    () =>
      transactions
        .filter(
          (x) =>
            (x.status === "executed" || x.status === "rejected") &&
            x.screeningDisabled !== true &&
            (x.riskVerdict != null || x.riskScore != null)
        )
        .slice(0, 6),
    [transactions]
  );

  return (
    <aside
      data-tour="agent-rail"
      className="fixed inset-y-0 right-0 z-40 hidden xl:flex w-[22rem] flex-col border-l border-border"
      style={{
        background:
          "radial-gradient(90% 55% at 50% 42%, rgba(196,148,40,0.10) 0%, rgba(196,148,40,0.03) 30%, transparent 62%), var(--ink-950)",
      }}
    >
      {/* Agent status header — opens screening settings */}
      <Link
        href="/settings"
        aria-label="Agent screening settings"
        className="block px-5 pt-[18px] pb-4 border-b border-border shrink-0 transition-colors hover:bg-foreground/[0.03]"
      >
        <div className="flex items-center gap-3">
          <div className="relative w-10 h-10 shrink-0 flex items-center justify-center">
            {isScreeningActive && (
              <>
                <span className="absolute inset-0 rounded-md border border-safe/50 [animation:sonar_2.6s_ease-out_infinite]" />
                <span className="absolute inset-0 rounded-md border border-safe/50 [animation:sonar_2.6s_ease-out_1.3s_infinite]" />
              </>
            )}
            <div
              className={clsx(
                "relative w-10 h-10 rounded-md flex items-center justify-center",
                isScreeningActive
                  ? "bg-safe/12 text-safe"
                  : "bg-foreground/6 text-muted-foreground"
              )}
            >
              <Bot className="h-5 w-5" />
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground">Zhentan Agent</p>
            <p className="mt-0.5 flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground">
              <span
                className={clsx(
                  "h-1.5 w-1.5 rounded-pill signal-dot",
                  isScreeningActive
                    ? "bg-safe animate-signal-pulse"
                    : "bg-muted-foreground"
                )}
              />
              {isScreeningActive
                ? "Monitoring · screening on"
                : "Paused · screening off"}
            </p>
          </div>
          <span
            className={clsx(
              "shrink-0 font-mono uppercase tracking-wider text-[10px] font-semibold px-2.5 py-1 rounded-pill",
              isScreeningActive
                ? "bg-safe/10 text-safe"
                : "bg-foreground/8 text-muted-foreground"
            )}
          >
            {isScreeningActive ? "Live" : "Off"}
          </span>
        </div>
      </Link>

      {/* Pending section */}
      <div className={clsx("flex flex-col min-h-0", !hasPending && "flex-1")}>
        <AnimatePresence mode="wait">
        {!hasPending ? (
          <motion.div
            key="rail-empty"
            className="flex-1 flex min-h-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
          >
            <LiveReadout isActive={isScreeningActive} />
          </motion.div>
        ) : (
          <motion.div
            key="rail-pending"
            className="px-3 pt-4 pb-2 flex flex-col gap-3"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
          >
            {lastQueued && (
              <PendingCard
                kind="queued"
                amount={String(lastQueued.amount)}
                token={lastQueued.token}
                time={lastQueued.queuedAt}
                party={
                  lastQueued.billedFrom?.name ||
                  truncateAddress(lastQueued.to, 16)
                }
                meta={
                  lastQueued.invoiceNumber ||
                  lastQueued.description ||
                  undefined
                }
                note={
                  lastQueued.riskNotes ||
                  (lastQueued.riskScore != null && lastQueued.riskScore < 40
                    ? "Low risk — prepared for your sign-off."
                    : "Agent prepared this — review before you sign.")
                }
                risk={lastQueued.riskScore}
                onClick={() => setSelectedRequest(lastQueued)}
              />
            )}
            {lastReview && (
              <PendingCard
                kind="review"
                amount={lastReview.amount}
                token={lastReview.token}
                time={lastReview.proposedAt}
                party={truncateAddress(lastReview.to, 16)}
                meta={lastReview.reviewReason || undefined}
                note={
                  lastReview.riskReasons?.[0] ||
                  `Agent screened${lastReview.riskScore != null ? ` · risk ${lastReview.riskScore}` : ""} — needs your approval.`
                }
                risk={lastReview.riskScore}
                onClick={() => setSelectedTx(lastReview)}
              />
            )}
            <Link
              href="/requests"
              className="flex items-center justify-center gap-1.5 py-2.5 rounded-md font-mono uppercase tracking-wide text-[11px] text-muted-foreground hover:text-foreground hover:bg-foreground/[0.03] transition-colors"
            >
              Open full queue
              <ArrowRight className="h-3 w-3" />
            </Link>
          </motion.div>
        )}
        </AnimatePresence>
      </div>

      {/* Agent decisions stream */}
      {decisions.length > 0 && (
        <>
          <div className="px-4 pt-3 pb-2 flex items-center justify-between border-t border-border shrink-0">
            <p className="eyebrow text-muted-foreground/70">Agent decisions</p>
            <span className="font-mono uppercase tracking-wide text-[10px] text-muted-foreground/50">
              Autonomous
            </span>
          </div>
          <div
            className={clsx(
              "px-3 pb-4 flex flex-col gap-0.5",
              hasPending && "flex-1 min-h-0 overflow-y-auto"
            )}
          >
            {decisions.map((tx, i) => {
              const rejected = tx.status === "rejected";
              return (
                <motion.button
                  key={`${tx.id}-${i}`}
                  type="button"
                  onClick={() => setSelectedTx(tx)}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05, duration: 0.3 }}
                  className={clsx(
                    "w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-md hover:bg-foreground/[0.04] transition-colors cursor-pointer",
                    rejected && "opacity-55"
                  )}
                >
                  <span
                    className={clsx(
                      "h-1.5 w-1.5 rounded-pill shrink-0 signal-dot",
                      rejected ? "bg-danger" : "bg-safe"
                    )}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="flex items-center gap-1 font-mono text-xs font-medium text-foreground/90 tabular-nums">
                      <ArrowUpRight className="h-3 w-3 text-muted-foreground shrink-0" />
                      {formatTokenAmount(tx.amount)} {tx.token}
                    </p>
                    <p className="font-mono text-[11px] text-muted-foreground truncate mt-0.5">
                      {truncateAddress(tx.to, 14)}
                    </p>
                  </div>
                  <span
                    className={clsx(
                      "font-mono uppercase tracking-wide text-[10px] shrink-0",
                      rejected ? "text-danger" : "text-safe"
                    )}
                  >
                    {rejected ? "Blocked" : "Approved"}
                  </span>
                </motion.button>
              );
            })}
          </div>
        </>
      )}

      <TransactionDetailDialog
        tx={selectedTx}
        open={selectedTx !== null}
        onClose={() => setSelectedTx(null)}
      />

      <RequestDetailDialog
        request={selectedRequest}
        open={selectedRequest !== null}
        onClose={() => setSelectedRequest(null)}
        onApprove={handleApprove}
        onReject={handleReject}
        onRefresh={refresh}
      />
    </aside>
  );
}

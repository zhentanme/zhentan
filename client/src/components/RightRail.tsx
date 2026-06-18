"use client";

import { useMemo } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { clsx } from "clsx";
import { ArrowUpRight, Bot, ShieldCheck } from "lucide-react";
import { useScreeningStatus } from "@/app/context/ScreeningStatusContext";
import { useActivityData } from "@/app/context/ActivityDataContext";
import { truncateAddress, statusLabel, timeAgo, formatTokenAmount } from "@/lib/format";
import type { TransactionStatus } from "@/types";

const SIGNAL: Record<TransactionStatus, { tone: string; dot: string }> = {
  pending: { tone: "text-watch", dot: "bg-watch" },
  in_review: { tone: "text-watch", dot: "bg-watch" },
  executed: { tone: "text-safe", dot: "bg-safe" },
  rejected: { tone: "text-danger", dot: "bg-danger" },
};

/** A unit of work that needs the user: agent-proposed (queued) or user-initiated (in review). */
type PendingItem = {
  id: string;
  kind: "queued" | "review";
  amount: string;
  token: string;
  time: string;
};

const MAX_PENDING = 4;

export function RightRail() {
  const { isScreeningActive } = useScreeningStatus();
  const { requests, transactions, loading } = useActivityData();

  // "Needs your review" = in-review txs (you proposed) + queued requests (agent
  // proposed), newest first. Both derive from the shared activity feed.
  const pending = useMemo<PendingItem[]>(() => {
    const reviewItems: PendingItem[] = transactions
      .filter((x) => x.status === "in_review")
      .map((x) => ({ id: x.id, kind: "review", amount: x.amount, token: x.token, time: x.proposedAt }));
    const queuedItems: PendingItem[] = requests
      .filter((x) => x.status === "queued")
      .map((x) => ({ id: x.id, kind: "queued", amount: x.amount, token: x.token, time: x.queuedAt }));
    return [...reviewItems, ...queuedItems].sort(
      (a, b) => new Date(b.time).getTime() - new Date(a.time).getTime()
    );
  }, [transactions, requests]);

  const decisions = useMemo(
    () => transactions.filter((x) => x.status === "executed" || x.status === "rejected").slice(0, 6),
    [transactions]
  );

  const initialLoading = loading && pending.length === 0 && decisions.length === 0;
  const shown = pending.slice(0, MAX_PENDING);
  const overflow = pending.length - shown.length;

  return (
    <aside
      className="fixed inset-y-0 right-0 z-40 hidden xl:flex w-[22rem] flex-col border-l border-border"
      style={{
        background:
          "radial-gradient(90% 55% at 50% 42%, rgba(196,148,40,0.10) 0%, rgba(196,148,40,0.03) 30%, transparent 62%), var(--ink-950)",
      }}
    >
      {/* Header */}
      <div className="px-6 h-16 flex items-center justify-between border-b border-border">
        <div>
          <p className="eyebrow text-muted-foreground/70">Co-sign</p>
          <p className="text-sm font-semibold text-foreground">Agent activity</p>
        </div>
        <span
          className={clsx(
            "inline-flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-wider",
            isScreeningActive ? "text-safe" : "text-muted-foreground"
          )}
        >
          <span
            className={clsx(
              "h-1.5 w-1.5 rounded-pill signal-dot",
              isScreeningActive ? "bg-safe animate-signal-pulse" : "bg-muted-foreground"
            )}
          />
          {isScreeningActive ? "Watching" : "Paused"}
        </span>
      </div>

      {/* Needs your review — both queued (agent) and in-review (you) */}
      <div className="px-4 pt-4 pb-2 flex items-center justify-between">
        <p className="eyebrow text-muted-foreground/70">Needs your review</p>
        {pending.length > 0 && (
          <span className="flex items-center justify-center min-w-[18px] h-[18px] px-1.5 rounded-pill bg-watch text-[10px] font-bold text-ink-900">
            {pending.length}
          </span>
        )}
      </div>

      <div className="px-3">
        {initialLoading ? (
          <div className="rounded-md border border-border overflow-hidden divide-y divide-border">
            {[0, 1].map((i) => (
              <div key={i} className="flex items-center gap-3 px-3 py-2.5">
                <span className="h-8 w-8 rounded-md bg-foreground/[0.06] animate-pulse shrink-0" />
                <div className="flex-1 min-w-0 space-y-1.5">
                  <span className="block h-3 w-20 rounded bg-foreground/[0.06] animate-pulse" />
                  <span className="block h-2.5 w-28 rounded bg-foreground/[0.04] animate-pulse" />
                </div>
              </div>
            ))}
          </div>
        ) : pending.length === 0 ? (
          <div className="relative mx-1 rounded-md border border-border bg-foreground/[0.02] p-5 flex flex-col items-center text-center overflow-hidden">
            <div className="relative mb-3 h-12 w-12 flex items-center justify-center">
              <span className="absolute inset-0 rounded-pill border border-safe/40 opacity-0 [animation:sonar_2.4s_ease-out_infinite]" />
              <span className="absolute inset-0 rounded-pill border border-safe/40 opacity-0 [animation:sonar_2.4s_ease-out_0.8s_infinite]" />
              <ShieldCheck className="h-6 w-6 text-safe" />
            </div>
            <p className="text-sm font-medium text-foreground">All clear</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Nothing pending. The agent signs matches instantly.
            </p>
          </div>
        ) : (
          <div className="rounded-md border border-watch/25 bg-watch/[0.06] overflow-hidden divide-y divide-border">
            {shown.map((item, i) => {
              const isQueued = item.kind === "queued";
              const inner = (
                <>
                  <span className="h-8 w-8 rounded-md bg-watch/12 text-watch flex items-center justify-center shrink-0">
                    {isQueued ? <Bot className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-foreground/90 truncate tabular-nums">
                      {formatTokenAmount(item.amount)} {item.token}
                    </p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {isQueued ? "Agent proposed" : "You proposed"} · {timeAgo(item.time)}
                    </p>
                  </div>
                  <span className="text-[10px] font-mono uppercase tracking-wider text-watch shrink-0">
                    {isQueued ? "Queued" : "Review"}
                  </span>
                </>
              );
              return (
                <motion.div
                  key={`${item.kind}-${item.id}`}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05, duration: 0.25 }}
                >
                  {isQueued ? (
                    <Link href="/requests" className="flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-watch/10">
                      {inner}
                    </Link>
                  ) : (
                    <div className="flex items-center gap-3 px-3 py-2.5">{inner}</div>
                  )}
                </motion.div>
              );
            })}

            <Link
              href="/requests"
              className="flex items-center justify-center gap-1 px-3 py-2 text-[11px] font-mono uppercase tracking-wider text-watch hover:bg-watch/10 transition-colors"
            >
              {overflow > 0 ? `+${overflow} more · Open queue` : "Open queue"} →
            </Link>
          </div>
        )}
      </div>

      {/* Recent decisions — resolved transactions only */}
      <div className="px-4 pt-5 pb-2">
        <p className="eyebrow text-muted-foreground/70">Recent decisions</p>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto px-3 pb-4">
        {initialLoading ? (
          <div className="space-y-0.5">
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex items-center gap-3 px-3 py-2.5">
                <span className="h-1.5 w-1.5 rounded-pill bg-foreground/[0.08] shrink-0" />
                <div className="flex-1 min-w-0 space-y-1.5">
                  <span className="block h-3 w-24 rounded bg-foreground/[0.06] animate-pulse" />
                  <span className="block h-2.5 w-32 rounded bg-foreground/[0.04] animate-pulse" />
                </div>
              </div>
            ))}
          </div>
        ) : decisions.length === 0 ? (
          <p className="px-3 py-6 text-center text-xs text-muted-foreground">No decisions yet.</p>
        ) : (
          <div className="space-y-0.5">
            {decisions.map((tx, i) => {
              const sig = SIGNAL[tx.status] ?? SIGNAL.pending;
              return (
                <motion.div
                  key={`${tx.id}-${i}`}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05, duration: 0.3 }}
                  className={clsx(
                    "flex items-center gap-3 px-3 py-2.5 rounded-md hover:bg-foreground/[0.03] transition-colors",
                    tx.status === "rejected" && "opacity-55"
                  )}
                >
                  <span className={clsx("h-1.5 w-1.5 rounded-pill shrink-0 signal-dot", sig.dot)} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-foreground/90 truncate flex items-center gap-1 tabular-nums">
                      <ArrowUpRight className="h-3 w-3 text-muted-foreground shrink-0" />
                      {formatTokenAmount(tx.amount)} {tx.token ?? ""}
                    </p>
                    <p className="text-[11px] font-mono text-muted-foreground truncate">
                      {tx.to ? truncateAddress(tx.to, 14) : "—"}
                    </p>
                  </div>
                  <span className={clsx("text-[10px] font-mono uppercase tracking-wider", sig.tone)}>
                    {statusLabel(tx.status)}
                  </span>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </aside>
  );
}

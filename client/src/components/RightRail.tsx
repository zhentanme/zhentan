"use client";

import { useMemo } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { clsx } from "clsx";
import {
  Bot,
  User,
  Activity,
  CheckCircle2,
  AlertTriangle,
  ArrowUpRight,
  ArrowRight,
  ChevronRight,
} from "lucide-react";
import { useScreeningStatus } from "@/app/context/ScreeningStatusContext";
import { useActivityData } from "@/app/context/ActivityDataContext";
import { truncateAddress, timeAgo, formatTokenAmount } from "@/lib/format";

/** A unit of work that needs the user: agent-proposed (queued) or user-initiated (in review). */
type PendingItem = {
  id: string;
  kind: "queued" | "review";
  amount: string;
  token: string;
  time: string;
  party: string;
  meta?: string;
  note: string;
  risk?: number;
};

const MAX_PENDING = 3;

export function RightRail() {
  const { isScreeningActive } = useScreeningStatus();
  const { requests, transactions } = useActivityData();

  // "Needs your review" = in-review txs (you proposed) + queued requests (agent
  // proposed), newest first.
  const pending = useMemo<PendingItem[]>(() => {
    const reviewItems: PendingItem[] = transactions
      .filter((x) => x.status === "in_review")
      .map((x) => ({
        id: x.id,
        kind: "review" as const,
        amount: x.amount,
        token: x.token,
        time: x.proposedAt,
        party: truncateAddress(x.to, 16),
        meta: x.reviewReason || undefined,
        note:
          x.riskReasons?.[0] ||
          `Agent screened${x.riskScore != null ? ` · risk ${x.riskScore}` : ""} — needs your approval.`,
        risk: x.riskScore,
      }));
    const queuedItems: PendingItem[] = requests
      .filter((x) => x.status === "queued")
      .map((x) => ({
        id: x.id,
        kind: "queued" as const,
        amount: x.amount,
        token: x.token,
        time: x.queuedAt,
        party: x.billedFrom?.name || truncateAddress(x.to, 16),
        meta: x.invoiceNumber || x.description || undefined,
        note:
          x.riskNotes ||
          (x.riskScore != null && x.riskScore < 40
            ? "Low risk — prepared for your sign-off."
            : "Agent prepared this — review before you sign."),
        risk: x.riskScore,
      }));
    return [...reviewItems, ...queuedItems].sort(
      (a, b) => new Date(b.time).getTime() - new Date(a.time).getTime()
    );
  }, [transactions, requests]);

  // "Agent decisions" = terminal transactions the agent actually screened.
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
      {/* Agent status header */}
      <div className="px-5 pt-[18px] pb-4 border-b border-border">
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
                isScreeningActive ? "bg-safe/12 text-safe" : "bg-foreground/6 text-muted-foreground"
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
                  isScreeningActive ? "bg-safe animate-signal-pulse" : "bg-muted-foreground"
                )}
              />
              {isScreeningActive ? "Monitoring · BNB Chain" : "Paused · screening off"}
            </p>
          </div>
          <span
            className={clsx(
              "shrink-0 font-mono uppercase tracking-wider text-[10px] font-semibold px-2.5 py-1 rounded-pill",
              isScreeningActive ? "bg-safe/10 text-safe" : "bg-foreground/8 text-muted-foreground"
            )}
          >
            {isScreeningActive ? "Live" : "Off"}
          </span>
        </div>
        <div className="mt-3.5 flex items-center gap-2 font-mono text-[11px] text-muted-foreground/85">
          <Activity className="h-3.5 w-3.5 shrink-0 text-safe" />
          <span className="flex-1">
            {isScreeningActive
              ? "Screening every signature in real time"
              : "Transactions execute without AI review"}
          </span>
        </div>
      </div>

      {/* Needs your review */}
      <div className="px-4 pt-4 pb-2 flex items-center justify-between">
        <p className="eyebrow text-muted-foreground/70">Needs your review</p>
        {pending.length > 0 && (
          <span className="flex items-center justify-center min-w-[18px] h-[18px] px-1.5 rounded-pill bg-watch text-[10px] font-bold text-ink-900">
            {pending.length}
          </span>
        )}
      </div>

      <div className="px-3 flex flex-col gap-2">
        {pending.length === 0 ? (
          <div className="relative mx-1 rounded-md border border-border bg-foreground/[0.02] p-5 flex flex-col items-center text-center overflow-hidden">
            <div className="relative mb-3 h-12 w-12 flex items-center justify-center">
              <span className="absolute inset-0 rounded-pill border border-safe/40 opacity-0 [animation:sonar_2.4s_ease-out_infinite]" />
              <span className="absolute inset-0 rounded-pill border border-safe/40 opacity-0 [animation:sonar_2.4s_ease-out_0.8s_infinite]" />
              <CheckCircle2 className="h-6 w-6 text-safe" />
            </div>
            <p className="text-sm font-medium text-foreground">All clear</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Nothing pending. The agent signs matches instantly.
            </p>
          </div>
        ) : (
          <>
            {shown.map((item, i) => {
              const isQueued = item.kind === "queued";
              const accent = isQueued ? "watch" : "gold";
              const lowRisk = (item.risk ?? 100) < 40;
              return (
                <motion.div
                  key={`${item.kind}-${item.id}`}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05, duration: 0.25 }}
                  className="relative rounded-md bg-foreground/[0.035] pl-[17px] pr-3.5 py-3.5 overflow-hidden"
                >
                  <span
                    className={clsx(
                      "absolute left-0 top-3 bottom-3 w-[3px] rounded-pill",
                      isQueued ? "bg-watch" : "bg-gold"
                    )}
                  />
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={clsx(
                        "inline-flex items-center gap-1.5 font-mono uppercase tracking-wide text-[10px] font-semibold",
                        isQueued ? "text-watch" : "text-gold"
                      )}
                    >
                      {isQueued ? <Bot className="h-3 w-3" /> : <User className="h-3 w-3" />}
                      {isQueued ? "Agent proposed" : "You proposed"}
                    </span>
                    <span className="font-mono text-[10px] text-muted-foreground/70">{timeAgo(item.time)}</span>
                  </div>
                  <p className="mt-2 font-mono font-bold text-[15px] text-foreground tabular-nums">
                    {formatTokenAmount(item.amount)}{" "}
                    <span className="font-medium text-xs text-muted-foreground">{item.token}</span>
                  </p>
                  <p className="mt-0.5 font-mono text-[11px] text-muted-foreground truncate">
                    → {item.party}
                    {item.meta ? ` · ${item.meta}` : ""}
                  </p>
                  <div className="flex items-start gap-1.5 mt-2.5 pt-2.5 border-t border-border">
                    {lowRisk ? (
                      <CheckCircle2 className="h-3 w-3 shrink-0 mt-0.5 text-safe" />
                    ) : (
                      <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5 text-watch" />
                    )}
                    <span className="text-[11px] leading-snug text-foreground/70">{item.note}</span>
                  </div>
                  <Link
                    href="/requests"
                    className={clsx(
                      "mt-2.5 w-full inline-flex items-center justify-center gap-1.5 py-2.5 rounded-md text-xs font-semibold transition-colors",
                      accent === "watch"
                        ? "bg-watch/[0.14] text-watch hover:bg-watch/20"
                        : "bg-gold/[0.14] text-gold-light hover:bg-gold/20"
                    )}
                  >
                    {isQueued ? "Screen & accept" : "Approve & send"}
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </motion.div>
              );
            })}
            <Link
              href="/requests"
              className="flex items-center justify-center gap-1.5 py-2.5 rounded-md font-mono uppercase tracking-wide text-[11px] text-muted-foreground hover:text-foreground hover:bg-foreground/[0.03] transition-colors"
            >
              {overflow > 0 ? `+${overflow} more · Open full queue` : "Open full queue"}
              <ChevronRight className="h-3 w-3" />
            </Link>
          </>
        )}
      </div>

      {/* Agent decisions */}
      <div className="px-4 pt-[18px] pb-2 flex items-center justify-between">
        <p className="eyebrow text-muted-foreground/70">Agent decisions</p>
        <span className="font-mono uppercase tracking-wide text-[10px] text-muted-foreground/50">Autonomous</span>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto px-3 pb-4 flex flex-col gap-0.5">
        {decisions.length === 0 ? (
          <p className="px-3 py-6 text-center text-xs text-muted-foreground">No decisions yet.</p>
        ) : (
          decisions.map((tx, i) => {
            const rejected = tx.status === "rejected";
            return (
              <motion.div
                key={`${tx.id}-${i}`}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05, duration: 0.3 }}
                className={clsx(
                  "flex items-center gap-3 px-3 py-2.5 rounded-md hover:bg-foreground/[0.03] transition-colors",
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
                  {rejected ? "Blocked" : "Auto-signed"}
                </span>
              </motion.div>
            );
          })
        )}
      </div>
    </aside>
  );
}

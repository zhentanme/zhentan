"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { clsx } from "clsx";
import { ArrowUpRight, ShieldCheck } from "lucide-react";
import { useApiClient } from "@/lib/api/client";
import { useAuth } from "@/app/context/AuthContext";
import { useScreeningStatus } from "@/app/context/ScreeningStatusContext";
import { truncateAddress, statusLabel } from "@/lib/format";
import type { TransactionWithStatus, TransactionStatus } from "@/types";

const SIGNAL: Record<TransactionStatus, { tone: string; dot: string }> = {
  pending: { tone: "text-watch", dot: "bg-watch" },
  in_review: { tone: "text-watch", dot: "bg-watch" },
  executed: { tone: "text-safe", dot: "bg-safe" },
  rejected: { tone: "text-danger", dot: "bg-danger" },
};

export function RightRail() {
  const api = useApiClient();
  const { safeAddress } = useAuth();
  const { isScreeningActive } = useScreeningStatus();
  const [queued, setQueued] = useState(0);
  const [recent, setRecent] = useState<TransactionWithStatus[]>([]);

  const refresh = useCallback(async () => {
    try {
      const r = await api.requests.list();
      setQueued((r.requests || []).filter((x: { status: string }) => x.status === "queued").length);
    } catch {
      /* silent */
    }
    if (!safeAddress) return;
    try {
      const t = await api.transactions.list(safeAddress);
      setRecent((t.transactions || []).slice(0, 6));
    } catch {
      /* silent */
    }
  }, [api, safeAddress]);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 30_000);
    return () => clearInterval(interval);
  }, [refresh]);

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

      {/* Pending review card */}
      <div className="p-4">
        {queued > 0 ? (
          <Link
            href="/requests"
            className="block rounded-md border border-watch/30 bg-watch/8 p-4 transition-colors hover:bg-watch/12"
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-watch">Awaiting your review</span>
              <span className="flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-pill bg-watch text-[11px] font-bold text-ink-900">
                {queued}
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {queued === 1 ? "1 request needs" : `${queued} requests need`} a co-signature.
              <span className="text-watch"> Open →</span>
            </p>
          </Link>
        ) : (
          <div className="relative rounded-md border border-border bg-foreground/[0.02] p-5 flex flex-col items-center text-center overflow-hidden">
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
        )}
      </div>

      {/* Recent decisions */}
      <div className="px-4 pb-2">
        <p className="eyebrow text-muted-foreground/70 mb-1">Recent decisions</p>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto px-3 pb-4">
        {recent.length === 0 ? (
          <p className="px-3 py-6 text-center text-xs text-muted-foreground">No activity yet.</p>
        ) : (
          <div className="space-y-0.5">
            {recent.map((tx, i) => {
              const sig = SIGNAL[tx.status] ?? SIGNAL.pending;
              return (
                <motion.div
                  key={`${tx.to}-${i}`}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05, duration: 0.3 }}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-md hover:bg-foreground/[0.03] transition-colors"
                >
                  <span className={clsx("h-1.5 w-1.5 rounded-pill shrink-0 signal-dot", sig.dot)} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-foreground/90 truncate flex items-center gap-1">
                      <ArrowUpRight className="h-3 w-3 text-muted-foreground shrink-0" />
                      {tx.amount} {tx.token ?? ""}
                    </p>
                    <p className="text-[11px] font-mono text-muted-foreground truncate">
                      {truncateAddress(tx.to, 14)}
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

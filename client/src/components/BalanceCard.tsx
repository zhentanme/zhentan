"use client";

import { motion } from "framer-motion";
import { Skeleton } from "./ui/Skeleton";
import { clsx } from "clsx";
import {
  ArrowUpRight,
  ArrowDownLeft,
  RefreshCw,
  Plug,
  ArrowLeftRight,
  TrendingUp,
  TrendingDown,
  type LucideIcon,
} from "lucide-react";

interface BalanceCardProps {
  portfolioTotalUsd: number | null;
  portfolioPercentChange24h?: number | null;
  safeAddress: string;
  loading: boolean;
  name?: string | null;
  onRefresh?: () => void;
  onToggleSend: () => void;
  onToggleReceive: () => void;
  onToggleConnect?: () => void;
  onToggleSwap?: () => void;
  sendOpen: boolean;
  receiveOpen: boolean;
  connectOpen?: boolean;
  swapOpen?: boolean;
}

export function BalanceCard({
  portfolioTotalUsd,
  portfolioPercentChange24h,
  loading,
  name,
  onRefresh,
  onToggleSend,
  onToggleReceive,
  onToggleConnect,
  onToggleSwap,
  sendOpen,
  receiveOpen,
  connectOpen,
  swapOpen,
}: BalanceCardProps) {
  const displayTotal =
    portfolioTotalUsd != null
      ? portfolioTotalUsd.toLocaleString("en-US", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })
      : "0.00";
  const [intPart, decPart] = displayTotal.split(".");

  const pct = portfolioPercentChange24h;
  const hasDelta = pct != null && !loading;
  const isUp = (pct ?? 0) >= 0;
  // Derive the absolute 24h change from the total + percentage.
  const deltaUsd =
    portfolioTotalUsd != null && pct != null
      ? portfolioTotalUsd - portfolioTotalUsd / (1 + pct / 100)
      : null;
  const deltaUsdStr =
    deltaUsd != null
      ? Math.abs(deltaUsd).toLocaleString("en-US", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })
      : null;

  const greeting = name?.trim() ? `gm, ${name.trim()}` : "gm";

  const actions: { label: string; icon: LucideIcon; onClick: () => void; active: boolean }[] = [
    { label: "Send", icon: ArrowUpRight, onClick: onToggleSend, active: sendOpen },
    { label: "Receive", icon: ArrowDownLeft, onClick: onToggleReceive, active: receiveOpen },
    ...(onToggleSwap
      ? [{ label: "Swap", icon: ArrowLeftRight, onClick: onToggleSwap, active: !!swapOpen }]
      : []),
    ...(onToggleConnect
      ? [{ label: "Connect", icon: Plug, onClick: onToggleConnect, active: !!connectOpen }]
      : []),
  ];

  return (
    <div>
      {/* Hero balance — left aligned */}
      <section className="pb-6 sm:pb-7 border-b border-border">
        <motion.div
          className="flex items-center justify-between gap-3"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1 }}
        >
          <span className="flex items-center gap-2.5 eyebrow text-muted-foreground">
            <span className="h-px w-6 bg-gold/60" aria-hidden />
            {greeting}
          </span>
          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              disabled={loading}
              aria-label="Refresh"
              className="p-2 -mr-2 rounded-md text-muted-foreground/70 hover:text-foreground hover:bg-foreground/8 transition-colors disabled:opacity-40 cursor-pointer disabled:cursor-default"
            >
              <RefreshCw className={clsx("h-4 w-4", loading && "animate-spin")} />
            </button>
          )}
        </motion.div>

        {loading ? (
          <Skeleton className="mt-3.5 h-14 w-56 rounded-lg" />
        ) : (
          <motion.div
            className="mt-3 flex items-end leading-[0.95] tracking-[-0.04em]"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15, type: "spring", bounce: 0.15, duration: 0.5 }}
          >
            <span className="text-5xl sm:text-6xl font-bold text-foreground tabular-nums">
              ${intPart}
            </span>
            {decPart && (
              <span className="text-3xl sm:text-4xl font-medium text-gold-300 tabular-nums">
                .{decPart}
              </span>
            )}
          </motion.div>
        )}

        {hasDelta && (
          <motion.div
            className="mt-3.5 flex items-center gap-3 font-mono text-xs"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.25 }}
          >
            <span className={clsx("flex items-center gap-1.5 tabular-nums", isUp ? "text-safe" : "text-danger")}>
              {isUp ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
              {deltaUsdStr && <span>{isUp ? "+" : "-"}${deltaUsdStr}</span>}
              <span>· {isUp ? "+" : ""}{pct!.toFixed(2)}%</span>
            </span>
            <span className="eyebrow text-muted-foreground/60">24 hours</span>
          </motion.div>
        )}
      </section>

      {/* Action quad bar */}
      <motion.div
        className="mt-5 grid grid-cols-4 divide-x divide-border rounded-md border border-border bg-foreground/[0.02] overflow-hidden"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, type: "spring", bounce: 0.1, duration: 0.4 }}
      >
        {actions.map((action) => (
          <button
            key={action.label}
            type="button"
            onClick={action.onClick}
            className={clsx(
              "group flex flex-col items-center gap-2.5 py-4 px-2 transition-colors touch-manipulation cursor-pointer",
              action.active ? "bg-gold/[0.06]" : "hover:bg-foreground/[0.03]"
            )}
          >
            <span
              className={clsx(
                "w-9 h-9 rounded-md flex items-center justify-center border transition-colors",
                action.active
                  ? "bg-gold/15 border-gold/40 text-gold"
                  : "bg-foreground/[0.03] border-border text-muted-foreground group-hover:border-gold/30 group-hover:text-gold"
              )}
            >
              <action.icon className="h-4 w-4" />
            </span>
            <span
              className={clsx(
                "text-xs font-medium",
                action.active ? "text-gold" : "text-muted-foreground group-hover:text-foreground"
              )}
            >
              {action.label}
            </span>
          </button>
        ))}
      </motion.div>
    </div>
  );
}

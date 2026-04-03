"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Skeleton } from "./ui/Skeleton";
import { truncateAddress } from "@/lib/format";
import { ArrowUpRight, ArrowDownLeft, Copy, Check, RefreshCw, Plug, ArrowLeftRight } from "lucide-react";

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
  safeAddress,
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
  const [copied, setCopied] = useState(false);
  const displayTotal =
    portfolioTotalUsd != null
      ? portfolioTotalUsd.toLocaleString("en-US", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })
      : null;

  const copyAddress = async () => {
    await navigator.clipboard.writeText(safeAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const greeting = name?.trim() ? `gm, ${name.trim()}` : "gm";

  const actions = [
    {
      label: "Send",
      icon: ArrowUpRight,
      onClick: onToggleSend,
      active: sendOpen,
    },
    {
      label: "Receive",
      icon: ArrowDownLeft,
      onClick: onToggleReceive,
      active: receiveOpen,
    },
    ...(onToggleSwap
      ? [
          {
            label: "Swap",
            icon: ArrowLeftRight,
            onClick: onToggleSwap,
            active: swapOpen,
          },
        ]
      : []),
    ...(onToggleConnect
      ? [
          {
            label: "Connect",
            icon: Plug,
            onClick: onToggleConnect,
            active: connectOpen,
          },
        ]
      : []),
  ];

  return (
    <motion.div
      className="flex flex-col items-center text-center px-4 pt-2 pb-6 sm:pt-4 sm:pb-8 gap-4"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, type: "spring", bounce: 0.15 }}
    >
      {/* Greeting */}
      <motion.p
        className="text-sm font-medium text-slate-400 mb-1"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.1 }}
      >
        {greeting}
      </motion.p>

      {/* Balance */}
      <div className="flex items-center gap-2">
        {loading ? (
          <Skeleton className="h-12 w-44 rounded-2xl" />
        ) : (
          <motion.h1
            className="text-5xl sm:text-6xl font-bold gradient-text tracking-tight"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.15, duration: 0.5 }}
          >
            ${displayTotal ?? "0.00"}
          </motion.h1>
        )}
        {onRefresh && (
          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            aria-label="Refresh"
            className="p-2 rounded-full text-slate-500 hover:text-white hover:bg-white/8 transition-colors disabled:opacity-40 cursor-pointer disabled:cursor-default"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        )}
      </div>

      {/* 24h change */}
      {portfolioPercentChange24h != null && !loading && (
        <motion.div
          className="flex items-center gap-1.5"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.25 }}
        >
          <span
            className={`text-sm font-semibold tabular-nums ${
              portfolioPercentChange24h > 0
                ? "text-emerald-400"
                : portfolioPercentChange24h < 0
                  ? "text-red-400"
                  : "text-slate-500"
            }`}
          >
            {portfolioPercentChange24h > 0 ? "+" : ""}
            {portfolioPercentChange24h.toFixed(2)}%
          </span>
          <span className="text-xs text-slate-600">24h</span>
        </motion.div>
      )}
      {/* {(portfolioPercentChange24h == null || loading) && <div className="h-4 mb-4" />} */}

      {/* Address chip */}
      <button
        onClick={copyAddress}
        className="flex items-center gap-1.5 rounded-full bg-white/6 border border-white/6 px-3 py-1.5 mb-4 hover:bg-white/10 transition-all touch-manipulation cursor-pointer"
      >
        <span className="text-xs font-mono text-slate-500">
          {truncateAddress(safeAddress)}
        </span>
        {copied ? (
          <Check className="h-3 w-3 text-gold" />
        ) : (
          <Copy className="h-3 w-3 text-slate-500" />
        )}
      </button>

      {/* Action buttons */}
      <motion.div
        className="flex items-center justify-center gap-6 sm:gap-8"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3, duration: 0.4 }}
      >
        {actions.map((action) => (
          <button
            key={action.label}
            type="button"
            onClick={action.onClick}
            className="flex flex-col items-center gap-2 group touch-manipulation cursor-pointer"
          >
            <div
              className={`w-14 h-14 sm:w-16 sm:h-16 rounded-2xl flex items-center justify-center transition-all ${
                action.active
                  ? "bg-gold text-black shadow-[0_4px_24px_-4px_rgba(229,168,50,0.5)]"
                  : "bg-white/[0.07] text-slate-300 group-hover:bg-white/12 group-hover:text-white border border-white/6"
              }`}
            >
              <action.icon className="h-6 w-6" />
            </div>
            <span
              className={`text-xs font-medium ${
                action.active ? "text-gold" : "text-slate-400"
              }`}
            >
              {action.label}
            </span>
          </button>
        ))}
      </motion.div>
    </motion.div>
  );
}

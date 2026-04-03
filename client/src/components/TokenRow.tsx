"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import type { TokenPosition } from "@/types";
import { formatTokenAmount } from "@/lib/format";
import { CheckCircle2 } from "lucide-react";

interface TokenRowProps {
  token: TokenPosition;
  index?: number;
  selected?: boolean;
  onClick?: () => void;
}

function formatUsd(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(2)}K`;
  return `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function TokenRow({ token, index = 0, selected, onClick, hideZeroBalance = false }: TokenRowProps & { hideZeroBalance?: boolean }) {
  const usdStr = token.usdValue != null ? formatUsd(token.usdValue) : null;
  const balanceNum = parseFloat(token.balance) || 0;
  const balanceStr = formatTokenAmount(token.balance);
  const showBalance = hideZeroBalance ? balanceNum > 0 : true;

  const row = (
    <motion.div
      className={`flex items-center gap-3 px-4 py-3.5 transition-colors ${
        onClick ? "cursor-pointer active:bg-white/4" : ""
      } hover:bg-white/3 ${selected ? "bg-gold/[0.06]" : ""} ${!hideZeroBalance && token.placeholder ? "opacity-35" : ""}`}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: hideZeroBalance ? 1 : token.placeholder ? 0.35 : 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.35, type: "spring", bounce: 0.1 }}
    >
      {/* Token icon */}
      <div className="w-10 h-10 rounded-xl bg-white/6 flex items-center justify-center shrink-0 overflow-hidden">
        {token.iconUrl ? (
          <Image
            src={token.iconUrl}
            alt=""
            width={40}
            height={40}
            className="object-cover w-full h-full"
            unoptimized
          />
        ) : (
          <span className="text-xs font-bold text-gold">
            {token.symbol.slice(0, 2)}
          </span>
        )}
      </div>

      {/* Name + symbol */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-semibold text-white truncate">
            {token.name}
          </span>
          {token.verified && (
            <CheckCircle2 className="h-3.5 w-3.5 text-gold shrink-0" />
          )}
        </div>
        {showBalance && (
          <p className="text-xs text-slate-500 mt-0.5">
            {balanceStr} {token.symbol}
          </p>
        )}
      </div>

      {/* Value */}
      <div className="shrink-0 text-right flex items-center gap-2">
        {usdStr != null ? (
          <span className="text-sm font-semibold text-white tabular-nums">{usdStr}</span>
        ) : token.placeholder ? (
          <span className="text-sm font-semibold text-white tabular-nums">$0</span>
        ) : !hideZeroBalance ? (
          <span className="text-sm text-slate-500 tabular-nums">
            {balanceStr} {token.symbol}
          </span>
        ) : null}
        {selected && (
          <CheckCircle2 className="h-5 w-5 text-gold shrink-0" />
        )}
      </div>
    </motion.div>
  );

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className="w-full text-left">
        {row}
      </button>
    );
  }
  return row;
}

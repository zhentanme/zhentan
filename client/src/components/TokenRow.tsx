"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import type { TokenPosition } from "@/types";
import { formatTokenAmount } from "@/lib/format";
import { CheckCircle2 } from "lucide-react";
import { clsx } from "clsx";

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

function formatPrice(value: number): string {
  if (value === 0) return "$0";
  if (value < 0.01) return `$${value.toPrecision(2)}`;
  if (value >= 1000) return `$${value.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  return `$${value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function TokenRow({ token, index = 0, selected, onClick, hideZeroBalance = false }: TokenRowProps & { hideZeroBalance?: boolean }) {
  const usdStr = token.usdValue != null ? formatUsd(token.usdValue) : token.placeholder ? "$0" : null;
  const balanceNum = parseFloat(token.balance) || 0;
  const balanceStr = formatTokenAmount(token.balance);
  const showBalance = hideZeroBalance ? balanceNum > 0 : true;

  const row = (
    <motion.div
      className={clsx(
        "grid items-center gap-4 sm:gap-8 px-4 sm:px-6 py-4 transition-colors",
        "grid-cols-[2.5rem_minmax(0,1fr)_auto] sm:grid-cols-[2.5rem_minmax(0,1.6fr)_minmax(0,1fr)_auto]",
        onClick && "cursor-pointer active:bg-foreground/[0.04]",
        "hover:bg-foreground/[0.025]",
        selected && "bg-gold/[0.06]",
        !hideZeroBalance && token.placeholder && "opacity-35"
      )}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: hideZeroBalance ? 1 : token.placeholder ? 0.35 : 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.35, type: "spring", bounce: 0.1 }}
    >
      {/* Token icon */}
      <div className="w-10 h-10 rounded-pill bg-foreground/6 flex items-center justify-center shrink-0 overflow-hidden">
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
          <span className="text-xs font-bold text-gold">{token.symbol.slice(0, 2)}</span>
        )}
      </div>

      {/* Name + symbol */}
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-semibold text-foreground truncate">{token.name}</span>
          {token.verified && <CheckCircle2 className="h-3.5 w-3.5 text-gold shrink-0" />}
        </div>
        <p className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground/80 mt-0.5">
          {token.symbol}
        </p>
      </div>

      {/* Holdings + unit price (own column on desktop) */}
      {showBalance ? (
        <div className="hidden sm:flex flex-col min-w-0">
          <span className="text-[13px] font-mono text-foreground/90 tabular-nums truncate">
            {balanceStr}
          </span>
          <span className="text-[11px] font-mono text-muted-foreground/70 tabular-nums mt-0.5">
            {formatPrice(token.price)}
          </span>
        </div>
      ) : (
        <div className="hidden sm:block" />
      )}

      {/* USD value */}
      <div className="flex flex-col items-end min-w-[3.5rem]">
        <div className="flex items-center gap-2">
          {selected && <CheckCircle2 className="h-4 w-4 text-gold shrink-0" />}
          {usdStr != null ? (
            <span className="text-sm font-mono font-semibold text-foreground tabular-nums">{usdStr}</span>
          ) : (
            <span className="text-sm font-mono text-muted-foreground/80 tabular-nums">
              {balanceStr} {token.symbol}
            </span>
          )}
        </div>
        {showBalance && usdStr != null && (
          <span className="sm:hidden text-[11px] font-mono text-muted-foreground/70 tabular-nums mt-0.5">
            {balanceStr} {token.symbol}
          </span>
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

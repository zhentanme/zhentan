"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import type { TransactionWithStatus } from "@/types";
import { truncateAddress, formatDate } from "@/lib/format";
import { StatusBadge } from "./StatusBadge";
import { UsdcIcon } from "./icons/UsdcIcon";
import { ArrowUpRight, ArrowDownLeft } from "lucide-react";

interface TransactionRowProps {
  tx: TransactionWithStatus;
  index?: number;
  onClick?: () => void;
}

function TokenIcon({
  symbol,
  iconUrl,
  size = 16,
}: {
  symbol: string;
  iconUrl?: string | null;
  size?: number;
}) {
  if (iconUrl) {
    return (
      <span className="relative shrink-0 rounded-full overflow-hidden bg-white/10" style={{ width: size, height: size }}>
        <Image src={iconUrl} alt="" width={size} height={size} className="object-cover" unoptimized />
      </span>
    );
  }
  return (
    <span
      className="shrink-0 rounded-full bg-white/10 flex items-center justify-center text-[10px] font-bold text-gold"
      style={{ width: size, height: size }}
    >
      {(symbol || "??").slice(0, 2)}
    </span>
  );
}

export function TransactionRow({ tx, index = 0, onClick }: TransactionRowProps) {
  const isReceive = tx.direction === "receive";
  const DirectionIcon = isReceive ? ArrowDownLeft : ArrowUpRight;
  const isUsdc = tx.token?.toUpperCase() === "USDC";
  const showUsdcIcon = isUsdc && !tx.tokenIconUrl;

  return (
    <motion.div
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={onClick ? (e) => e.key === "Enter" && onClick() : undefined}
      className={`flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-white/3 ${
        onClick ? "cursor-pointer active:bg-white/4" : ""
      } touch-manipulation`}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05, duration: 0.35, type: "spring", bounce: 0.1 }}
    >
      {/* Direction icon */}
      <div
        className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
          isReceive ? "bg-emerald-400/10 text-emerald-400" : "bg-white/6 text-slate-400"
        }`}
      >
        <DirectionIcon className="h-5 w-5" />
      </div>

      {/* Details */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          {tx.dappMetadata ? (
            <span className="text-sm font-semibold text-white truncate inline-flex items-center gap-1.5">
              {tx.dappMetadata.icons?.[0] ? (
                <img
                  src={tx.dappMetadata.icons[0]}
                  alt=""
                  className="w-4 h-4 rounded shrink-0 bg-white/10 object-cover"
                />
              ) : null}
              <span className="truncate">
                {tx.dappMetadata.name.length > 20
                  ? `${tx.dappMetadata.name.slice(0, 20)}...`
                  : tx.dappMetadata.name}
              </span>
            </span>
          ) : (
            <span className="text-sm font-semibold text-white truncate inline-flex items-center gap-1.5">
              {isReceive ? "Received" : "Sent"}{" "}
              {tx.amount} {tx.token}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 mt-0.5">
          {!tx.dappMetadata && (
            <>
              <span className="text-xs text-slate-500">
                {isReceive ? "from" : "to"} {truncateAddress(tx.to)}
              </span>
              <span className="text-slate-700">·</span>
            </>
          )}
          <span className="text-xs text-slate-600">
            {formatDate(tx.proposedAt)}
          </span>
        </div>
      </div>

      {/* Status */}
      <StatusBadge status={tx.status} />
    </motion.div>
  );
}

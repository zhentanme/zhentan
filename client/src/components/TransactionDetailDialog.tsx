"use client";

import { useState } from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import type { TransactionWithStatus } from "@/types";
import { truncateAddress, formatDate, statusLabel } from "@/lib/format";
import { Dialog } from "./ui/Dialog";
import { UsdcIcon } from "./icons/UsdcIcon";
import { ArrowUpRight, ArrowDownLeft, Clock, Search, XCircle, ExternalLink, ChevronDown, ChevronUp, ShieldAlert } from "lucide-react";
import { BSC_EXPLORER_URL } from "@/lib/constants";

interface TransactionDetailDialogProps {
  tx: TransactionWithStatus | null;
  open: boolean;
  onClose: () => void;
}

function RiskDetailsSection({
  riskScore,
  riskVerdict,
  riskReasons,
}: {
  riskScore?: number;
  riskVerdict?: "APPROVE" | "REVIEW" | "BLOCK";
  riskReasons?: string[];
}) {
  const [expanded, setExpanded] = useState(false);
  const reasonCount = riskReasons?.length ?? 0;
  const summary =
    riskScore != null
      ? reasonCount > 0
        ? `Risk: ${riskScore} — ${reasonCount} reason${reasonCount === 1 ? "" : "s"}`
        : `Risk score: ${riskScore}`
      : reasonCount > 0
        ? `${reasonCount} risk reason${reasonCount === 1 ? "" : "s"}`
        : "Risk details";

  return (
    <div className="rounded-2xl bg-white/6 overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-center gap-2 px-4 py-3 text-left hover:bg-white/6 transition-colors"
      >
        <ShieldAlert className="h-4 w-4 text-amber-400/90 shrink-0" />
        <span className="text-sm font-medium text-slate-200 flex-1">{summary}</span>
        {expanded ? (
          <ChevronUp className="h-4 w-4 text-slate-500 shrink-0" />
        ) : (
          <ChevronDown className="h-4 w-4 text-slate-500 shrink-0" />
        )}
      </button>
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="border-t border-white/10"
          >
            <div className="px-4 py-3 space-y-2 text-sm">
              {riskScore != null && (
                <div className="flex justify-between gap-2">
                  <span className="text-slate-500">Score</span>
                  <span className="text-slate-200 font-medium">{riskScore}/100</span>
                </div>
              )}
              {riskVerdict && (
                <div className="flex justify-between gap-2">
                  <span className="text-slate-500">Verdict</span>
                  <span
                    className={`font-medium ${
                      riskVerdict === "APPROVE"
                        ? "text-emerald-400"
                        : riskVerdict === "BLOCK"
                          ? "text-red-400"
                          : "text-amber-400"
                    }`}
                  >
                    {riskVerdict}
                  </span>
                </div>
              )}
              {riskReasons && riskReasons.length > 0 && (
                <div>
                  <span className="text-slate-500 block mb-1">Reasons</span>
                  <ul className="list-disc list-inside space-y-0.5 text-slate-300">
                    {riskReasons.map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function StatusAnimation({ status }: { status: TransactionWithStatus["status"] }) {
  const common = "rounded-2xl flex items-center justify-center";
  const size = "w-20 h-20";

  switch (status) {
    case "pending":
      return (
        <motion.div
          className={`${size} ${common} bg-amber-400/15 text-amber-400`}
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{
            scale: 1,
            opacity: 1,
            rotate: [0, 5, -5, 0],
          }}
          transition={{
            opacity: { duration: 0.3 },
            scale: { type: "spring", bounce: 0.4 },
            rotate: { repeat: Infinity, duration: 2, ease: "easeInOut" },
          }}
        >
          <Clock className="h-10 w-10" />
        </motion.div>
      );
    case "in_review":
      return (
        <motion.div
          className={`${size} ${common} bg-gold/15 text-gold`}
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{
            scale: [1, 1.05, 1],
            opacity: 1,
          }}
          transition={{
            opacity: { duration: 0.3 },
            scale: {
              repeat: Infinity,
              duration: 1.5,
              ease: "easeInOut",
            },
          }}
        >
          <Search className="h-10 w-10" />
        </motion.div>
      );
    case "executed":
      return (
        <motion.div
          className={`${size} ${common} bg-emerald-500/20 text-gold`}
          initial={{ scale: 0, opacity: 0 }}
          animate={{
            scale: [0, 1.2, 1],
            opacity: 1,
          }}
          transition={{
            duration: 0.5,
            scale: {
              times: [0, 0.6, 1],
              duration: 0.5,
            },
          }}
        >
          <span className="relative w-12 h-12 flex items-center justify-center">
            <Image src="/bsc-yellow.png" alt="BNB Chain" width={48} height={48} className="object-contain" />
          </span>
        </motion.div>
      );
    case "rejected":
      return (
        <motion.div
          className={`${size} ${common} bg-red-400/15 text-red-400`}
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{
            scale: 1,
            opacity: 1,
            x: [0, -6, 6, -4, 4, 0],
          }}
          transition={{
            opacity: { duration: 0.3 },
            scale: { type: "spring", bounce: 0.3 },
            x: { duration: 0.4 },
          }}
        >
          <XCircle className="h-10 w-10" />
        </motion.div>
      );
  }
}

export function TransactionDetailDialog({ tx, open, onClose }: TransactionDetailDialogProps) {
  if (!tx) return null;

  const isReceive = tx.direction === "receive";
  const DirectionIcon = isReceive ? ArrowDownLeft : ArrowUpRight;
  const explorerTxUrl = tx.txHash ? `${BSC_EXPLORER_URL}/tx/${tx.txHash}` : null;

  return (
    <Dialog open={open} onClose={onClose} title="Transaction details" className="max-w-md">
      <div className="space-y-6">
        {/* Status animation */}
        <div className="flex flex-col items-center gap-3">
          <StatusAnimation status={tx.status} />
          <span
            className={`text-sm font-semibold ${
              tx.status === "executed"
                ? "text-gold"
                : tx.status === "rejected"
                  ? "text-red-400"
                  : tx.status === "in_review"
                    ? "text-gold"
                    : "text-amber-400"
            }`}
          >
            {statusLabel(tx.status)}
          </span>
        </div>

        {/* Amount row */}
        <div className="flex items-center gap-3 rounded-2xl bg-white/6 p-4">
          <div className="w-10 h-10 rounded-2xl bg-white/[0.08] flex items-center justify-center text-gold">
            <DirectionIcon className="h-5 w-5" />
          </div>
          {tx.tokenIconUrl ? (
            <span className="relative w-8 h-8 shrink-0 rounded-full overflow-hidden bg-white/10">
              <Image src={tx.tokenIconUrl} alt="" width={32} height={32} className="object-cover" unoptimized />
            </span>
          ) : tx.token === "BNB" ? (
            <span className="relative w-8 h-8 shrink-0 flex items-center justify-center">
              <Image src="/bsc-yellow.png" alt="" width={32} height={32} className="object-contain" />
            </span>
          ) : (
            <UsdcIcon size={24} className="shrink-0 opacity-90" />
          )}
          <span className="text-lg font-semibold text-white">
            {tx.amount} {tx.token}
          </span>
        </div>

        {/* Details list */}
        <dl className="space-y-3 text-sm min-w-0">
          <div className="flex justify-between gap-2 sm:gap-4">
            <dt className="text-slate-500 shrink-0">To</dt>
            <dd className="font-mono text-slate-200 truncate min-w-0 max-w-[50%] sm:max-w-[200px]" title={tx.to}>
              {truncateAddress(tx.to)}
            </dd>
          </div>
          {tx.dappMetadata && (
            <div className="flex justify-between gap-2 sm:gap-4 items-center">
              <dt className="text-slate-500 shrink-0">DApp</dt>
              <dd className="flex items-center gap-2 min-w-0 max-w-[50%] sm:max-w-[200px]">
                {tx.dappMetadata.icons?.[0] ? (
                  <img
                    src={tx.dappMetadata.icons[0]}
                    alt=""
                    className="w-5 h-5 rounded-md shrink-0 bg-white/10"
                  />
                ) : null}
                <span className="text-slate-300 truncate" title={tx.dappMetadata.url}>
                  {tx.dappMetadata.name}
                </span>
              </dd>
            </div>
          )}
          <div className="flex justify-between gap-2 sm:gap-4">
            <dt className="text-slate-500 shrink-0">Proposed</dt>
            <dd className="text-slate-300 truncate min-w-0">{formatDate(tx.proposedAt)}</dd>
          </div>
          <div className="flex justify-between gap-2 sm:gap-4">
            <dt className="text-slate-500 shrink-0">Signatures</dt>
            <dd className="text-slate-300">
              { tx.txHash ? tx.threshold : tx.signatures.length } of {tx.threshold}
            </dd>
          </div>
          {tx.executedAt && (
            <div className="flex justify-between gap-2 sm:gap-4">
              <dt className="text-slate-500 shrink-0">Executed</dt>
              <dd className="text-slate-300 truncate min-w-0">{formatDate(tx.executedAt)}</dd>
            </div>
          )}
          {tx.rejectReason && (
            <div className="flex justify-between gap-2 sm:gap-4">
              <dt className="text-slate-500 shrink-0">Reason</dt>
              <dd className="text-red-400 truncate min-w-0">{tx.rejectReason}</dd>
            </div>
          )}
        </dl>

        {/* Risk details (when in review and risk data present) */}
        {(tx.inReview || tx.status === "in_review") &&
          (tx.riskScore != null || (tx.riskReasons && tx.riskReasons.length > 0)) && (
          <RiskDetailsSection
            riskScore={tx.riskScore}
            riskVerdict={tx.riskVerdict}
            riskReasons={tx.riskReasons}
          />
        )}

        {/* Explorer link */}
        {explorerTxUrl && (
          <motion.a
            href={explorerTxUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full rounded-2xl py-3 bg-white/[0.08] text-slate-300 hover:text-white hover:bg-white/12 transition-colors text-sm font-medium"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <span className="relative w-[18px] h-[18px] shrink-0">
              <Image src="/bscscan.png" alt="" fill className="object-contain rounded" sizes="18px" />
            </span>
            <ExternalLink className="h-4 w-4" />
            View on BSC Explorer
          </motion.a>
        )}
      </div>
    </Dialog>
  );
}

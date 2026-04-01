"use client";

import { motion } from "framer-motion";
import type { QueuedInvoice } from "@/types";
import { truncateAddress } from "@/lib/format";
import { UsdcIcon } from "./icons/UsdcIcon";
import { FileText } from "lucide-react";
import { clsx } from "clsx";

interface InvoiceRowProps {
  invoice: QueuedInvoice;
  index?: number;
  onClick?: () => void;
}

function RiskBadge({ score }: { score: number }) {
  const color =
    score < 40
      ? "bg-gold/15 text-gold"
      : score <= 70
        ? "bg-amber-400/15 text-amber-400"
        : "bg-red-400/15 text-red-400";

  return (
    <span
      className={clsx(
        "inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium",
        color
      )}
    >
      Risk {score}
    </span>
  );
}

function InvoiceStatusBadge({ status }: { status: QueuedInvoice["status"] }) {
  const styles: Record<QueuedInvoice["status"], string> = {
    queued: "bg-amber-400/15 text-amber-400",
    approved: "bg-gold/15 text-gold",
    executed: "bg-gold/15 text-gold",
    rejected: "bg-red-400/15 text-red-400",
  };

  const labels: Record<QueuedInvoice["status"], string> = {
    queued: "Queued",
    approved: "Approved",
    executed: "Executed",
    rejected: "Rejected",
  };

  return (
    <span
      className={clsx(
        "inline-flex items-center px-3 py-1 rounded-full text-xs font-medium",
        styles[status]
      )}
    >
      {labels[status]}
    </span>
  );
}

export function InvoiceRow({ invoice, index = 0, onClick }: InvoiceRowProps) {
  return (
    <motion.div
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={onClick ? (e) => e.key === "Enter" && onClick() : undefined}
      className={clsx(
        "flex items-center gap-3 sm:gap-4 px-3 sm:px-4 py-3 hover:bg-white/6 rounded-2xl transition-all min-h-[3.5rem] touch-manipulation",
        onClick && "cursor-pointer"
      )}
      initial={{ opacity: 0, y: 30, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{
        delay: index * 0.1,
        duration: 0.5,
        type: "spring",
        bounce: 0.15,
      }}
    >
      <div className="w-10 h-10 rounded-2xl bg-white/8 flex items-center justify-center shrink-0 text-gold">
        <FileText className="h-5 w-5" />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-slate-200 truncate inline-flex items-center gap-1.5">
            <UsdcIcon size={16} className="shrink-0 opacity-90" />
            {invoice.amount} {invoice.token}
          </span>
          <span className="text-slate-600">←</span>
          <span className="text-sm text-slate-400 truncate">
            {invoice.billedFrom?.name || truncateAddress(invoice.to)}
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500 mt-0.5">
          {invoice.invoiceNumber && <span>{invoice.invoiceNumber}</span>}
          {invoice.dueDate && <span>Due {invoice.dueDate}</span>}
          {invoice.riskScore != null && <RiskBadge score={invoice.riskScore} />}
        </div>
      </div>

      <div className="shrink-0">
        <InvoiceStatusBadge status={invoice.status} />
      </div>
    </motion.div>
  );
}

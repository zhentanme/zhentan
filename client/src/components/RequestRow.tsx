"use client";

import { motion } from "framer-motion";
import type { QueuedRequest } from "@/types";
import { truncateAddress } from "@/lib/format";
import { UsdcIcon } from "./icons/UsdcIcon";
import { FileText, ArrowUpRight } from "lucide-react";
import { clsx } from "clsx";

interface RequestRowProps {
  request: QueuedRequest;
  index?: number;
  onClick?: () => void;
}

function RiskBadge({ score }: { score: number }) {
  const color =
    score < 40
      ? "bg-safe/15 text-safe"
      : score <= 70
        ? "bg-watch/15 text-watch"
        : "bg-danger/15 text-danger";

  return (
    <span
      className={clsx(
        "inline-flex items-center px-2 py-0.5 rounded-pill text-[10px] font-mono uppercase tracking-wide",
        color
      )}
    >
      Risk {score}
    </span>
  );
}

function RequestStatusBadge({ status }: { status: QueuedRequest["status"] }) {
  const styles: Record<QueuedRequest["status"], string> = {
    queued: "bg-watch/15 text-watch",
    approved: "bg-safe/15 text-safe",
    executed: "bg-safe/15 text-safe",
    rejected: "bg-danger/15 text-danger",
  };

  const labels: Record<QueuedRequest["status"], string> = {
    queued: "Queued",
    approved: "Approved",
    executed: "Executed",
    rejected: "Rejected",
  };

  return (
    <span
      className={clsx(
        "inline-flex items-center px-3 py-1 rounded-pill text-[11px] font-mono uppercase tracking-wider",
        styles[status]
      )}
    >
      {labels[status]}
    </span>
  );
}

export function RequestRow({ request, index = 0, onClick }: RequestRowProps) {
  const isInvoice = request.type === "invoice";

  return (
    <motion.div
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={onClick ? (e) => e.key === "Enter" && onClick() : undefined}
      className={clsx(
        "flex items-center gap-3 sm:gap-4 px-3 sm:px-4 py-3 hover:bg-foreground/6 rounded-2xl transition-all min-h-[3.5rem] touch-manipulation",
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
      <div className="w-10 h-10 rounded-2xl bg-foreground/8 flex items-center justify-center shrink-0 text-gold">
        {isInvoice ? <FileText className="h-5 w-5" /> : <ArrowUpRight className="h-5 w-5" />}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-foreground truncate inline-flex items-center gap-1.5">
            <UsdcIcon size={16} className="shrink-0 opacity-90" />
            {request.amount} {request.token}
          </span>
          <span className="text-muted-foreground/60">{isInvoice ? "←" : "→"}</span>
          <span className="text-sm text-muted-foreground truncate">
            {request.billedFrom?.name || truncateAddress(request.to)}
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground/80 mt-0.5">
          {isInvoice ? (
            <>
              {request.invoiceNumber && <span>{request.invoiceNumber}</span>}
              {request.dueDate && <span>Due {request.dueDate}</span>}
            </>
          ) : (
            request.description && (
              <span className="truncate max-w-[220px]">{request.description}</span>
            )
          )}
          {request.riskScore != null && <RiskBadge score={request.riskScore} />}
        </div>
      </div>

      <div className="shrink-0">
        <RequestStatusBadge status={request.status} />
      </div>
    </motion.div>
  );
}

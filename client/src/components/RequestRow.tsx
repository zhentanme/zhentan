"use client";

import { motion } from "framer-motion";
import type { QueuedRequest } from "@/types";
import { truncateAddress, riskSeverity } from "@/lib/format";
import { TokenGlyph } from "./TokenGlyph";
import { Pill, type PillTone } from "./ui/Pill";
import { FileText, ArrowUpRight } from "lucide-react";
import { clsx } from "clsx";

interface RequestRowProps {
  request: QueuedRequest;
  index?: number;
  onClick?: () => void;
}

function RiskBadge({ score }: { score: number }) {
  const sev = riskSeverity(score) ?? "neutral";
  return (
    <Pill tone={sev} size="sm" strong={sev === "watch" || sev === "danger"}>
      Risk {score}
    </Pill>
  );
}

const REQUEST_STATUS_TONE: Record<QueuedRequest["status"], PillTone> = {
  queued: "watch",
  approved: "safe",
  executed: "safe",
  rejected: "danger",
};

const REQUEST_STATUS_LABEL: Record<QueuedRequest["status"], string> = {
  queued: "Queued",
  approved: "Approved",
  executed: "Executed",
  rejected: "Rejected",
};

function RequestStatusBadge({ status }: { status: QueuedRequest["status"] }) {
  return (
    <Pill tone={REQUEST_STATUS_TONE[status]} strong={status === "rejected"}>
      {REQUEST_STATUS_LABEL[status]}
    </Pill>
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
        "group flex items-center gap-3 sm:gap-4 px-2 sm:px-3 py-3.5 hover:bg-foreground/[0.035] transition-colors min-h-[3.5rem] touch-manipulation",
        onClick && "cursor-pointer"
      )}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        delay: Math.min(index, 8) * 0.05,
        duration: 0.4,
        type: "spring",
        bounce: 0.15,
      }}
    >
      <div className="w-10 h-10 rounded-md bg-foreground/8 flex items-center justify-center shrink-0 text-gold transition-colors group-hover:bg-foreground/[0.12]">
        {isInvoice ? <FileText className="h-5 w-5" /> : <ArrowUpRight className="h-5 w-5" />}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-foreground truncate inline-flex items-center gap-1.5">
            <TokenGlyph symbol={request.token} size={16} />
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

import { clsx } from "clsx";
import type { TransactionStatus } from "@/types";
import { statusLabel } from "@/lib/format";

interface StatusBadgeProps {
  status: TransactionStatus;
}

const styleMap: Record<TransactionStatus, string> = {
  pending: "bg-watch/15 text-watch",
  in_review: "bg-watch/15 text-watch",
  confirming: "bg-safe/10 text-safe",
  executed: "bg-safe/15 text-safe",
  rejected: "bg-danger/15 text-danger",
};

export function StatusBadge({ status }: StatusBadgeProps) {
  return (
    <span
      className={clsx(
        "inline-flex items-center px-3 py-1 rounded-pill text-[11px] font-mono uppercase tracking-wider",
        styleMap[status]
      )}
    >
      {statusLabel(status)}
    </span>
  );
}

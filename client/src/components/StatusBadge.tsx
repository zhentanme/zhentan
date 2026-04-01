import { clsx } from "clsx";
import type { TransactionStatus } from "@/types";
import { statusLabel } from "@/lib/format";

interface StatusBadgeProps {
  status: TransactionStatus;
}

const styleMap: Record<TransactionStatus, string> = {
  pending: "bg-amber-400/15 text-amber-400",
  in_review: "bg-gold/15 text-gold",
  executed: "bg-gold/15 text-gold",
  rejected: "bg-red-400/15 text-red-400",
};

export function StatusBadge({ status }: StatusBadgeProps) {
  return (
    <span
      className={clsx(
        "inline-flex items-center px-3 py-1 rounded-full text-xs font-medium",
        styleMap[status]
      )}
    >
      {statusLabel(status)}
    </span>
  );
}

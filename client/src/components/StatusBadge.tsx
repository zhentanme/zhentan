import type { TransactionStatus } from "@/types";
import { statusLabel } from "@/lib/format";
import { Pill, type PillTone } from "@/components/ui/Pill";

interface StatusBadgeProps {
  status: TransactionStatus;
  size?: "md" | "sm";
}

const toneMap: Record<TransactionStatus, PillTone> = {
  pending: "watch",
  in_review: "watch",
  confirming: "safe",
  rejecting: "danger",
  executed: "safe",
  rejected: "danger",
};

export function StatusBadge({ status, size = "md" }: StatusBadgeProps) {
  return (
    <Pill tone={toneMap[status]} size={size}>
      {statusLabel(status)}
    </Pill>
  );
}

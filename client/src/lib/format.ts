import type { TransactionStatus, PendingTransaction } from "@/types";

/**
 * Format a token balance for display with appropriate decimals (readable, compact).
 * Compacts to K/M/B only at >= 100,000. Pass `raw: true` to always show the full number.
 */
export function formatTokenAmount(
  value: string | number,
  { maxDecimals = 8, raw = false }: { maxDecimals?: number; raw?: boolean } = {},
): string {
  const n = typeof value === "string" ? parseFloat(value) : value;
  if (!Number.isFinite(n) || n === 0) return "0";
  if (!raw) {
    if (n >= 1e9) return (n / 1e9).toFixed(2).replace(/\.?0+$/, "") + "B";
    if (n >= 1e6) return (n / 1e6).toFixed(2).replace(/\.?0+$/, "") + "M";
    if (n >= 1e5) return (n / 1e3).toFixed(2).replace(/\.?0+$/, "") + "K";
  }
  if (n >= 1)
    return n.toLocaleString("en-US", { maximumFractionDigits: 4, minimumFractionDigits: 0 });
  if (n >= 0.01) return n.toFixed(4).replace(/\.?0+$/, "") || "0";
  if (n >= 0.0001) return n.toFixed(6).replace(/\.?0+$/, "") || "0";
  const s = n.toFixed(maxDecimals).replace(/\.?0+$/, "");
  return s || "0";
}

export function truncateAddress(addr: string, length = 22): string {
  if (addr.length <= length) return addr;
  return `${addr.slice(0, length / 2)}...${addr.slice(-length / 2)}`;
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function getTransactionStatus(tx: PendingTransaction): TransactionStatus {
  if (tx.rejected) return "rejected";
  if (tx.executedAt) return "executed";
  if (tx.inReview) return "in_review";
  return "pending";
}

export function statusLabel(status: TransactionStatus): string {
  switch (status) {
    case "pending":
      return "Pending";
    case "in_review":
      return "In Review";
    case "executed":
      return "Executed";
    case "rejected":
      return "Rejected";
  }
}

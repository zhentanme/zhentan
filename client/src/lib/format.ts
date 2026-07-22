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

/** Relative time, e.g. "12s ago", "5m ago", "3h ago", "2d ago", then a date. */
export function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "";
  const diff = Math.max(0, Date.now() - then);
  const s = Math.floor(diff / 1000);
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** Day-group label: "Today", "Yesterday", else a full date. */
export function dayLabel(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const dayMs = 86_400_000;
  const diffDays = Math.round((startOf(now) - startOf(d)) / dayMs);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
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
    case "confirming":
      return "Confirming";
    case "executed":
      return "Executed";
    case "rejected":
      return "Rejected";
  }
}

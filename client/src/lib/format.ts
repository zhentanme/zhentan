import type { TransactionStatus } from "@/types";

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

/**
 * Truncate an address to the `0x1234…abcd` convention (6 leading chars
 * including 0x, 4 trailing) used by Safe, Etherscan, and most wallets.
 */
export function truncateAddress(addr: string, lead = 6, tail = 4): string {
  if (addr.length <= lead + tail + 1) return addr;
  return `${addr.slice(0, lead)}…${addr.slice(-tail)}`;
}

/** Swap-pair side label: symbols uppercase, raw 0x addresses shorten (#142). */
export function tokenSymbolLabel(symbolOrAddress: string): string {
  const s = symbolOrAddress.trim();
  return /^0x[a-fA-F0-9]{40}$/.test(s) ? truncateAddress(s) : s.toUpperCase();
}

/** Truncate a long hex blob (calldata, hashes) to `0xabcdef12…deadbeef`. */
export function truncateHex(hex: string, lead = 10, tail = 8): string {
  if (hex.length <= lead + tail + 1) return hex;
  return `${hex.slice(0, lead)}…${hex.slice(-tail)}`;
}

export type RiskSeverity = "safe" | "watch" | "danger";

/**
 * Map a risk score to its signal color/tone. Thresholds mirror the screening
 * core: APPROVE < 40, REVIEW 40–70, BLOCK > 70.
 */
export function riskSeverity(score: number | null | undefined): RiskSeverity | null {
  if (score == null || !Number.isFinite(score)) return null;
  if (score < 40) return "safe";
  if (score <= 70) return "watch";
  return "danger";
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

export function statusLabel(status: TransactionStatus): string {
  switch (status) {
    case "pending":
      return "Pending";
    case "in_review":
      return "In review";
    case "confirming":
      return "Confirming";
    case "rejecting":
      return "Rejecting";
    case "executed":
      return "Executed";
    case "rejected":
      return "Rejected";
  }
}

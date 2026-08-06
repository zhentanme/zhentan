/**
 * Pure state machine for the on-chain rejection lifecycle (B4).
 *
 * A rejection is a durable job, not a flag: the user-visible `rejected`
 * boolean means `rejected_confirmed` ONLY. Everything before that is an
 * explicit in-flight state so a failed cancel is retried with backoff
 * instead of silently parking the Safe nonce (the pre-B4 bug).
 *
 *   requested → cancel_signing → cancel_submitted → rejected_confirmed
 *                     │                 │
 *                     └── failed_retryable (bounded retries) ──┐
 *                                       ▲──────────────────────┘
 *   any non-terminal state → superseded (nonce consumed by something else;
 *   reconciliation folds in the real outcome)
 */
import type { RejectionStatus } from "../../types.js";

const TRANSITIONS: Record<RejectionStatus, readonly RejectionStatus[]> = {
  requested: ["cancel_signing", "superseded"],
  cancel_signing: ["cancel_submitted", "failed_retryable", "superseded"],
  cancel_submitted: ["rejected_confirmed", "failed_retryable", "superseded"],
  failed_retryable: ["cancel_signing", "superseded"],
  rejected_confirmed: [],
  superseded: [],
};

export function canTransition(from: RejectionStatus, to: RejectionStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

export function assertTransition(from: RejectionStatus, to: RejectionStatus): void {
  if (!canTransition(from, to)) {
    throw new Error(`Illegal rejection transition: ${from} → ${to}`);
  }
}

/** States in which the rejection job is still live (blocks execution). */
export function isRejectionActive(status: RejectionStatus | undefined): boolean {
  return (
    status === "requested" ||
    status === "cancel_signing" ||
    status === "cancel_submitted" ||
    status === "failed_retryable"
  );
}

// 10 attempts ≈ 22h of exponential backoff (5m … 6h cap) before dead-letter.
export const MAX_CANCEL_ATTEMPTS = 10;

const BASE_RETRY_MS = 5 * 60 * 1000; // 5 min
const MAX_RETRY_MS = 6 * 60 * 60 * 1000; // 6 h

/**
 * Exponential backoff for the next cancel attempt. Returns null once the
 * attempt budget is exhausted — the row stays `failed_retryable` with no
 * scheduled retry (dead-letter; surfaced to the dashboard, needs a human).
 */
export function nextRetryAt(attempts: number, now: Date = new Date()): string | null {
  if (attempts >= MAX_CANCEL_ATTEMPTS) return null;
  const delay = Math.min(BASE_RETRY_MS * 2 ** Math.max(0, attempts - 1), MAX_RETRY_MS);
  return new Date(now.getTime() + delay).toISOString();
}

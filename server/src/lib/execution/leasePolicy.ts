/**
 * Pure lease-grant policy (D0) — env-free and unit-tested; the SQL filter
 * in lease.ts mirrors this rule exactly. Kept separate from the I/O half
 * so purity is a build property (same pattern as agent/evaluate.ts).
 */

export const EXECUTION_LEASE_TTL_MS = 5 * 60 * 1000;

export interface LeaseFields {
  execution_lease_owner: string | null;
  execution_lease_expires_at: string | null;
}

/**
 * Grant iff unleased, expired, or already held by this exact claimant token
 * (re-entrant renewal). The claimant is a per-ATTEMPT token, not a process
 * identity — two attempts in the same process carry different tokens, so
 * neither can slip through the re-entrant clause while the other holds it.
 */
export function leaseGrantable(row: LeaseFields, claimant: string, now: Date): boolean {
  if (!row.execution_lease_owner || !row.execution_lease_expires_at) return true;
  if (row.execution_lease_owner === claimant) return true;
  return Date.parse(row.execution_lease_expires_at) <= now.getTime();
}

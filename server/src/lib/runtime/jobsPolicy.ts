/**
 * Pure job-protocol policy (D0.2) — env-free and unit-tested; the SQL in
 * jobs.ts mirrors these rules exactly (same pattern as execution/leasePolicy).
 *
 * The transaction-version domain rule itself lives in the DB trigger
 * `bump_transaction_version` (migration 20260810100000): decisions and
 * signatures are valid only against the transaction version they were
 * computed for, and only domain events — payload/hash change, nonce
 * assignment, user signatures, approval/rejection lifecycle, screening
 * change, owner/threshold change, supersession — bump it.
 */
import { createHash } from "crypto";

/** Frozen wire-schema version; results must carry a supported version. */
export const JOB_SCHEMA_VERSION = 1;
export const SUPPORTED_JOB_SCHEMA_VERSIONS: ReadonlySet<number> = new Set([1]);

/** Lease TTL for one evaluate/sign attempt (heartbeat extends it). */
export const JOB_LEASE_TTL_MS = 2 * 60 * 1000;
/** Attempts (lease grants) before a job dead-letters. */
export const MAX_JOB_ATTEMPTS = 5;
/** Retry backoff: 30s · 2^(n-1), capped at 10 minutes. */
export function jobNextRetryAt(attemptCount: number, now: Date): Date {
  const backoffMs = Math.min(30_000 * 2 ** Math.max(0, attemptCount - 1), 10 * 60 * 1000);
  return new Date(now.getTime() + backoffMs);
}

/**
 * Where a submitted FAILURE lands: retryable failures return to the pool
 * with backoff while budget remains, then dead-letter (dashboard-visible);
 * explicitly non-retryable failures terminate as `failed`.
 */
export function failureTargetStatus(
  attemptCount: number,
  retryable: boolean
): "pending" | "dead_letter" | "failed" {
  if (!retryable) return "failed";
  return attemptCount < MAX_JOB_ATTEMPTS ? "pending" : "dead_letter";
}

export type JobKind = "screen" | "sign";
export type SignPurpose = "execution" | "rejection" | "draft_finalization";
export type JobStatus = "pending" | "leased" | "succeeded" | "failed" | "dead_letter" | "void";

const TRANSITIONS: Record<JobStatus, JobStatus[]> = {
  pending: ["leased", "void"],
  leased: ["succeeded", "failed", "pending", "dead_letter", "void"],
  failed: [],
  succeeded: [],
  dead_letter: [],
  void: [],
};

export function canTransitionJob(from: JobStatus, to: JobStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

/** The lease-relevant slice of a runtime_jobs row (snake_case = DB names). */
export interface JobLeaseFields {
  status: string;
  lease_token: string | null;
  lease_expires_at: string | null;
  attempt_count: number;
  next_retry_at: string | null;
}

/**
 * A job is claimable iff it is pending and past any retry backoff, or its
 * lease has expired (crashed holder), and it still has attempt budget.
 * Same-token re-claim is a renewal (heartbeat path), not a new attempt.
 */
export function jobLeasable(job: JobLeaseFields, claimantToken: string, now: Date): boolean {
  if (job.status === "pending") {
    return !job.next_retry_at || Date.parse(job.next_retry_at) <= now.getTime();
  }
  if (job.status !== "leased") return false;
  if (job.lease_token === claimantToken) return true;
  if (!job.lease_expires_at || Date.parse(job.lease_expires_at) > now.getTime()) return false;
  return job.attempt_count < MAX_JOB_ATTEMPTS;
}

/**
 * Canonical input hash: stable-stringified payload, sha256. Computed by the
 * backend at enqueue and by the runtime over the payload it actually
 * evaluated — a mismatch means they did not talk about the same inputs.
 */
export function computeInputHash(payload: unknown): string {
  return createHash("sha256").update(stableStringify(payload)).digest("hex");
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`);
  return `{${entries.join(",")}}`;
}

/** The validation-relevant slice of a runtime_jobs row. */
export interface JobResultFields extends JobLeaseFields {
  id: string;
  tx_id: string;
  tx_version: number;
  input_hash: string;
  credential_version: number;
  result_lease_token: string | null;
}

/** What a runtime submits for a completed job. */
export interface JobResultSubmission {
  jobId: string;
  schemaVersion: number;
  leaseToken: string;
  agentInstanceId: string;
  txId: string;
  txVersion: number;
  inputHash: string;
  policyVersion: string;
  credentialVersion: number;
  result: unknown;
}

export type ResultDecision =
  | { decision: "accept" }
  | { decision: "duplicate_noop" }
  | { decision: "void"; reason: "stale_tx_version" }
  | {
      decision: "reject";
      reason:
        | "unknown_schema_version"
        | "wrong_job"
        | "job_not_leased"
        | "lease_mismatch"
        | "lease_expired"
        | "job_tx_version_mismatch"
        | "input_hash_mismatch"
        | "credential_stale";
    };

/**
 * Verifiable, idempotent result acceptance — the ordering matters:
 * identity/schema errors reject loudest; a duplicate of an already-accepted
 * result is a no-op; a transaction that moved on voids the job rather than
 * failing the runtime.
 */
export function validateJobResult(
  job: JobResultFields,
  submission: JobResultSubmission,
  currentTxVersion: number,
  currentCredentialVersion: number,
  now: Date
): ResultDecision {
  if (!SUPPORTED_JOB_SCHEMA_VERSIONS.has(submission.schemaVersion)) {
    return { decision: "reject", reason: "unknown_schema_version" };
  }
  if (submission.jobId !== job.id || submission.txId !== job.tx_id) {
    return { decision: "reject", reason: "wrong_job" };
  }
  // Idempotency: the exact result that already landed is a no-op.
  if (job.status === "succeeded" || job.status === "failed") {
    if (job.result_lease_token === submission.leaseToken) {
      return { decision: "duplicate_noop" };
    }
    return { decision: "reject", reason: "job_not_leased" };
  }
  if (job.status !== "leased") {
    return { decision: "reject", reason: "job_not_leased" };
  }
  if (job.lease_token !== submission.leaseToken) {
    return { decision: "reject", reason: "lease_mismatch" };
  }
  if (!job.lease_expires_at || Date.parse(job.lease_expires_at) <= now.getTime()) {
    return { decision: "reject", reason: "lease_expired" };
  }
  if (submission.txVersion !== job.tx_version) {
    return { decision: "reject", reason: "job_tx_version_mismatch" };
  }
  if (submission.inputHash !== job.input_hash) {
    return { decision: "reject", reason: "input_hash_mismatch" };
  }
  if (submission.credentialVersion !== currentCredentialVersion) {
    return { decision: "reject", reason: "credential_stale" };
  }
  // The transaction moved on while the job was in flight (user rejection,
  // quote refresh, nonce change, …): the decision no longer binds — void
  // the job instead of recording a result computed against a stale version.
  if (currentTxVersion !== job.tx_version) {
    return { decision: "void", reason: "stale_tx_version" };
  }
  return { decision: "accept" };
}

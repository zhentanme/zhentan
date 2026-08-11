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
// The wire protocol (schema version, canonical hash, job/result shapes) is
// shared VERBATIM with the runtime worker via zhentan-screening/protocol —
// one source, no drift. Re-exported here so backend consumers keep one
// import site.
import {
  JOB_SCHEMA_VERSION,
  SUPPORTED_JOB_SCHEMA_VERSIONS,
  computeInputHash,
  type JobKind,
  type JobResultSubmission,
  type JobStatus,
  type SignPurpose,
} from "zhentan-screening/protocol";
export {
  JOB_SCHEMA_VERSION,
  SUPPORTED_JOB_SCHEMA_VERSIONS,
  computeInputHash,
  type JobKind,
  type JobResultSubmission,
  type JobStatus,
  type SignPurpose,
};

/**
 * Identity-shaped contracts from day one (D0.3): every job carries an
 * assignment scope (safe address) and credential_version; every result
 * carries the agent_instance_id bound at lease time. Today every Safe maps
 * to the shared agent; P7/F1 swap this mapping for agent_identities and
 * per-agent credentials WITHOUT changing any contract.
 */
export const SHARED_AGENT_INSTANCE_ID = "shared-agent";

/** Assignment lookup — the P7/F1 seam. One agent for every Safe until then. */
export function assignedAgentForSafe(_safeAddress: string): string {
  return SHARED_AGENT_INSTANCE_ID;
}

/** The identity slice a job must carry to be enqueueable at all. */
export interface JobContractFields {
  schema_version: number;
  kind: string;
  purpose: string | null;
  safe_address: string;
  credential_version: number;
}

export type JobContractVerdict =
  | { valid: true }
  | {
      valid: false;
      reason:
        | "unsupported_schema_version"
        | "missing_safe_scope"
        | "invalid_credential_version"
        | "invalid_kind"
        | "sign_requires_purpose"
        | "invalid_purpose"
        | "screen_forbids_purpose";
    };

const SIGN_PURPOSES: ReadonlySet<string> = new Set([
  "execution",
  "rejection",
  "draft_finalization",
] satisfies SignPurpose[]);

/** Mirrors the DB CHECKs so contract tests run env-free (and reject earlier). */
export function validateJobContract(job: JobContractFields): JobContractVerdict {
  if (!SUPPORTED_JOB_SCHEMA_VERSIONS.has(job.schema_version)) {
    return { valid: false, reason: "unsupported_schema_version" };
  }
  if (!/^0x[0-9a-fA-F]{40}$/.test(job.safe_address)) {
    return { valid: false, reason: "missing_safe_scope" };
  }
  if (!Number.isInteger(job.credential_version) || job.credential_version < 1) {
    return { valid: false, reason: "invalid_credential_version" };
  }
  if (job.kind !== "screen" && job.kind !== "sign") {
    return { valid: false, reason: "invalid_kind" };
  }
  if (job.kind === "sign" && !job.purpose) {
    return { valid: false, reason: "sign_requires_purpose" };
  }
  if (job.kind === "sign" && job.purpose && !SIGN_PURPOSES.has(job.purpose)) {
    return { valid: false, reason: "invalid_purpose" };
  }
  if (job.kind === "screen" && job.purpose) {
    return { valid: false, reason: "screen_forbids_purpose" };
  }
  return { valid: true };
}

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

/** The validation-relevant slice of a runtime_jobs row. */
export interface JobResultFields extends JobLeaseFields {
  id: string;
  tx_id: string;
  tx_version: number;
  input_hash: string;
  credential_version: number;
  /** Bound at lease time; results must come back under the same identity. */
  agent_instance_id: string | null;
  result_lease_token: string | null;
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
        | "agent_mismatch"
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
  // Identity binding (D0.3): the result must come back under the same
  // agent identity the lease was granted to.
  if (job.agent_instance_id !== submission.agentInstanceId) {
    return { decision: "reject", reason: "agent_mismatch" };
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

import { describe, it, expect } from "vitest";
import {
  JOB_SCHEMA_VERSION,
  SUPPORTED_JOB_SCHEMA_VERSIONS,
  MAX_JOB_ATTEMPTS,
  JOB_LEASE_TTL_MS,
  canTransitionJob,
  computeInputHash,
  jobLeasable,
  jobNextRetryAt,
  validateJobResult,
  type JobResultFields,
  type JobResultSubmission,
} from "./jobsPolicy.js";

const NOW = new Date("2026-08-10T12:00:00Z");
const LIVE = new Date(NOW.getTime() + 60_000).toISOString();
const EXPIRED = new Date(NOW.getTime() - 1_000).toISOString();

const PAYLOAD = { safeTx: { to: "0xabc", value: "0", nonce: 7 }, patterns: { trusted: true } };

const job = (over: Partial<JobResultFields> = {}): JobResultFields => ({
  id: "job-1",
  tx_id: "tx-1",
  tx_version: 3,
  input_hash: computeInputHash(PAYLOAD),
  credential_version: 1,
  status: "leased",
  lease_token: "lease-a",
  lease_expires_at: LIVE,
  attempt_count: 1,
  next_retry_at: null,
  result_lease_token: null,
  ...over,
});

const submission = (over: Partial<JobResultSubmission> = {}): JobResultSubmission => ({
  jobId: "job-1",
  schemaVersion: JOB_SCHEMA_VERSION,
  leaseToken: "lease-a",
  agentInstanceId: "shared-agent",
  txId: "tx-1",
  txVersion: 3,
  inputHash: computeInputHash(PAYLOAD),
  policyVersion: "p1",
  credentialVersion: 1,
  result: { verdict: "APPROVE", score: 12 },
  ...over,
});

describe("schema compatibility (contract)", () => {
  it("the current wire version is always in the supported set — old runtime results stay acceptable", () => {
    expect(SUPPORTED_JOB_SCHEMA_VERSIONS.has(JOB_SCHEMA_VERSION)).toBe(true);
    expect(validateJobResult(job(), submission(), 3, 1, NOW)).toEqual({ decision: "accept" });
  });

  it("a result from an unknown (newer) schema version is rejected, not misparsed", () => {
    const verdict = validateJobResult(job(), submission({ schemaVersion: 99 }), 3, 1, NOW);
    expect(verdict).toEqual({ decision: "reject", reason: "unknown_schema_version" });
  });
});

describe("lease behaviour", () => {
  it("an expired lease with attempt budget is reclaimable by another instance", () => {
    expect(
      jobLeasable(job({ lease_expires_at: EXPIRED }), "other-token", NOW)
    ).toBe(true);
  });

  it("an expired lease with exhausted attempts is not reclaimable (dead-letter candidate)", () => {
    expect(
      jobLeasable(job({ lease_expires_at: EXPIRED, attempt_count: MAX_JOB_ATTEMPTS }), "other-token", NOW)
    ).toBe(false);
  });

  it("a live lease is exclusive except to its own token", () => {
    expect(jobLeasable(job(), "other-token", NOW)).toBe(false);
    expect(jobLeasable(job(), "lease-a", NOW)).toBe(true);
  });

  it("a pending job inside its retry backoff is not leasable", () => {
    const backedOff = job({ status: "pending", lease_token: null, next_retry_at: LIVE });
    expect(jobLeasable(backedOff, "any", NOW)).toBe(false);
    expect(jobLeasable({ ...backedOff, next_retry_at: EXPIRED }, "any", NOW)).toBe(true);
  });

  it("a result on an expired lease is rejected", () => {
    const verdict = validateJobResult(job({ lease_expires_at: EXPIRED }), submission(), 3, 1, NOW);
    expect(verdict).toEqual({ decision: "reject", reason: "lease_expired" });
  });

  it("a result with someone else's lease token is rejected", () => {
    const verdict = validateJobResult(job(), submission({ leaseToken: "lease-b" }), 3, 1, NOW);
    expect(verdict).toEqual({ decision: "reject", reason: "lease_mismatch" });
  });
});

describe("idempotent result submission", () => {
  it("resubmitting the accepted result is a no-op, not an error", () => {
    const done = job({ status: "succeeded", result_lease_token: "lease-a" });
    expect(validateJobResult(done, submission(), 3, 1, NOW)).toEqual({ decision: "duplicate_noop" });
  });

  it("a different submitter cannot overwrite a landed result", () => {
    const done = job({ status: "succeeded", result_lease_token: "lease-a" });
    const verdict = validateJobResult(done, submission({ leaseToken: "lease-b" }), 3, 1, NOW);
    expect(verdict).toEqual({ decision: "reject", reason: "job_not_leased" });
  });
});

describe("transaction-version binding", () => {
  it("a submission computed for a different version than the job's is rejected", () => {
    const verdict = validateJobResult(job(), submission({ txVersion: 2 }), 3, 1, NOW);
    expect(verdict).toEqual({ decision: "reject", reason: "job_tx_version_mismatch" });
  });

  it("a transaction that moved on mid-flight voids the job (decision expired)", () => {
    const verdict = validateJobResult(job(), submission(), 4, 1, NOW);
    expect(verdict).toEqual({ decision: "void", reason: "stale_tx_version" });
  });
});

describe("input-hash verification", () => {
  it("a result over different inputs than enqueued is rejected", () => {
    const verdict = validateJobResult(
      job(),
      submission({ inputHash: computeInputHash({ tampered: true }) }),
      3, 1, NOW
    );
    expect(verdict).toEqual({ decision: "reject", reason: "input_hash_mismatch" });
  });

  it("the canonical hash is key-order independent but value sensitive", () => {
    expect(computeInputHash({ a: 1, b: [2, 3] })).toBe(computeInputHash({ b: [2, 3], a: 1 }));
    expect(computeInputHash({ a: 1 })).not.toBe(computeInputHash({ a: 2 }));
    expect(computeInputHash({ a: 1, skip: undefined })).toBe(computeInputHash({ a: 1 }));
  });
});

describe("credential rotation", () => {
  it("a result signed under a rotated-out credential version is rejected mid-lease", () => {
    const verdict = validateJobResult(job(), submission({ credentialVersion: 1 }), 3, 2, NOW);
    expect(verdict).toEqual({ decision: "reject", reason: "credential_stale" });
  });
});

describe("lifecycle guards", () => {
  it("terminal states accept no transitions; leased can settle, return, or die", () => {
    expect(canTransitionJob("pending", "leased")).toBe(true);
    expect(canTransitionJob("leased", "succeeded")).toBe(true);
    expect(canTransitionJob("leased", "pending")).toBe(true);
    expect(canTransitionJob("leased", "dead_letter")).toBe(true);
    expect(canTransitionJob("succeeded", "pending")).toBe(false);
    expect(canTransitionJob("dead_letter", "leased")).toBe(false);
    expect(canTransitionJob("void", "leased")).toBe(false);
  });

  it("a result for a job that is not leased is rejected", () => {
    const verdict = validateJobResult(job({ status: "pending", lease_token: null }), submission(), 3, 1, NOW);
    expect(verdict).toEqual({ decision: "reject", reason: "job_not_leased" });
  });

  it("a submission addressed to the wrong job or transaction is rejected", () => {
    expect(validateJobResult(job(), submission({ jobId: "job-2" }), 3, 1, NOW)).toEqual({
      decision: "reject",
      reason: "wrong_job",
    });
    expect(validateJobResult(job(), submission({ txId: "tx-2" }), 3, 1, NOW)).toEqual({
      decision: "reject",
      reason: "wrong_job",
    });
  });
});

describe("retry backoff", () => {
  it("doubles from 30s and caps at 10 minutes", () => {
    expect(jobNextRetryAt(1, NOW).getTime() - NOW.getTime()).toBe(30_000);
    expect(jobNextRetryAt(2, NOW).getTime() - NOW.getTime()).toBe(60_000);
    expect(jobNextRetryAt(10, NOW).getTime() - NOW.getTime()).toBe(10 * 60 * 1000);
  });

  it("lease TTL is long enough for a worst-case evaluate+sign attempt", () => {
    expect(JOB_LEASE_TTL_MS).toBeGreaterThanOrEqual(60 * 1000);
  });
});

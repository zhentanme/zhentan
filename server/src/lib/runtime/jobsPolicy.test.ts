import { describe, it, expect } from "vitest";
import {
  assignedAgentForSafe,
  encodeWireValue,
  decodeWireValue,
  failureTargetStatus,
  SHARED_AGENT_INSTANCE_ID,
  validateJobContract,
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
  agent_instance_id: "shared-agent",
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

describe("identity-shaped contracts (D0.3)", () => {
  const contractFixture = {
    schema_version: JOB_SCHEMA_VERSION,
    kind: "sign",
    purpose: "execution",
    safe_address: "0x1111111111111111111111111111111111111111",
    credential_version: 1,
  };

  it("a fully identity-shaped job is enqueueable", () => {
    expect(validateJobContract(contractFixture)).toEqual({ valid: true });
    expect(validateJobContract({ ...contractFixture, kind: "screen", purpose: null })).toEqual({
      valid: true,
    });
  });

  it("a job without a safe assignment scope is rejected", () => {
    expect(validateJobContract({ ...contractFixture, safe_address: "" })).toEqual({
      valid: false,
      reason: "missing_safe_scope",
    });
    expect(validateJobContract({ ...contractFixture, safe_address: "not-an-address" })).toEqual({
      valid: false,
      reason: "missing_safe_scope",
    });
  });

  it("a job without a valid credential version is rejected", () => {
    expect(validateJobContract({ ...contractFixture, credential_version: 0 })).toEqual({
      valid: false,
      reason: "invalid_credential_version",
    });
  });

  it("kind/purpose shape is part of the contract", () => {
    expect(validateJobContract({ ...contractFixture, purpose: null })).toEqual({
      valid: false,
      reason: "sign_requires_purpose",
    });
    expect(validateJobContract({ ...contractFixture, kind: "screen" })).toEqual({
      valid: false,
      reason: "screen_forbids_purpose",
    });
    expect(validateJobContract({ ...contractFixture, kind: "notify" })).toEqual({
      valid: false,
      reason: "invalid_kind",
    });
    expect(validateJobContract({ ...contractFixture, purpose: "banana" })).toEqual({
      valid: false,
      reason: "invalid_purpose",
    });
  });

  it("a result whose agent identity does not match the lease holder is rejected", () => {
    const verdict = validateJobResult(job(), submission({ agentInstanceId: "rogue-agent" }), 3, 1, NOW);
    expect(verdict).toEqual({ decision: "reject", reason: "agent_mismatch" });
  });

  it("every Safe maps to the shared agent until P7/F1", () => {
    expect(assignedAgentForSafe("0x1111111111111111111111111111111111111111")).toBe(
      SHARED_AGENT_INSTANCE_ID
    );
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

describe("failure classification", () => {
  it("retryable failures return to the pool while budget remains", () => {
    expect(failureTargetStatus(1, true)).toBe("pending");
    expect(failureTargetStatus(MAX_JOB_ATTEMPTS - 1, true)).toBe("pending");
  });

  it("a retryable failure at the attempt cap dead-letters (dashboard-visible), never terminal failed", () => {
    expect(failureTargetStatus(MAX_JOB_ATTEMPTS, true)).toBe("dead_letter");
    expect(failureTargetStatus(MAX_JOB_ATTEMPTS + 1, true)).toBe("dead_letter");
  });

  it("explicitly non-retryable failures terminate as failed regardless of budget", () => {
    expect(failureTargetStatus(1, false)).toBe("failed");
    expect(failureTargetStatus(MAX_JOB_ATTEMPTS, false)).toBe("failed");
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

describe("wire codec (bigints across the job payload)", () => {
  it("round-trips bigints nested in decoded calldata shapes", () => {
    const decoded = {
      kind: "swap",
      router: "0xr",
      routerName: null,
      sellTokenAddress: "0xs",
      sellAmountWei: 123456789012345678901234567890n,
      approval: { tokenAddress: "0xt", spender: "0xp", amountWei: 2n ** 255n, infinite: true },
    };
    const wire = encodeWireValue(decoded);
    expect(JSON.parse(JSON.stringify(wire))).toEqual(wire); // JSON-safe
    expect(decodeWireValue(wire)).toEqual(decoded);
  });

  it("leaves plain values, nulls and arrays untouched", () => {
    const value = { a: [1, "x", null], b: { c: false }, d: null };
    expect(decodeWireValue(encodeWireValue(value))).toEqual(value);
  });

  it("does not mistake user data shaped like the marker with extra keys", () => {
    const value = { $bigint: "not-alone", other: 1 };
    expect(decodeWireValue(encodeWireValue(value))).toEqual(value);
  });

  it("EXACT marker collision: user data {\"$bigint\":\"123\"} round-trips as the object, not a bigint", () => {
    const value = { customAttributes: { $bigint: "123" } };
    expect(decodeWireValue(encodeWireValue(value))).toEqual(value);
  });

  it("non-numeric marker-shaped user data round-trips without throwing", () => {
    const value = { note: { $bigint: "not-a-number" } };
    expect(decodeWireValue(encodeWireValue(value))).toEqual(value);
  });

  it("user data carrying the escape marker itself round-trips", () => {
    const value = { $escaped: { $bigint: "5" }, deep: [{ $escaped: null }] };
    expect(decodeWireValue(encodeWireValue(value))).toEqual(value);
  });

  it("real bigints nested inside marker-carrying user objects still revive", () => {
    const value = { $bigint: "user-key", amount: 7n };
    expect(decodeWireValue(encodeWireValue(value))).toEqual(value);
  });
});

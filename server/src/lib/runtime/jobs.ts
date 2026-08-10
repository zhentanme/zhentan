/**
 * runtime_jobs I/O (D0.2) — the durable pull-model work queue the D1
 * runtime will consume. Every conditional write is one atomic UPDATE with
 * a count check (never update+or+select+representation — PostgREST rejects
 * that combination; see execution/lease.ts).
 *
 * Nothing enqueues jobs yet: D2 (shadow screening) is the first producer.
 * This module lands the protocol so it can soak behind contract tests
 * while the system is still single-process.
 */
import { randomUUID } from "crypto";
import { supabase } from "../supabase/client.js";
import {
  JOB_LEASE_TTL_MS,
  JOB_SCHEMA_VERSION,
  MAX_JOB_ATTEMPTS,
  computeInputHash,
  jobNextRetryAt,
  validateJobResult,
  type JobKind,
  type JobResultSubmission,
  type ResultDecision,
  type SignPurpose,
} from "./jobsPolicy.js";

/** Snake_case row — mirrors the runtime_jobs migration exactly. */
export interface RuntimeJobRow {
  id: string;
  schema_version: number;
  kind: JobKind;
  purpose: SignPurpose | null;
  safe_address: string;
  tx_id: string;
  tx_version: number;
  payload: Record<string, unknown>;
  input_hash: string;
  credential_version: number;
  status: string;
  agent_instance_id: string | null;
  lease_token: string | null;
  lease_expires_at: string | null;
  attempt_count: number;
  next_retry_at: string | null;
  result: unknown;
  result_input_hash: string | null;
  result_policy_version: string | null;
  result_agent_instance_id: string | null;
  result_lease_token: string | null;
  result_submitted_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface EnqueueJobInput {
  kind: JobKind;
  purpose?: SignPurpose;
  safeAddress: string;
  txId: string;
  txVersion: number;
  payload: Record<string, unknown>;
  credentialVersion?: number;
}

/**
 * Idempotent enqueue: one ACTIVE job per (tx, kind, purpose) — a second
 * enqueue while one is pending/leased returns the existing job.
 */
export async function enqueueJob(input: EnqueueJobInput): Promise<RuntimeJobRow> {
  const row = {
    schema_version: JOB_SCHEMA_VERSION,
    kind: input.kind,
    purpose: input.purpose ?? null,
    safe_address: input.safeAddress.toLowerCase(),
    tx_id: input.txId,
    tx_version: input.txVersion,
    payload: input.payload,
    input_hash: computeInputHash(input.payload),
    credential_version: input.credentialVersion ?? 1,
  };
  const { data, error } = await supabase.from("runtime_jobs").insert(row).select("*").single<RuntimeJobRow>();
  if (!error) return data;
  if (error.code === "23505") {
    const existing = await getActiveJob(input.txId, input.kind, input.purpose ?? null);
    if (existing) return existing;
  }
  throw new Error(`Job enqueue failed for tx ${input.txId}: ${error.message}`);
}

export async function getJob(jobId: string): Promise<RuntimeJobRow | null> {
  const { data, error } = await supabase.from("runtime_jobs").select("*").eq("id", jobId).maybeSingle<RuntimeJobRow>();
  if (error) throw new Error(`Job fetch failed for ${jobId}: ${error.message}`);
  return data;
}

export async function getActiveJob(
  txId: string,
  kind: JobKind,
  purpose: SignPurpose | null
): Promise<RuntimeJobRow | null> {
  let query = supabase
    .from("runtime_jobs")
    .select("*")
    .eq("tx_id", txId)
    .eq("kind", kind)
    .in("status", ["pending", "leased"]);
  query = purpose === null ? query.is("purpose", null) : query.eq("purpose", purpose);
  const { data, error } = await query.maybeSingle<RuntimeJobRow>();
  if (error) throw new Error(`Active job lookup failed for tx ${txId}: ${error.message}`);
  return data;
}

export interface LeasedJob {
  job: RuntimeJobRow;
  leaseToken: string;
}

/**
 * Claim the next available job for an agent instance, optionally scoped to
 * one Safe (the F1 assignment scope). Candidates are pending jobs past
 * their retry backoff and expired leases with attempt budget; each is
 * claimed with an atomic conditional UPDATE, so racing claimants can never
 * both win one job. Returns null when no work is available.
 */
export async function leaseNextJob(
  agentInstanceId: string,
  opts: { safeAddress?: string; ttlMs?: number; now?: Date } = {}
): Promise<LeasedJob | null> {
  const now = opts.now ?? new Date();
  const ttlMs = opts.ttlMs ?? JOB_LEASE_TTL_MS;
  const nowIso = now.toISOString();

  let query = supabase
    .from("runtime_jobs")
    .select("*")
    .in("status", ["pending", "leased"])
    .order("created_at", { ascending: true })
    .limit(10);
  if (opts.safeAddress) query = query.eq("safe_address", opts.safeAddress.toLowerCase());
  const { data: candidates, error } = await query.returns<RuntimeJobRow[]>();
  if (error) throw new Error(`Job pull failed: ${error.message}`);

  for (const candidate of candidates ?? []) {
    const claimable =
      candidate.status === "pending"
        ? !candidate.next_retry_at || Date.parse(candidate.next_retry_at) <= now.getTime()
        : candidate.lease_expires_at !== null &&
          Date.parse(candidate.lease_expires_at) <= now.getTime() &&
          candidate.attempt_count < MAX_JOB_ATTEMPTS;
    if (!claimable) continue;

    const leaseToken = randomUUID();
    // Atomic claim: only wins if the row is still in the state we saw —
    // pending, or still holding the same expired lease.
    let claim = supabase
      .from("runtime_jobs")
      .update(
        {
          status: "leased",
          agent_instance_id: agentInstanceId,
          lease_token: leaseToken,
          lease_expires_at: new Date(now.getTime() + ttlMs).toISOString(),
          attempt_count: candidate.attempt_count + 1,
          updated_at: nowIso,
        },
        { count: "exact" }
      )
      .eq("id", candidate.id)
      .eq("attempt_count", candidate.attempt_count);
    claim =
      candidate.status === "pending"
        ? claim.eq("status", "pending")
        : claim.eq("status", "leased").lte("lease_expires_at", nowIso);
    const { count, error: claimError } = await claim;
    if (claimError) throw new Error(`Job claim failed for ${candidate.id}: ${claimError.message}`);
    if ((count ?? 0) > 0) {
      const job = await getJob(candidate.id);
      if (job) return { job, leaseToken };
    }
    // Lost the race on this candidate — try the next.
  }
  return null;
}

/** Extend a held lease. Returns false when the lease is no longer ours. */
export async function heartbeatJob(
  jobId: string,
  leaseToken: string,
  opts: { ttlMs?: number; now?: Date } = {}
): Promise<boolean> {
  const now = opts.now ?? new Date();
  const { count, error } = await supabase
    .from("runtime_jobs")
    .update(
      {
        lease_expires_at: new Date(now.getTime() + (opts.ttlMs ?? JOB_LEASE_TTL_MS)).toISOString(),
        updated_at: now.toISOString(),
      },
      { count: "exact" }
    )
    .eq("id", jobId)
    .eq("status", "leased")
    .eq("lease_token", leaseToken);
  if (error) throw new Error(`Job heartbeat failed for ${jobId}: ${error.message}`);
  return (count ?? 0) > 0;
}

export interface SubmitOutcome {
  decision: ResultDecision["decision"];
  reason?: string;
}

/**
 * Idempotent, verifiable result submission. Validation is the pure rule in
 * jobsPolicy.validateJobResult; the accept/void write is conditional on the
 * lease still being held, so a validated-then-raced submission loses cleanly.
 */
export async function submitJobResult(
  submission: JobResultSubmission,
  opts: { success?: boolean; error?: string; now?: Date } = {}
): Promise<SubmitOutcome> {
  const now = opts.now ?? new Date();
  const job = await getJob(submission.jobId);
  if (!job) return { decision: "reject", reason: "wrong_job" };

  const { data: txRow, error: txError } = await supabase
    .from("transactions")
    .select("version")
    .eq("id", job.tx_id)
    .maybeSingle<{ version: number }>();
  if (txError) throw new Error(`Tx version fetch failed for ${job.tx_id}: ${txError.message}`);
  const currentTxVersion = txRow?.version ?? job.tx_version;

  // Credential rotation is per-agent (D0.3/F1); until agent_identities
  // exists the job's own pinned value is the current one.
  const currentCredentialVersion = job.credential_version;

  const decision = validateJobResult(job, submission, currentTxVersion, currentCredentialVersion, now);
  if (decision.decision !== "accept" && decision.decision !== "void") {
    return { decision: decision.decision, reason: "reason" in decision ? decision.reason : undefined };
  }

  const terminal =
    decision.decision === "void" ? "void" : opts.success === false ? "failed" : "succeeded";
  const patch: Record<string, unknown> = {
    status: terminal,
    result: submission.result ?? null,
    result_input_hash: submission.inputHash,
    result_policy_version: submission.policyVersion,
    result_agent_instance_id: submission.agentInstanceId,
    result_lease_token: submission.leaseToken,
    result_submitted_at: now.toISOString(),
    last_error: opts.error ?? null,
    updated_at: now.toISOString(),
  };
  if (terminal === "failed" && job.attempt_count < MAX_JOB_ATTEMPTS) {
    // Retryable failure: back to the pool with backoff instead of terminal.
    patch.status = "pending";
    patch.lease_token = null;
    patch.lease_expires_at = null;
    patch.next_retry_at = jobNextRetryAt(job.attempt_count, now).toISOString();
  }
  const { count, error } = await supabase
    .from("runtime_jobs")
    .update(patch, { count: "exact" })
    .eq("id", submission.jobId)
    .eq("status", "leased")
    .eq("lease_token", submission.leaseToken);
  if (error) throw new Error(`Result write failed for ${submission.jobId}: ${error.message}`);
  if ((count ?? 0) === 0) return { decision: "reject", reason: "lease_mismatch" };
  return decision.decision === "void"
    ? { decision: "void", reason: "stale_tx_version" }
    : { decision: "accept" };
}

/**
 * Maintenance sweep: expired leases with exhausted attempts dead-letter
 * (dashboard-visible); jobs whose transaction version moved on are voided.
 * Expired leases with budget left are reclaimed lazily by leaseNextJob.
 */
export async function sweepJobs(now: Date = new Date()): Promise<{ deadLettered: number }> {
  const { count, error } = await supabase
    .from("runtime_jobs")
    .update(
      { status: "dead_letter", last_error: "lease expired with no attempts remaining", updated_at: now.toISOString() },
      { count: "exact" }
    )
    .eq("status", "leased")
    .lte("lease_expires_at", now.toISOString())
    .gte("attempt_count", MAX_JOB_ATTEMPTS);
  if (error) throw new Error(`Job sweep failed: ${error.message}`);
  return { deadLettered: count ?? 0 };
}

/** Dead-lettered jobs for dashboard surfacing. */
export async function getDeadLetterJobs(safeAddress?: string): Promise<RuntimeJobRow[]> {
  let query = supabase.from("runtime_jobs").select("*").eq("status", "dead_letter");
  if (safeAddress) query = query.eq("safe_address", safeAddress.toLowerCase());
  const { data, error } = await query.order("updated_at", { ascending: false }).returns<RuntimeJobRow[]>();
  if (error) throw new Error(`Dead-letter fetch failed: ${error.message}`);
  return data ?? [];
}

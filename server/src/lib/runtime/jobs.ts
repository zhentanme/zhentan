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
  failureTargetStatus,
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
 * Idempotent enqueue: one ACTIVE job per (tx, kind, purpose). A second
 * enqueue for the SAME tx version and inputs returns the existing job; an
 * active job left over from an older tx version or different inputs is
 * atomically voided and replaced — a stale row must never block current work.
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
  for (let attempt = 0; attempt < 3; attempt++) {
    const { data, error } = await supabase.from("runtime_jobs").insert(row).select("*").single<RuntimeJobRow>();
    if (!error) return data;
    if (error.code !== "23505") throw new Error(`Job enqueue failed for tx ${input.txId}: ${error.message}`);

    const existing = await getActiveJob(input.txId, input.kind, input.purpose ?? null);
    if (!existing) continue; // settled between conflict and lookup — retry insert
    if (existing.tx_version === row.tx_version && existing.input_hash === row.input_hash) {
      return existing;
    }
    // Obsolete active job: void it (conditional on the state we saw) and retry.
    const { error: voidError } = await supabase
      .from("runtime_jobs")
      .update({ status: "void", last_error: "superseded by re-enqueue at a newer version", updated_at: new Date().toISOString() })
      .eq("id", existing.id)
      .in("status", ["pending", "leased"])
      .eq("tx_version", existing.tx_version);
    if (voidError) throw new Error(`Stale job void failed for tx ${input.txId}: ${voidError.message}`);
  }
  throw new Error(`Job enqueue failed for tx ${input.txId}: could not settle active-job conflict`);
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

  // Eligibility is filtered in the DB (mirrors jobsPolicy.jobLeasable), so
  // ineligible rows — live leases, backed-off retries — can never crowd
  // eligible ones out of the candidate window.
  let query = supabase
    .from("runtime_jobs")
    .select("*")
    .or(
      `and(status.eq.pending,or(next_retry_at.is.null,next_retry_at.lte.${nowIso})),` +
        `and(status.eq.leased,lease_expires_at.lte.${nowIso},attempt_count.lt.${MAX_JOB_ATTEMPTS})`
    )
    .order("created_at", { ascending: true })
    .limit(10);
  if (opts.safeAddress) query = query.eq("safe_address", opts.safeAddress.toLowerCase());
  const { data: candidates, error } = await query.returns<RuntimeJobRow[]>();
  if (error) throw new Error(`Job pull failed: ${error.message}`);

  for (const candidate of candidates ?? []) {
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
 * Idempotent, verifiable result submission. Static rules (schema version,
 * identity, input hash, credential) are the pure jobsPolicy.validateJobResult
 * pre-check; the RACY rules — lease still held, transaction version still
 * current — are decided by the submit_runtime_job_result RPC, which locks
 * the job row AND the transaction row so a concurrent domain-event bump can
 * never land a stale result as accepted.
 */
export async function submitJobResult(
  submission: JobResultSubmission,
  opts: { success?: boolean; retryable?: boolean; error?: string; now?: Date } = {}
): Promise<SubmitOutcome> {
  const now = opts.now ?? new Date();
  const job = await getJob(submission.jobId);
  if (!job) return { decision: "reject", reason: "wrong_job" };

  // Credential rotation is per-agent (D0.3/F1); until agent_identities
  // exists the job's own pinned value is the current one.
  const currentCredentialVersion = job.credential_version;

  // Pre-check with the tx version pinned on the job: static rejections
  // (schema/hash/credential/identity) and duplicates settle here without
  // touching the RPC. The current-version check is the RPC's, atomically.
  const decision = validateJobResult(job, submission, job.tx_version, currentCredentialVersion, now);
  if (decision.decision !== "accept") {
    return { decision: decision.decision, reason: "reason" in decision ? decision.reason : undefined };
  }

  const target =
    opts.success === false
      ? failureTargetStatus(job.attempt_count, opts.retryable ?? true)
      : "succeeded";
  const { data, error } = await supabase.rpc("submit_runtime_job_result", {
    p_job_id: submission.jobId,
    p_lease_token: submission.leaseToken,
    p_target_status: target,
    p_result: submission.result ?? null,
    p_input_hash: submission.inputHash,
    p_policy_version: submission.policyVersion,
    p_agent_instance_id: submission.agentInstanceId,
    p_error: opts.error ?? null,
    p_next_retry_at: target === "pending" ? jobNextRetryAt(job.attempt_count, now).toISOString() : null,
  });
  if (error) throw new Error(`Result submit failed for ${submission.jobId}: ${error.message}`);

  switch (data as string) {
    case "accept":
      return { decision: "accept" };
    case "void":
      return { decision: "void", reason: "stale_tx_version" };
    case "duplicate_noop":
      return { decision: "duplicate_noop" };
    default:
      return { decision: "reject", reason: (data as string) ?? "unknown" };
  }
}

/**
 * Maintenance sweep: expired leases with exhausted attempts dead-letter
 * (dashboard-visible); active jobs whose transaction version moved on are
 * voided (one SQL statement joining transactions — the RPC). Expired
 * leases with budget left are reclaimed lazily by leaseNextJob.
 */
export async function sweepJobs(now: Date = new Date()): Promise<{ deadLettered: number; voided: number }> {
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

  const { data: voided, error: voidError } = await supabase.rpc("void_stale_runtime_jobs");
  if (voidError) throw new Error(`Stale-job void sweep failed: ${voidError.message}`);
  return { deadLettered: count ?? 0, voided: (voided as number) ?? 0 };
}

/** Dead-lettered jobs for dashboard surfacing. */
export async function getDeadLetterJobs(safeAddress?: string): Promise<RuntimeJobRow[]> {
  let query = supabase.from("runtime_jobs").select("*").eq("status", "dead_letter");
  if (safeAddress) query = query.eq("safe_address", safeAddress.toLowerCase());
  const { data, error } = await query.order("updated_at", { ascending: false }).returns<RuntimeJobRow[]>();
  if (error) throw new Error(`Dead-letter fetch failed: ${error.message}`);
  return data ?? [];
}

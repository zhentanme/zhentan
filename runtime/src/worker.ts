/**
 * The pull loop (D1): long-poll → lease → evaluate → submit → heartbeat.
 * A WORKER, not a server — no inbound command API exists; the localhost
 * health listener (health.ts) is the only socket this process opens.
 *
 * Config is read lazily in start(), never at module load: this module must
 * import cleanly with ZERO environment (the no-DB boot proof relies on it).
 */
import {
  evaluateTransaction,
  computeInputHash,
  decodeWireValue,
  JOB_SCHEMA_VERSION,
  type DecodedKind,
  type PatternsFile,
  type PendingTransaction,
  type WireJob,
} from "zhentan-screening";
import { RuntimeApiClient } from "./apiClient.js";
import { recordDecision } from "./decisionStore.js";

export interface WorkerConfig {
  apiBaseUrl: string;
  apiToken: string;
  agentInstanceId: string;
  pollIntervalMs: number;
}

export interface WorkerStats {
  startedAt: string;
  lastPollAt: string | null;
  jobsSucceeded: number;
  jobsFailed: number;
  /** Transaction moved on mid-flight — not a worker fault, tracked apart. */
  jobsVoided: number;
  /** Backend refused the submission (lease/hash/identity) — investigate. */
  jobsRejected: number;
  lastError: string | null;
}

/** Screen-job payload contract — assembled by the backend at enqueue. */
interface ScreenPayload {
  tx: PendingTransaction;
  snapshot: PatternsFile;
  decoded?: DecodedKind;
  evaluatedAt: string;
}

export function loadConfigFromEnv(): WorkerConfig {
  const apiBaseUrl = process.env.RUNTIME_API_URL;
  const apiToken = process.env.RUNTIME_API_TOKEN;
  if (!apiBaseUrl) throw new Error("Missing RUNTIME_API_URL");
  if (!apiToken) throw new Error("Missing RUNTIME_API_TOKEN");
  return {
    apiBaseUrl,
    apiToken,
    agentInstanceId: process.env.AGENT_INSTANCE_ID || "shared-agent",
    pollIntervalMs: Number(process.env.POLL_INTERVAL_MS || 3000),
  };
}

export type JobOutcome = "succeeded" | "voided" | "rejected" | "failed";

/** Map the backend's submission decision to what this attempt amounted to.
 * `accept` and the idempotent `duplicate_noop` are completion; `void` means
 * the transaction moved on (not our fault); anything else is a protocol
 * rejection — the DB job was NOT settled by us and must not count as done. */
function outcomeFromDecision(decision: string): JobOutcome {
  if (decision === "accept" || decision === "duplicate_noop") return "succeeded";
  if (decision === "void") return "voided";
  return "rejected";
}

/**
 * Process one leased job. Exported separately from the loop so the
 * integration test can drive a full lease→evaluate→submit cycle against a
 * stub API without timers.
 */
export async function processJob(
  client: RuntimeApiClient,
  agentInstanceId: string,
  job: WireJob,
  leaseToken: string
): Promise<JobOutcome> {
  const base = {
    jobId: job.id,
    schemaVersion: JOB_SCHEMA_VERSION,
    leaseToken,
    agentInstanceId,
    txId: job.tx_id,
    txVersion: job.tx_version,
    inputHash: computeInputHash(job.payload),
    credentialVersion: job.credential_version,
  };

  if (job.kind === "sign") {
    // D4: the signing authority verifies EVERYTHING before the key sees a
    // hash — recomputed hash, chain-sourced owners/nonce, own decision
    // record, per-purpose rules. A refusal is a deliberate, non-retryable
    // outcome with a named reason (re-screening or human action fixes it,
    // not a retry of the same request).
    const { verifyAndSign } = await import("./signingAuthority.js");
    const signPayload = decodeWireValue(job.payload) as never;
    const result = await verifyAndSign(job.purpose ?? "execution", signPayload);
    if (!result.ok) {
      console.warn(`Sign refused for tx ${job.tx_id} (${job.purpose}): ${result.reason}`);
      const refusal = await client.submitResult(
        { ...base, policyVersion: "none", result: { refused: result.reason } },
        { success: false, retryable: false, error: result.reason }
      );
      return refusal.decision === "accept" || refusal.decision === "duplicate_noop"
        ? "failed"
        : outcomeFromDecision(refusal.decision);
    }
    const outcome = await client.submitResult({
      ...base,
      policyVersion: "none",
      result: { signature: result.signature, signedBy: result.signedBy },
    });
    return outcomeFromDecision(outcome.decision);
  }
  if (job.kind !== "screen") {
    const refusal = await client.submitResult(
      { ...base, policyVersion: "none", result: null },
      { success: false, retryable: false, error: `job kind '${job.kind}' not supported by this runtime version` }
    );
    return refusal.decision === "accept" || refusal.decision === "duplicate_noop"
      ? "failed"
      : outcomeFromDecision(refusal.decision);
  }

  // Revive wire-encoded values (bigints in decoded calldata) — the hash
  // above was computed over the wire form, matching the backend's enqueue.
  const payload = decodeWireValue(job.payload) as unknown as ScreenPayload;
  const decision = evaluateTransaction(
    payload.tx,
    payload.snapshot,
    payload.decoded,
    new Date(payload.evaluatedAt)
  );
  // Local decision record (D2): accumulates from day one — D4's signing
  // authority verifies against these, E3 builds projections on them.
  // Content binding (D4): hash the SCREENED SafeTx fields ourselves — at
  // sign time the authority requires this exact hash to match the request.
  let screenedSafeTxHash: string | null = null;
  const screenedTx = payload.tx as { safeTx?: unknown; safeAddress?: string };
  if (screenedTx.safeTx && screenedTx.safeAddress) {
    try {
      const { computeSafeTxHash } = await import("./safeTxHash.js");
      screenedSafeTxHash = computeSafeTxHash(
        screenedTx.safeAddress,
        56,
        screenedTx.safeTx as Parameters<typeof computeSafeTxHash>[2]
      );
    } catch (err) {
      console.error("Screen-time safeTxHash computation failed:", err instanceof Error ? err.message : err);
    }
  }
  recordDecision({
    jobId: job.id,
    txId: job.tx_id,
    txVersion: job.tx_version,
    safeAddress: job.safe_address,
    inputHash: base.inputHash,
    safeTxHash: screenedSafeTxHash,
    decision,
    evaluatedAt: payload.evaluatedAt,
    recordedAt: new Date().toISOString(),
  });
  const outcome = await client.submitResult({
    ...base,
    policyVersion: `snapshot:${computeInputHash(payload.snapshot).slice(0, 16)}`,
    result: { decision, evaluatedAt: payload.evaluatedAt },
  });
  return outcomeFromDecision(outcome.decision);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Run the pull loop until the returned controller is stopped. */
export function startWorker(config: WorkerConfig): { stats: WorkerStats; stop: () => void; done: Promise<void> } {
  const client = new RuntimeApiClient({ baseUrl: config.apiBaseUrl, token: config.apiToken });
  const stats: WorkerStats = {
    startedAt: new Date().toISOString(),
    lastPollAt: null,
    jobsSucceeded: 0,
    jobsFailed: 0,
    jobsVoided: 0,
    jobsRejected: 0,
    lastError: null,
  };
  let running = true;

  const done = (async () => {
    while (running) {
      try {
        stats.lastPollAt = new Date().toISOString();
        const leased = await client.lease(config.agentInstanceId);
        if (!leased) {
          await sleep(config.pollIntervalMs);
          continue;
        }
        const heartbeat = setInterval(() => {
          client.heartbeat(leased.job.id, leased.leaseToken).catch(() => undefined);
        }, 30_000);
        try {
          const outcome = await processJob(client, config.agentInstanceId, leased.job, leased.leaseToken);
          if (outcome === "succeeded") stats.jobsSucceeded++;
          else if (outcome === "voided") stats.jobsVoided++;
          else if (outcome === "rejected") {
            stats.jobsRejected++;
            stats.lastError = `submission rejected for job ${leased.job.id}`;
            console.error(`Result submission rejected for job ${leased.job.id} — job NOT settled by this worker`);
          } else stats.jobsFailed++;
        } finally {
          clearInterval(heartbeat);
        }
      } catch (err) {
        stats.lastError = err instanceof Error ? err.message : String(err);
        console.error("Worker loop error:", stats.lastError);
        await sleep(config.pollIntervalMs);
      }
    }
  })();

  return { stats, stop: () => { running = false; }, done };
}

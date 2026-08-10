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
  JOB_SCHEMA_VERSION,
  type DecodedKind,
  type PatternsFile,
  type PendingTransaction,
  type WireJob,
} from "zhentan-screening";
import { RuntimeApiClient } from "./apiClient.js";

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
): Promise<"succeeded" | "failed"> {
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

  if (job.kind !== "screen") {
    // Sign jobs arrive at D4 — refuse non-retryably rather than letting the
    // lease expire into pointless retries.
    await client.submitResult(
      { ...base, policyVersion: "none", result: null },
      { success: false, retryable: false, error: `job kind '${job.kind}' not supported by this runtime version` }
    );
    return "failed";
  }

  const payload = job.payload as unknown as ScreenPayload;
  const decision = evaluateTransaction(
    payload.tx,
    payload.snapshot,
    payload.decoded,
    new Date(payload.evaluatedAt)
  );
  await client.submitResult({
    ...base,
    policyVersion: `snapshot:${computeInputHash(payload.snapshot).slice(0, 16)}`,
    result: { decision, evaluatedAt: payload.evaluatedAt },
  });
  return "succeeded";
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
          else stats.jobsFailed++;
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

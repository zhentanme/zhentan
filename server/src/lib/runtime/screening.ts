/**
 * Authoritative screening via the runtime (D3). The propose handler
 * enqueues a screen job and OBSERVES the transaction row for the applied
 * outcome with a bounded timeout — a co-located runtime answers in
 * milliseconds, preserving the synchronous autoExecuted/txHash UX; on
 * timeout the response degrades to pending/screening and the decision is
 * applied whenever it lands (lib/screening/apply.ts, fired by the Runtime
 * API result endpoint).
 *
 * Fail-closed by construction: no runtime → no decision → the transaction
 * stays queued and nothing executes. Relay-only and backup-key co-sign
 * flows never enter this path.
 */
import { supabase } from "../supabase/client.js";
import { enqueueJob } from "./jobs.js";
import { encodeWireValue } from "./jobsPolicy.js";
import { getTransaction } from "../supabase/index.js";
import { loadPolicySnapshot } from "../../agent/index.js";
import { decodeSafeTxKind } from "../safe/kind.js";
import { applyScreeningDecision } from "../screening/apply.js";
import type { PendingTransaction } from "../../types.js";

export const SCREENING_TIMEOUT_MS = Number(process.env.SCREENING_TIMEOUT_MS || 20_000);
const POLL_MS = 250;

/**
 * Enqueue the authoritative screen job for a freshly proposed transaction.
 * Inputs are assembled backend-side (snapshot, decoded calldata, pinned
 * evaluatedAt) and travel in the payload — the runtime reads no state.
 * Returns false when the job could not be enqueued (proposal stays queued;
 * fail-closed).
 */
export async function enqueueScreenJob(tx: PendingTransaction): Promise<boolean> {
  try {
    const evaluatedAt = new Date();
    const snapshot = await loadPolicySnapshot(tx.safeAddress ?? "");
    const decoded =
      tx.txType === "safetx" && tx.safeTx ? decodeSafeTxKind(tx.safeTx, tx.safeAddress) : undefined;
    const { data: row, error } = await supabase
      .from("transactions")
      .select("version")
      .eq("id", tx.id)
      .maybeSingle<{ version: number }>();
    if (error) throw new Error(error.message);
    await enqueueJob({
      kind: "screen",
      safeAddress: tx.safeAddress,
      txId: tx.id,
      txVersion: row?.version ?? 1,
      payload: {
        tx: encodeWireValue(tx) as Record<string, unknown>,
        snapshot: encodeWireValue(snapshot) as Record<string, unknown>,
        decoded: decoded === undefined ? undefined : (encodeWireValue(decoded) as Record<string, unknown>),
        evaluatedAt: evaluatedAt.toISOString(),
      },
    });
    return true;
  } catch (err) {
    console.error(`Screen job enqueue failed for ${tx.id}:`, err instanceof Error ? err.message : err);
    return false;
  }
}

/**
 * Screening reconciler (D3 review) — the durability net around the fast
 * path. Two independent healing passes, both idempotent:
 *
 *  (a) MISSING JOB: an eligible screened transaction (no verdict, not
 *      executed/rejected/off, recent) with no screen job at all — the
 *      enqueue failed after the proposal row was created. Re-enqueue.
 *  (b) UNAPPLIED DECISION: a succeeded screen job whose transaction still
 *      carries no verdict — the fire-and-forget application crashed after
 *      the RPC committed. Re-apply (atomically claimed, so racing a live
 *      apply is harmless).
 *
 * Residual window, accepted and documented: a crash INSIDE apply after the
 * claim write but before notifications/execution finish loses only those
 * side effects — the verdict is durable, the transaction is visible
 * in-review/approved in the dashboard, and the existing TG `approve <id>`
 * retry path covers execution. Full outbox machinery is deliberately not
 * built for that millisecond window.
 */
const RECONCILE_WINDOW_MS = 24 * 60 * 60 * 1000;

export async function screeningReconcilerPass(): Promise<{ enqueued: number; applied: number }> {
  const since = new Date(Date.now() - RECONCILE_WINDOW_MS).toISOString();
  let enqueued = 0;
  let applied = 0;

  // (a) eligible transactions with no screen job
  const { data: candidates, error: txError } = await supabase
    .from("transactions")
    .select("id")
    .is("risk_verdict", null)
    .is("executed_at", null)
    .eq("rejected", false)
    .eq("screening_disabled", false)
    .or("rejection_status.is.null,rejection_status.eq.superseded")
    .gte("proposed_at", since)
    .limit(20)
    .returns<{ id: string }[]>();
  if (txError) throw new Error(`Reconciler tx query failed: ${txError.message}`);
  for (const { id } of candidates ?? []) {
    const { data: jobs, error: jobError } = await supabase
      .from("runtime_jobs")
      .select("id")
      .eq("tx_id", id)
      .eq("kind", "screen")
      .limit(1);
    if (jobError) {
      console.error(`Reconciler job lookup failed for ${id}:`, jobError.message);
      continue;
    }
    if (jobs?.length) continue; // job exists (any state) — protocol owns it
    const tx = await getTransaction(id);
    if (tx && (await enqueueScreenJob(tx))) {
      enqueued++;
      console.warn(`Screening reconciler re-enqueued missing screen job for ${id}`);
    }
  }

  // (b) succeeded screen jobs whose transaction has no verdict
  const { data: unapplied, error: jobsError } = await supabase
    .from("runtime_jobs")
    .select("id, tx_id, result")
    .eq("kind", "screen")
    .eq("status", "succeeded")
    .gte("updated_at", since)
    .order("updated_at", { ascending: true })
    .limit(50)
    .returns<{ id: string; tx_id: string; result: { decision?: unknown } | null }[]>();
  if (jobsError) throw new Error(`Reconciler jobs query failed: ${jobsError.message}`);
  for (const job of unapplied ?? []) {
    const { data: tx, error } = await supabase
      .from("transactions")
      .select("risk_verdict")
      .eq("id", job.tx_id)
      .maybeSingle<{ risk_verdict: string | null }>();
    if (error || !tx || tx.risk_verdict) continue;
    const decision = job.result?.decision as Parameters<typeof applyScreeningDecision>[1] | undefined;
    if (!decision) continue;
    const outcome = await applyScreeningDecision(job.tx_id, decision).catch((err) => {
      console.error(`Reconciler apply failed for ${job.tx_id}:`, err);
      return null;
    });
    if (outcome && outcome.status.startsWith("applied")) {
      applied++;
      console.warn(`Screening reconciler applied stranded decision for ${job.tx_id} (${outcome.status})`);
    }
  }

  return { enqueued, applied };
}

const RECONCILE_INTERVAL_MS = 60 * 1000;

export function startScreeningReconciler(): void {
  setInterval(() => {
    screeningReconcilerPass().catch((err) =>
      console.error("Screening reconciler pass failed:", err instanceof Error ? err.message : err)
    );
  }, RECONCILE_INTERVAL_MS).unref();
  console.log(`Screening reconciler up (every ${RECONCILE_INTERVAL_MS / 1000}s)`);
}

export type ScreeningOutcome =
  | {
      kind: "executed";
      risk: { riskScore: number; verdict: string; reasons: string[] };
      txHash?: string;
    }
  | { kind: "approve_pending"; risk: { riskScore: number; verdict: string; reasons: string[] } }
  | { kind: "review" | "blocked"; risk: { riskScore: number; verdict: string; reasons: string[] } }
  | { kind: "rejected" };

/**
 * Observe the transaction row until the applied decision (and, for
 * APPROVE, the execution outcome) is visible, or the deadline passes.
 * Returns null on timeout — the caller degrades to pending/screening.
 */
export async function awaitScreeningOutcome(
  txId: string,
  timeoutMs: number = SCREENING_TIMEOUT_MS
): Promise<ScreeningOutcome | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const tx = await getTransaction(txId);
    if (!tx) return null;
    if (tx.rejected) return { kind: "rejected" };
    if (tx.riskVerdict) {
      const risk = {
        riskScore: tx.riskScore ?? 0,
        verdict: tx.riskVerdict,
        reasons: tx.riskReasons ?? [],
      };
      if (tx.riskVerdict === "APPROVE") {
        if (tx.executedAt) return { kind: "executed", risk, txHash: tx.txHash };
        // Verdict applied; execution still running — keep waiting for the
        // txHash until the deadline, then report approve_pending (matches
        // the pre-D3 autoExecuted:false response).
      } else {
        return { kind: tx.riskVerdict === "REVIEW" ? "review" : "blocked", risk };
      }
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
  const tx = await getTransaction(txId).catch(() => null);
  if (tx?.riskVerdict === "APPROVE") {
    return {
      kind: "approve_pending",
      risk: { riskScore: tx.riskScore ?? 0, verdict: tx.riskVerdict, reasons: tx.riskReasons ?? [] },
    };
  }
  return null;
}

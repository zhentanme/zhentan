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
import { decodeSafeTxKind, type DecodedKind } from "../safe/kind.js";
import { validateTransitionTx } from "../safe/transition.js";
import { applyScreeningDecision, sendReviewNotifications } from "../screening/apply.js";
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
    let decoded: DecodedKind | undefined =
      tx.txType === "safetx" && tx.safeTx ? decodeSafeTxKind(tx.safeTx, tx.safeAddress) : undefined;
    if (decoded?.kind === "config") {
      // Mark VALIDATED wallet-profile transitions so the engine auto-approves
      // them (regardless of whether the proposer sent the wire flag) instead
      // of scoring the Safe's own address as an unknown recipient. A config
      // self-call that fails validation stays plain config → review-worthy.
      try {
        const target = await validateTransitionTx(tx);
        decoded = { kind: "config", transition: { endState: target.endState, validated: true } };
      } catch {
        // Not a recognized transition — leave undecorated.
      }
    }
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
 * Screening reconciler (D3 review, hardened) — the durability net around
 * the fast path. Three healing passes, all idempotent, none starvable:
 *
 *  (a) MISSING/STALE JOB: an eligible screened transaction whose screen
 *      jobs cannot deliver an applicable decision anymore — no job at all,
 *      or only void jobs / jobs pinned to an older tx version — gets fresh
 *      screening work. Paginated with a persistent cursor so occupied
 *      pages can never starve later candidates. dead_letter/failed at the
 *      current version stay human-attention (dashboard-visible), not
 *      auto-churned.
 *  (b) UNAPPLIED DECISION: succeeded screen jobs are stamped with a
 *      durable application outcome (result.applyOutcome) once processed —
 *      the query selects ONLY unstamped rows, so already-handled jobs can
 *      never occupy the window.
 *  (c) STAGED RESUME after a post-claim crash, using existing durable
 *      completion markers: an APPROVE-verdict transaction that never
 *      executed resumes execution (attempt-capped); an in-review
 *      transaction with no notification_messages row gets its TG review
 *      notification re-sent (row presence = delivered, so retry converges).
 */
const RECONCILE_WINDOW_MS = 24 * 60 * 60 * 1000;
const RESUME_EXEC_MAX_ATTEMPTS = 5;
const PAGE = 20;
let passACursor = 0;

async function stampJob(jobId: string, patch: Record<string, unknown>): Promise<void> {
  const { data } = await supabase
    .from("runtime_jobs")
    .select("result")
    .eq("id", jobId)
    .maybeSingle<{ result: Record<string, unknown> | null }>();
  await supabase
    .from("runtime_jobs")
    .update({ result: { ...(data?.result ?? {}), ...patch }, updated_at: new Date().toISOString() })
    .eq("id", jobId);
}

export async function screeningReconcilerPass(): Promise<{
  enqueued: number;
  applied: number;
  resumedExec: number;
  renotified: number;
}> {
  const since = new Date(Date.now() - RECONCILE_WINDOW_MS).toISOString();
  let enqueued = 0;
  let applied = 0;
  let resumedExec = 0;
  let renotified = 0;

  // ── (a) eligible transactions whose screening work is missing or stale ──
  const { data: candidates, error: txError } = await supabase
    .from("transactions")
    .select("id, version")
    .is("risk_verdict", null)
    .is("executed_at", null)
    .eq("rejected", false)
    .eq("screening_disabled", false)
    .or("rejection_status.is.null,rejection_status.eq.superseded")
    .gte("proposed_at", since)
    .order("proposed_at", { ascending: true })
    .range(passACursor, passACursor + PAGE - 1)
    .returns<{ id: string; version: number }[]>();
  if (txError) throw new Error(`Reconciler tx query failed: ${txError.message}`);
  // Cursor pagination: advance through the full candidate set across
  // passes; wrap when a page comes back short. Occupied rows (active jobs
  // mid-flight) can then never permanently shadow later candidates.
  passACursor = (candidates?.length ?? 0) < PAGE ? 0 : passACursor + PAGE;

  for (const { id, version } of candidates ?? []) {
    const { data: jobs, error: jobError } = await supabase
      .from("runtime_jobs")
      .select("status, tx_version")
      .eq("tx_id", id)
      .eq("kind", "screen")
      .returns<{ status: string; tx_version: number }[]>();
    if (jobError) {
      console.error(`Reconciler job lookup failed for ${id}:`, jobError.message);
      continue;
    }
    const current = (jobs ?? []).filter((j) => j.tx_version === version);
    // A live or deliverable job at the CURRENT version owns this tx.
    if (current.some((j) => ["pending", "leased", "succeeded"].includes(j.status))) continue;
    // dead_letter/failed at the current version = deliberate terminal —
    // surfaced via the dead-letter endpoint, never auto-churned.
    if (current.some((j) => ["dead_letter", "failed"].includes(j.status))) continue;
    // Remaining: no job, only void jobs, or only stale-version jobs.
    const tx = await getTransaction(id);
    if (tx && (await enqueueScreenJob(tx))) {
      enqueued++;
      console.warn(`Screening reconciler enqueued replacement screen job for ${id}`);
    }
  }

  // ── (b) succeeded screen jobs not yet processed (durable stamp) ──
  const { data: unapplied, error: jobsError } = await supabase
    .from("runtime_jobs")
    .select("id, tx_id, tx_version, result")
    .eq("kind", "screen")
    .eq("status", "succeeded")
    .is("result->applyOutcome", null)
    .gte("updated_at", since)
    .order("updated_at", { ascending: true })
    .limit(50)
    .returns<{ id: string; tx_id: string; tx_version: number; result: { decision?: unknown } | null }[]>();
  if (jobsError) throw new Error(`Reconciler jobs query failed: ${jobsError.message}`);
  for (const job of unapplied ?? []) {
    const decision = job.result?.decision as Parameters<typeof applyScreeningDecision>[1] | undefined;
    if (!decision) {
      await stampJob(job.id, { applyOutcome: "no_decision", appliedAt: new Date().toISOString() });
      continue;
    }
    const outcome = await applyScreeningDecision(job.tx_id, decision, job.tx_version).catch((err) => {
      console.error(`Reconciler apply failed for ${job.tx_id}:`, err);
      return null;
    });
    if (!outcome) continue; // transient failure — retry next pass, unstamped
    await stampJob(job.id, { applyOutcome: outcome.status, appliedAt: new Date().toISOString() });
    if (outcome.status.startsWith("applied")) {
      applied++;
      console.warn(`Screening reconciler applied stranded decision for ${job.tx_id} (${outcome.status})`);
    }
  }

  // ── (c) staged resume after a post-claim crash ──
  // APPROVE claimed but never executed: resume execution, attempt-capped
  // via a durable counter on the job row.
  const { data: unexecuted, error: unexecutedError } = await supabase
    .from("transactions")
    .select("id")
    .eq("risk_verdict", "APPROVE")
    .is("executed_at", null)
    .eq("rejected", false)
    .eq("in_review", false)
    .eq("screening_disabled", false)
    .or("rejection_status.is.null,rejection_status.eq.superseded")
    .gte("proposed_at", since)
    .limit(10)
    .returns<{ id: string }[]>();
  if (unexecutedError) throw new Error(`Reconciler resume query failed: ${unexecutedError.message}`);
  for (const { id } of unexecuted ?? []) {
    const { data: job } = await supabase
      .from("runtime_jobs")
      .select("id, result")
      .eq("tx_id", id)
      .eq("kind", "screen")
      .eq("status", "succeeded")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle<{ id: string; result: Record<string, unknown> | null }>();
    const attempts = Number(job?.result?.resumeExecAttempts ?? 0);
    if (!job || attempts >= RESUME_EXEC_MAX_ATTEMPTS) continue;
    await stampJob(job.id, { resumeExecAttempts: attempts + 1 });
    const { runExecutionById } = await import("../execution/execute.js");
    const result = await runExecutionById(id).catch((err) => {
      console.error(`Reconciler execution resume failed for ${id}:`, err instanceof Error ? err.message : err);
      return null;
    });
    if (result?.status === "executed") {
      resumedExec++;
      console.warn(`Screening reconciler resumed execution for approved ${id}`);
    }
  }

  // REVIEW/BLOCK claimed but the TG notification never landed (no
  // notification_messages row): re-send. Row presence marks delivery, so
  // this converges instead of spamming.
  const { data: unnotified, error: unnotifiedError } = await supabase
    .from("transactions")
    .select("id, to_address, amount, token, to_token_address, token_icon_url, amount_usd, safe_address, tx_type, risk_score, risk_verdict, risk_reasons")
    .eq("in_review", true)
    .is("executed_at", null)
    .eq("rejected", false)
    .gte("proposed_at", since)
    .limit(10)
    .returns<
      {
        id: string; to_address: string; amount: string; token: string | null;
        to_token_address: string | null;
        token_icon_url: string | null; amount_usd: string | null; safe_address: string;
        tx_type: string | null; risk_score: number | null; risk_verdict: string | null;
        risk_reasons: string[] | null;
      }[]
    >();
  if (unnotifiedError) throw new Error(`Reconciler notify query failed: ${unnotifiedError.message}`);
  for (const row of unnotified ?? []) {
    const { data: msg } = await supabase
      .from("notification_messages")
      .select("tx_id")
      .eq("tx_id", row.id)
      .maybeSingle();
    if (msg) continue; // delivered (or resolved) — nothing to do
    await sendReviewNotifications(
      {
        id: row.id, to: row.to_address, amount: row.amount, token: row.token ?? undefined,
        toTokenAddress: row.to_token_address,
        tokenIconUrl: row.token_icon_url, amountUSD: row.amount_usd ?? undefined,
        safeAddress: row.safe_address, txType: row.tx_type ?? undefined,
      },
      {
        riskScore: row.risk_score ?? 0,
        verdict: (row.risk_verdict ?? "REVIEW") as "REVIEW" | "BLOCK",
        reasons: row.risk_reasons ?? [],
      },
      { includeEmail: false }
    ).catch((err) => console.error(`Reconciler re-notify failed for ${row.id}:`, err));
    renotified++;
    console.warn(`Screening reconciler re-sent review notification for ${row.id}`);
  }

  return { enqueued, applied, resumedExec, renotified };
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

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

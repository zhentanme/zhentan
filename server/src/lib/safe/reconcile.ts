/**
 * Shared reconciliation for the SafeTx flow.
 *
 * A pending / in-review SafeTx can be resolved OUTSIDE Zhentan — the user
 * confirms with their backup key and executes from app.safe.global (the
 * override path), or a different tx consumes the nonce. This folds that outcome
 * back into Zhentan's DB, keyed by the EXACT `safeTxHash` via the Transaction
 * Service (not a heuristic — so swaps/MultiSend reconcile correctly too).
 *
 * Two callers share it:
 *   - the safeSync worker sweeps every unresolved row on a 60s timer (background);
 *   - GET /transactions reconciles the rows it is about to render, on read, so a
 *     backup-key execution collapses to a single executed row on the first load
 *     instead of showing twice (pending + executed) until the next poll.
 *
 * Crucially it NEVER rejects on uncertainty. The instant a tx executes, the
 * chain nonce jumps — but the Transaction Service indexer lags a few seconds
 * behind. In that window we can't yet tell "our tx landed" (→ executed) from "a
 * different tx took the nonce" (→ superseded), so we report `confirming` and
 * leave the row untouched. Supersession is only ever declared once the SERVICE
 * has indexed past our nonce (its nonce moves in lockstep with `isExecuted`).
 */
import { getExecutedTxAtNonce } from "./service.js";
import { readSafeNonce } from "./onchain.js";
import { getTransaction, updateTransaction, syncLinkedRequest } from "../supabase/index.js";
import { finishExecution } from "../../routes/execute.js";
import type { PendingTransaction } from "../../types.js";

export type ReconcileOutcome =
  | { status: "executed"; txHash: string; success: boolean; executedBy: string }
  | { status: "superseded" }
  /** On-chain moved past our nonce but the service hasn't reconciled yet — in flight. */
  | { status: "confirming" }
  /** Nothing has consumed our nonce yet — genuinely still waiting. */
  | { status: "unresolved" };

const SUPERSEDE_REASON = "Superseded: Safe nonce consumed by another transaction";

/** Our own premature-supersede marking is a guess we re-verify; a user rejection is final. */
function isOwnSupersede(tx: { rejected?: boolean; rejectReason?: string }): boolean {
  return !!tx.rejected && !!tx.rejectReason?.startsWith("Superseded:");
}

// A supersede verdict can only be premature while the service indexer lags —
// a window of seconds. Re-verify for an hour after the marking, then treat it
// as final: without the bound, every dead "Superseded:" row is re-checked
// against the service on every list read, forever.
const SUPERSEDE_REVERIFY_WINDOW_MS = 60 * 60 * 1000;

function supersedeIsFinal(tx: { rejectedAt?: string }): boolean {
  const markedAt = new Date(tx.rejectedAt ?? NaN).getTime();
  return !(Date.now() - markedAt < SUPERSEDE_REVERIFY_WINDOW_MS);
}

// Per-row cooldown on the Transaction Service lookup. Reconcile runs from
// every GET /transactions list read AND the safeSync worker — without this,
// N open tabs polling at 8s multiply into N×rows service calls a minute,
// which is what exhausts the Safe API rate limit. Outcomes only change
// on-chain, so one service check per row per window is plenty; within the
// window we report `unresolved` and the row simply renders as-is.
const SERVICE_CHECK_COOLDOWN_MS = 30_000;
const lastServiceCheck = new Map<string, number>();

function underCooldown(txId: string): boolean {
  const last = lastServiceCheck.get(txId) ?? 0;
  if (Date.now() - last < SERVICE_CHECK_COOLDOWN_MS) return true;
  lastServiceCheck.set(txId, Date.now());
  return false;
}

/** Forget resolved rows so the cooldown map only tracks live ones. */
function clearCooldown(txId: string): void {
  lastServiceCheck.delete(txId);
}

/**
 * Reconciles a single SafeTx proposal against service / on-chain truth.
 *
 * Idempotent: a row already executed returns its recorded state without
 * re-writing or re-notifying. A row WE previously marked superseded is
 * re-verified (it may have been a premature call during indexing lag) and
 * healed back to executed if the tx actually landed. Best-effort: a service or
 * RPC blip returns `confirming`/`unresolved` and the next pass retries.
 */
export async function reconcileSafeTx(
  tx: PendingTransaction
): Promise<ReconcileOutcome> {
  if (tx.txType !== "safetx" || !tx.safeTxHash) return { status: "unresolved" };

  // Idempotency guard: re-read fresh so a row already resolved by /execute or a
  // concurrent reconcile is never double-written or double-notified.
  const fresh = await getTransaction(tx.id);
  if (fresh?.executedAt) {
    clearCooldown(tx.id);
    return {
      status: "executed",
      txHash: fresh.txHash ?? "",
      success: fresh.success ?? true,
      executedBy: fresh.executedBy ?? tx.proposedBy,
    };
  }
  // A user-initiated rejection is final. Our own "Superseded:" marking falls
  // through to be re-verified below (and healed if it actually executed) —
  // but only within the re-verify window; after that it's final too.
  if (fresh?.rejected && (!isOwnSupersede(fresh) || supersedeIsFinal(fresh))) {
    clearCooldown(tx.id);
    return { status: "superseded" };
  }

  if (tx.safeNonce === undefined) return { status: "unresolved" };

  // Checked against the service recently — nothing can have changed that the
  // DB reads above wouldn't already reflect. Skip the service round-trip.
  if (underCooldown(tx.id)) return { status: "unresolved" };

  // Authoritative: which safeTxHash did the service index as EXECUTED at OUR
  // nonce? We read by nonce and compare hashes rather than inferring from a
  // nonce delta — `getSafeInfo().nonce` can advance before the per-tx
  // `isExecuted` flag catches up, which is exactly what made us reject our own
  // in-flight tx. This reads the same `isExecuted` index for both, so "did I
  // win?" and "did someone else win?" can never disagree.
  let winner;
  try {
    winner = await getExecutedTxAtNonce(tx.safeAddress, tx.safeNonce);
  } catch {
    winner = null; // service blip — fall through to the chain hint below
  }

  if (winner) {
    if (winner.safeTxHash.toLowerCase() === tx.safeTxHash.toLowerCase()) {
      // Our tx won its nonce slot. Wait for the receipt hash before persisting.
      if (!winner.transactionHash) return { status: "confirming" };
      const success = winner.isSuccessful ?? true;
      // Actual executor — the user's backup key for a Safe-UI override.
      const executedBy = winner.executor ?? tx.proposedBy;
      await finishExecution(tx, winner.transactionHash, success, executedBy);
      clearCooldown(tx.id);
      return { status: "executed", txHash: winner.transactionHash, success, executedBy };
    }
    // A DIFFERENT hash occupied our nonce → genuinely superseded (a rejection,
    // or a competing tx executed from the Safe app).
    await updateTransaction(tx.id, {
      rejected: true,
      rejectedAt: new Date().toISOString(),
      rejectReason: SUPERSEDE_REASON,
      inReview: false,
    });
    // Drag a linked request (auto-approve flow) to rejected too.
    await syncLinkedRequest(tx.id, {
      status: "rejected",
      rejectedAt: new Date().toISOString(),
      rejectReason: SUPERSEDE_REASON,
    }).catch((err) => console.error("syncLinkedRequest (superseded) failed:", err));
    clearCooldown(tx.id);
    return { status: "superseded" };
  }

  // Nothing indexed as executed at our nonce yet. If the CHAIN has already moved
  // past it, an execution is in flight (the winner isn't indexed yet — could be
  // ours or a superseder). Report confirming and reject NOTHING.
  let chainNonce: number | undefined;
  try {
    chainNonce = await readSafeNonce(tx.safeAddress);
  } catch {
    chainNonce = undefined;
  }
  if (chainNonce !== undefined && chainNonce > tx.safeNonce) {
    return { status: "confirming" };
  }

  return { status: "unresolved" };
}

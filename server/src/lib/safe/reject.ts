/**
 * On-chain rejection for the SafeTx flow — a DURABLE JOB, not a flag (B4).
 *
 * Safe nonces are sequential: a rejected proposal at nonce n blocks every
 * later proposal until n is consumed. This executes the pre-signed empty
 * self-call at the same nonce (the Safe UI's own "Reject transaction"
 * pattern), co-signed by the agent and relayed by the sponsor EOA.
 *
 * State lives on the transaction row (`rejection_status`, see
 * rejectionState.ts). The user-visible `rejected` flag flips ONLY at
 * `rejected_confirmed` — a failed cancel lands in `failed_retryable` with
 * scheduled backoff and is retried by the safeSync worker instead of
 * silently parking the nonce (the pre-B4 bug).
 */
import { EthSafeSignature } from "@safe-global/protocol-kit";
import type { Hex } from "viem";

import type { PendingTransaction, SafeTxData } from "../../types.js";
import { computeSafeTxHash, getApiKit, proposeToService } from "./service.js";
import { readSafeNonce } from "./onchain.js";
import { assertSponsorGas, getSponsorWalletClient } from "../chain/sponsor.js";
import { getRelayerPublicClient } from "./relayer.js";
import { getSigningAuthority } from "../agent/signer.js";
import { encodeExecTransaction } from "../execution/assemble.js";
import { updateTransaction } from "../supabase/index.js";
import { MAX_CANCEL_ATTEMPTS, nextRetryAt } from "./rejectionState.js";

export interface RejectionResult {
  status: "cancelled" | "retrying" | "skipped";
  txHash?: string;
  reason?: string;
}

function buildRejectionTxData(safeAddress: string, nonce: number): SafeTxData {
  return {
    to: safeAddress,
    value: "0",
    data: "0x",
    operation: 0,
    safeTxGas: "0",
    baseGas: "0",
    gasPrice: "0",
    gasToken: "0x0000000000000000000000000000000000000000",
    refundReceiver: "0x0000000000000000000000000000000000000000",
    nonce,
  };
}

/** Terminal success: the cancel is on-chain — only now does `rejected` flip. */
async function confirmRejected(tx: PendingTransaction, cancelTxHash: string): Promise<void> {
  await updateTransaction(tx.id, {
    rejectionStatus: "rejected_confirmed",
    cancelTxHash,
    rejected: true,
    rejectedAt: tx.rejectedAt ?? new Date().toISOString(),
    cancelNextRetryAt: null,
  });
}

/** Failure: schedule a bounded retry (null schedule = dead-letter, needs a human). */
async function markRetryable(tx: PendingTransaction, attempts: number, err: unknown): Promise<void> {
  const message = err instanceof Error ? err.message : String(err);
  await updateTransaction(tx.id, {
    rejectionStatus: "failed_retryable",
    cancelAttempts: attempts,
    cancelLastError: message.slice(0, 500),
    cancelNextRetryAt: nextRetryAt(attempts),
  });
  if (attempts >= MAX_CANCEL_ATTEMPTS) {
    console.error(
      `Rejection cancel for ${tx.id} exhausted ${attempts} attempts — dead-letter, manual intervention needed`
    );
  }
}

/**
 * Executes the pre-signed rejection tx for a rejection-requested SafeTx
 * proposal, driving `rejection_status` through the state machine. Safe to
 * call again on failure — the safeSync worker retries `failed_retryable`
 * rows on their backoff schedule.
 */
export async function executeRejection(tx: PendingTransaction): Promise<RejectionResult> {
  if (tx.txType !== "safetx") return { status: "skipped", reason: "not a SafeTx" };
  if (tx.safeNonce === undefined || !tx.rejectionSignature) {
    return { status: "skipped", reason: "no pre-signed rejection available" };
  }

  const onChainNonce = await readSafeNonce(tx.safeAddress);
  if (onChainNonce > tx.safeNonce) {
    // Something else consumed the nonce — possibly this very tx via the
    // Safe-app override path. Hand the row to reconciliation to fold in the
    // real outcome; `rejected` stays false so safeSync can see it.
    await updateTransaction(tx.id, { rejectionStatus: "superseded", cancelNextRetryAt: null });
    return { status: "skipped", reason: "nonce already consumed on-chain" };
  }

  await assertSponsorGas();

  const attempts = (tx.cancelAttempts ?? 0) + 1;
  const rejectionTx = buildRejectionTxData(tx.safeAddress, tx.safeNonce);
  const rejectionHash = computeSafeTxHash(tx.safeAddress, rejectionTx);
  await updateTransaction(tx.id, {
    rejectionStatus: "cancel_signing",
    cancelSafeTxHash: rejectionHash,
    cancelAttempts: attempts,
  });

  // Mirror the rejection to the Transaction Service so the Safe UI renders it
  // natively. Best-effort — the on-chain cancel below is the load-bearing part.
  try {
    await proposeToService({
      safeAddress: tx.safeAddress,
      safeTx: rejectionTx,
      safeTxHash: rejectionHash,
      senderAddress: tx.proposedBy,
      senderSignature: tx.rejectionSignature,
      origin: "Zhentan (rejection)",
    });
    const agentSig = await getSigningAuthority().sign({
      purpose: "rejection",
      safeAddress: tx.safeAddress,
      safeTx: rejectionTx,
      expectedSafeTxHash: rejectionHash,
      transactionId: tx.id,
      threshold: tx.threshold,
    });
    await getApiKit().confirmTransaction(rejectionHash, agentSig.signature.data);
  } catch (err) {
    console.error("Rejection service mirror failed (continuing on-chain):", err);
  }

  // Execute the cancel directly from the pre-signed user signature + a fresh
  // agent signature — no service dependency. Sign and send are separate
  // hands: the payload is assembled explicitly (golden-tested encoding) and
  // the SPONSOR wallet broadcasts it.
  try {
    const agentSignature = (
      await getSigningAuthority().sign({
        purpose: "rejection",
        safeAddress: tx.safeAddress,
        safeTx: rejectionTx,
        expectedSafeTxHash: rejectionHash,
        transactionId: tx.id,
        threshold: tx.threshold,
      })
    ).signature;
    const calldata = encodeExecTransaction(rejectionTx, [
      new EthSafeSignature(tx.proposedBy, tx.rejectionSignature as Hex),
      agentSignature as EthSafeSignature,
    ]);

    const txHash = await getSponsorWalletClient().sendTransaction({
      to: tx.safeAddress as Hex,
      data: calldata,
      value: 0n,
    });
    await updateTransaction(tx.id, { rejectionStatus: "cancel_submitted", cancelTxHash: txHash });

    const receipt = await getRelayerPublicClient().waitForTransactionReceipt({ hash: txHash });
    if (receipt.status !== "success") {
      await markRetryable(tx, attempts, new Error(`cancel tx reverted: ${txHash}`));
      return { status: "retrying", txHash, reason: "cancel tx reverted" };
    }

    await confirmRejected(tx, txHash);
    return { status: "cancelled", txHash };
  } catch (err) {
    await markRetryable(tx, attempts, err);
    return {
      status: "retrying",
      reason: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Resume pass for the safeSync worker: picks up rejections a crash or
 * failure left mid-flight.
 *
 * - `cancel_submitted` with a known hash → check the receipt (confirm /
 *   retry) instead of re-broadcasting blindly.
 * - `failed_retryable` past its scheduled retry, and `requested` /
 *   `cancel_signing` rows older than a grace period (process died before
 *   submit) → run the cancel again; executeRejection re-checks the nonce
 *   first, so a consumed nonce degrades safely to `superseded`.
 */
export async function resumeRejection(tx: PendingTransaction): Promise<RejectionResult | null> {
  const now = Date.now();

  if (tx.rejectionStatus === "cancel_submitted" && tx.cancelTxHash) {
    try {
      const receipt = await getRelayerPublicClient().getTransactionReceipt({
        hash: tx.cancelTxHash as Hex,
      });
      if (receipt.status === "success") {
        await confirmRejected(tx, tx.cancelTxHash);
        return { status: "cancelled", txHash: tx.cancelTxHash };
      }
      await markRetryable(tx, tx.cancelAttempts ?? 1, new Error(`cancel tx reverted: ${tx.cancelTxHash}`));
      return { status: "retrying", reason: "cancel tx reverted" };
    } catch {
      // Receipt not found — dropped from the mempool or still propagating.
      await markRetryable(tx, tx.cancelAttempts ?? 1, new Error("cancel tx not found on-chain"));
      return { status: "retrying", reason: "cancel tx not found" };
    }
  }

  if (tx.rejectionStatus === "failed_retryable") {
    if (!tx.cancelNextRetryAt) return null; // dead-letter — a human's move
    if (Date.parse(tx.cancelNextRetryAt) > now) return null; // not due yet
    return executeRejection(tx);
  }

  const STUCK_GRACE_MS = 5 * 60 * 1000;
  if (tx.rejectionStatus === "requested" || tx.rejectionStatus === "cancel_signing") {
    const since = Date.parse(tx.rejectedAt ?? tx.proposedAt);
    if (now - since > STUCK_GRACE_MS) return executeRejection(tx);
  }

  return null;
}

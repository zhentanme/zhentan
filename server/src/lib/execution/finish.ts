import {
  updateTransaction,
  getUserDetails,
  getUserByAddress,
  syncLinkedRequest,
} from "../supabase/index.js";
import { learnFromExecution, recordOutcome } from "../../agent/index.js";
import { notify } from "../../notifications/index.js";
import type { PendingTransaction } from "../../types.js";

/**
 * Shared post-execution bookkeeping for both flows: persist the outcome,
 * learn patterns, and notify sender + (Zhentan) recipient.
 */
export async function finishExecution(
  tx: PendingTransaction,
  txHash: string,
  success: boolean,
  executedBy: string
): Promise<void> {
  const executedTx = {
    ...tx,
    inReview: false,
    executedAt: new Date().toISOString(),
    executedBy,
    txHash,
    success,
  };

  await updateTransaction(tx.id, {
    inReview: false,
    // An executed tx is definitionally not rejected — clears a stale
    // "Superseded:" marking if reconcile confirms the tx actually landed.
    rejected: false,
    executedAt: executedTx.executedAt,
    executedBy,
    txHash,
    success,
  });

  // Fire-and-forget: learn from execution and notify the user
  Promise.all([
    // If this tx came from a request (auto-approve flow), drag the request to
    // executed too — so its status is authoritative regardless of whether a
    // dialog was open to poll it. No-op for normal sends.
    syncLinkedRequest(tx.id, {
      status: "executed",
      executedAt: executedTx.executedAt,
      txHash: String(txHash),
    }),
    learnFromExecution(executedTx),
    recordOutcome(executedTx, "auto_approved", {
      riskScore: tx.riskScore,
      riskVerdict: tx.riskVerdict,
      riskReasons: tx.riskReasons,
    }),
    getUserDetails(tx.safeAddress).then((user) => {
      if (!user) return;
      return notify("tx_sent", user, {
        txId: tx.id,
        amount: tx.amount,
        token: tx.token || "USDC",
        tokenLogoUrl: tx.tokenIconUrl ?? undefined,
        amountUsd: tx.amountUSD ? `$${tx.amountUSD}` : undefined,
        toAddress: tx.to,
        txHash: String(txHash),
        riskScore: tx.riskScore ?? undefined,
        autoApproved: tx.riskVerdict === "APPROVE",
      });
    }),
    getUserByAddress(tx.to).then((recipient) => {
      if (!recipient) return;
      // Skip if sender and recipient are the same Safe
      if (recipient.safe_address.toLowerCase() === tx.safeAddress.toLowerCase()) return;
      return notify("tx_received", recipient, {
        amount: tx.amount,
        token: tx.token || "USDC",
        tokenLogoUrl: tx.tokenIconUrl ?? undefined,
        amountUsd: tx.amountUSD ? `$${tx.amountUSD}` : undefined,
        fromAddress: tx.safeAddress,
        txHash: String(txHash),
      });
    }),
  ]).catch((err) => console.error("Post-execute tasks failed:", err));
}

/**
 * Finalization of agent-proposed draft transactions — the moment a draft
 * becomes signable: nonce assigned, EIP-712 hash computed, and the proposal
 * mirrored to the Safe Transaction Service at 1/2 with the agent's signature
 * (it screened the draft, so signing is consistent with the invariant).
 *
 * Called from two places:
 *   - agentPropose, immediately after creating a TRANSFER draft — transfer
 *     calldata can't go stale, so finalizing eagerly makes the pending
 *     request visible in app.safe.global right away (parity with the
 *     pre-draft flow). The cost: dismissing an already-finalized transfer
 *     parks its nonce until superseded, as it always did before drafts.
 *   - POST /transactions/:id/finalize, when the user approves — the lazy
 *     path SWAPS stay on: their quote (route + min-out) is rebuilt fresh
 *     here, because a quote built at queue time reverts on-chain (GS013) by
 *     the time the user signs.
 */
import {
  computeSafeTxHash,
  getNextSafeNonce,
  getProtocolKit,
  proposeToService,
} from "./service.js";
import { getAgentAddress } from "./relayer.js";
import { KIND_BUILDERS, buildSafeTxFromCalls } from "./builders.js";
import { getRequestByTxId, updateTransaction } from "../supabase/index.js";
import type { PendingTransaction } from "../../types.js";

/** Swap re-quote failed — the caller should tell the user to re-queue. */
export class SwapRefreshError extends Error {}

export async function finalizeDraft(tx: PendingTransaction): Promise<PendingTransaction> {
  // Already finalized (or a user proposal, which is born finalized).
  if (tx.safeTxHash) return tx;
  if (!tx.safeTx) throw new Error("Draft has no safeTx payload");

  // Swap drafts re-quote NOW: their calldata was built when the agent queued
  // the request, and a stale min-out reverts on-chain. Nothing is signed
  // yet, so rebuilding is free; the user signs the fresh payload.
  let safeTxBase = tx.safeTx;
  let display: { to?: string; toTokenAddress?: string } = {};
  const linkedRequest = await getRequestByTxId(tx.id).catch(() => null);
  if (linkedRequest?.kind === "swap" && linkedRequest.fromToken && linkedRequest.toToken) {
    const rebuilt = await KIND_BUILDERS.swap({
      safeAddress: tx.safeAddress,
      fromToken: linkedRequest.fromToken,
      toToken: linkedRequest.toToken,
      sellAmount: linkedRequest.amount,
      slippage: linkedRequest.slippage,
    });
    if (!rebuilt) {
      throw new SwapRefreshError(
        "Swap route could not be refreshed — ask Zhentan to queue the swap again"
      );
    }
    safeTxBase = buildSafeTxFromCalls(rebuilt.calls, 0);
    display = { to: rebuilt.display.to, toTokenAddress: rebuilt.display.toTokenAddress };
  }

  const nonce = await getNextSafeNonce(tx.safeAddress);
  const safeTx = { ...safeTxBase, nonce };
  const safeTxHash = computeSafeTxHash(tx.safeAddress, safeTx);
  await updateTransaction(tx.id, {
    safeTx,
    safeTxHash,
    safeNonce: nonce,
    ...(display.to && { to: display.to }),
    ...(display.toTokenAddress && { toTokenAddress: display.toTokenAddress }),
  });

  // Mirror to the Transaction Service at 1/2 so the tx is visible in
  // app.safe.global. Best-effort: a service outage must not block the flow —
  // execution assembles signatures locally.
  try {
    const protocolKit = await getProtocolKit(tx.safeAddress);
    const agentSig = await protocolKit.signHash(safeTxHash);
    await proposeToService({
      safeAddress: tx.safeAddress,
      safeTx,
      safeTxHash,
      senderAddress: getAgentAddress(),
      senderSignature: agentSig.data,
      origin: "Zhentan (agent draft)",
    });
  } catch (err) {
    console.error("Draft finalize: service mirror failed (continuing):", err);
  }

  return {
    ...tx,
    ...(display.to && { to: display.to }),
    ...(display.toTokenAddress && { toTokenAddress: display.toTokenAddress }),
    safeTx,
    safeTxHash,
    safeNonce: nonce,
    draft: undefined,
  };
}

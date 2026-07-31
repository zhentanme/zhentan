/**
 * Finalization of agent-proposed draft transactions — the moment a draft
 * becomes signable: nonce assigned, EIP-712 hash computed, and the proposal
 * mirrored to the Safe Transaction Service at 1/2 with the agent's signature
 * (it screened the draft, so signing is consistent with the invariant).
 *
 * Called from two places:
 *   - agentPropose, immediately after creating an APPROVE-scored draft of
 *     ANY kind (freshQuote: false — the payload was built seconds ago).
 *     Eager finalization makes the pending request visible in
 *     app.safe.global right away, parity with the pre-draft flow. The cost:
 *     dismissing an already-finalized draft parks its nonce until
 *     superseded, as it always did before drafts. REVIEW-band swaps skip
 *     this and stay lazy.
 *   - POST /transactions/:id/finalize, when the user approves (freshQuote
 *     defaults true) — SWAP calldata is rebuilt with a fresh quote here,
 *     because a queue-time quote's min-out reverts on-chain (GS013) by
 *     signing time. An eager-finalized swap is re-proposed at the SAME
 *     nonce, superseding its stale service proposal; the user always signs
 *     the fresh hash.
 */
import {
  computeSafeTxHash,
  getNextSafeNonce,
  getProtocolKit,
  proposeToService,
} from "./service.js";
import { readSafeNonce } from "./onchain.js";
import { getAgentAddress } from "./relayer.js";
import { KIND_BUILDERS, buildSafeTxFromCalls } from "./builders.js";
import { getRequestByTxId, updateTransaction } from "../supabase/index.js";
import type { PendingTransaction } from "../../types.js";

/** Swap re-quote failed — the caller should tell the user to re-queue. */
export class SwapRefreshError extends Error {}

export async function finalizeDraft(
  tx: PendingTransaction,
  opts?: {
    /**
     * Rebuild swap calldata with a fresh quote (approval-time semantics,
     * the default). Creation-time callers pass false — the quote was built
     * seconds ago. A signed transaction is never touched either way.
     */
    freshQuote?: boolean;
  }
): Promise<PendingTransaction> {
  const freshQuote = opts?.freshQuote ?? true;
  // A signed payload is immutable — and a user proposal is born signed.
  if (tx.userSignature) return tx;
  if (!tx.safeTx) throw new Error("Draft has no safeTx payload");

  const linkedRequest = await getRequestByTxId(tx.id).catch(() => null);
  const swapRequest =
    linkedRequest?.kind === "swap" && linkedRequest.fromToken && linkedRequest.toToken
      ? linkedRequest
      : null;

  // Already finalized and there is nothing to refresh → done. (An
  // eager-finalized SWAP does get refreshed at approval: its queue-time
  // quote is stale by now, and re-proposing the fresh payload at the SAME
  // nonce supersedes the stale service proposal.)
  if (tx.safeTxHash && (!freshQuote || !swapRequest)) return tx;

  let safeTxBase = tx.safeTx;
  let display: { to?: string; toTokenAddress?: string } = {};
  if (swapRequest && freshQuote) {
    const rebuilt = await KIND_BUILDERS.swap({
      safeAddress: tx.safeAddress,
      fromToken: swapRequest.fromToken!,
      toToken: swapRequest.toToken!,
      sellAmount: swapRequest.amount,
      slippage: swapRequest.slippage,
    });
    if (!rebuilt) {
      throw new SwapRefreshError(
        "Swap route could not be refreshed — ask Zhentan to queue the swap again"
      );
    }
    safeTxBase = buildSafeTxFromCalls(rebuilt.calls, 0);
    display = { to: rebuilt.display.to, toTokenAddress: rebuilt.display.toTokenAddress };
  }

  // Reuse an already-assigned nonce so the refreshed payload replaces the
  // stale proposal at the same queue slot — unless the chain has moved past
  // it while the draft sat (then the slot is gone; take the next free one).
  let nonce: number;
  if (tx.safeNonce !== undefined) {
    const onChainNonce = await readSafeNonce(tx.safeAddress);
    nonce =
      tx.safeNonce >= onChainNonce ? tx.safeNonce : await getNextSafeNonce(tx.safeAddress);
  } else {
    nonce = await getNextSafeNonce(tx.safeAddress);
  }
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

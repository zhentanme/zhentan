/**
 * Agent-initiated proposals (the request → transaction half of the pipeline).
 *
 * The agent builds the SafeTx for a queued request — any kind in the builder
 * registry (transfer, swap) — and stores it as a DRAFT: a normal row the user
 * completes with one signature. A draft is born with the full call payload
 * but no nonce, hash, or signature; finalizeDraft() is what makes it signable
 * (nonce + hash + agent-signed 1/2 mirror to the Transaction Service).
 *
 * WHEN a draft finalizes is per-kind:
 *   - TRANSFERS finalize eagerly right here — their calldata can't go stale,
 *     and the mirror makes the pending request visible in app.safe.global
 *     immediately. Dismissing one parks its nonce until superseded (the
 *     pre-draft flow behaved the same way).
 *   - SWAPS finalize lazily when the user approves — the quote (route +
 *     min-out) is rebuilt fresh at that moment; a queue-time quote reverts
 *     on-chain (GS013) by the time the user signs. A dismissed swap draft
 *     never parks a nonce.
 *
 * The agent's execution signature happens at /execute like every screened
 * transaction; the user's signature is always mandatory to reach the
 * threshold, so the agent can never move funds alone. An agent-proposed row
 * is identified by `userSignature` being null (a user-proposed tx always
 * carries it).
 */
import { randomUUID } from "crypto";

import { KIND_BUILDERS, buildSafeTxFromCalls, type BuiltCalls } from "./builders.js";
import { finalizeDraft } from "./finalizeDraft.js";
import { isSafeDeployed } from "./deploy.js";
import { getAgentAddress } from "./relayer.js";
import { getUserDetails, createTransaction } from "../supabase/index.js";
import type { PendingTransaction, RequestKind } from "../../types.js";

export interface AgentProposeInput {
  kind: RequestKind;
  safeAddress: string;
  /** transfer: recipient address. Ignored for swaps (display shows the router). */
  to?: string;
  /** transfer: human-readable amount. */
  amount?: string;
  /** transfer: token symbol. */
  token?: string;
  /** swap: sell-token symbol. */
  fromToken?: string;
  /** swap: buy-token symbol. */
  toToken?: string;
  /** swap: human-readable sell amount. */
  sellAmount?: string;
  /** swap: slippage fraction (0.005 = 0.5%). */
  slippage?: number;
  riskScore: number;
  riskVerdict?: "APPROVE" | "REVIEW" | "BLOCK";
  riskReasons: string[];
}

/**
 * Builds a draft SafeTx for a request and stores it as a pending row awaiting
 * the user's signature. Returns the tx id, or null when the draft can't be
 * built (undeployed Safe, unknown embedded owner, unresolvable token, no
 * swap route, or a build error) — the request then just stays queued with its
 * risk score.
 */
export async function agentProposeFromRequest(
  input: AgentProposeInput
): Promise<string | null> {
  const { kind, safeAddress, riskScore, riskVerdict, riskReasons } = input;
  try {
    const record = await getUserDetails(safeAddress);
    const embedded = record?.signer_address;
    if (!embedded) return null; // no known user owner to co-sign later
    if (!record?.safe_deployed && !(await isSafeDeployed(safeAddress))) return null;

    let built: BuiltCalls | null = null;
    if (kind === "swap") {
      if (!input.fromToken || !input.toToken || !input.sellAmount) return null;
      built = await KIND_BUILDERS.swap({
        safeAddress,
        fromToken: input.fromToken,
        toToken: input.toToken,
        sellAmount: input.sellAmount,
        slippage: input.slippage,
      });
    } else {
      if (!input.to || !input.amount || !input.token) return null;
      built = await KIND_BUILDERS.transfer({
        safeAddress,
        to: input.to,
        amount: input.amount,
        token: input.token,
      });
    }
    if (!built) return null;

    // Placeholder nonce — replaced at finalize time; the stored hash-less
    // draft can't be signed or executed until then.
    const safeTx = buildSafeTxFromCalls(built.calls, 0);

    const owners =
      record.safe_owners?.length
        ? record.safe_owners
        : [embedded, getAgentAddress()];

    const txId = `tx-${randomUUID().slice(0, 8)}`;
    const tx: PendingTransaction = {
      id: txId,
      txType: "safetx",
      draft: true,
      to: built.display.to,
      amount: built.display.amount,
      token: built.display.token,
      tokenAddress: built.display.tokenAddress,
      ...(built.display.toTokenAddress && { toTokenAddress: built.display.toTokenAddress }),
      proposedBy: embedded, // the eventual user signer (owner #1)
      // userSignature left undefined → awaiting the user
      signatures: [],
      ownerAddresses: owners,
      threshold: record.safe_threshold ?? 2,
      safeAddress,
      safeTx,
      riskScore,
      riskVerdict: riskVerdict ?? "APPROVE",
      riskReasons,
      proposedAt: new Date().toISOString(),
    };
    await createTransaction(tx);

    // Transfers finalize at creation: their calldata can't go stale, and the
    // eager nonce + agent-signed 1/2 mirror makes the pending request visible
    // in app.safe.global immediately (parity with the pre-draft flow). Swaps
    // stay lazy — finalize re-quotes them when the user approves. Best-effort:
    // a failure here leaves a lazy draft the approve flow finalizes instead.
    if (kind === "transfer") {
      await finalizeDraft(tx).catch((err) =>
        console.error("agentPropose: eager finalize failed (draft stays lazy):", err)
      );
    }

    return txId;
  } catch (err) {
    console.error("agentPropose failed (request stays queued):", err);
    return null;
  }
}

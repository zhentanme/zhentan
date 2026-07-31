/**
 * Agent-initiated proposals (the request → transaction half of the pipeline).
 *
 * The agent builds the SafeTx for a queued request — any kind in the builder
 * registry (transfer, swap) — and stores it as a DRAFT: a normal row the user
 * completes with one signature. Drafts carry the full call payload but NO
 * nonce, hash, or signature of any party:
 *
 *   - The nonce is assigned and the EIP-712 hash computed only when the user
 *     finalizes to sign (POST /transactions/:id/finalize). A dismissed draft
 *     therefore never parks a Safe nonce and needs no on-chain rejection.
 *   - The agent's signature happens at execution time like every screened
 *     transaction (/execute signs fresh) — consistent with "the agent never
 *     signs what it didn't screen", and the user's signature is still
 *     mandatory to reach the threshold, so the agent can never move funds
 *     alone.
 *   - Drafts are never mirrored to the Transaction Service (a mirror needs a
 *     nonce). Visibility in app.safe.global starts once the user signs.
 *
 * An agent-proposed row is identified by `draft: true` (plus `userSignature`
 * being null — a user-proposed tx always carries it).
 */
import { randomUUID } from "crypto";

import { KIND_BUILDERS, buildSafeTxFromCalls, type BuiltCalls } from "./builders.js";
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
    return txId;
  } catch (err) {
    console.error("agentPropose failed (request stays queued):", err);
    return null;
  }
}

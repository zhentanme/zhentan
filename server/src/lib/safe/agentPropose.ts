/**
 * Agent-initiated proposal for low-risk requests (the "auto-approve" path).
 *
 * When a request scores APPROVE, the agent builds the transfer SafeTx and adds
 * ITS co-signature up front — the tx lands at 1-of-2, pre-screened. The user
 * then completes it with a single signature and the relayer executes, or
 * rejects it. This inverts the normal ordering (agent signs first), which is
 * only sound because the agent DID screen it — consistent with "the agent never
 * signs what it didn't screen". The user's signature is still mandatory to
 * reach the threshold, so the agent can never move funds alone.
 *
 * An agent-proposed tx is identified by `userSignature` being null (a
 * user-proposed tx always carries it) — no schema change needed.
 */
import { encodeFunctionData, parseUnits, type Address, type Hex } from "viem";
import { randomUUID } from "crypto";

import { ERC20_TRANSFER_ABI, NATIVE_TOKEN_ADDRESS } from "../constants.js";
import { fetchTokenPositions } from "../zerion.js";
import {
  getNextSafeNonce,
  computeSafeTxHash,
  getProtocolKit,
  proposeToService,
} from "./service.js";
import { isSafeDeployed } from "./deploy.js";
import { getAgentAddress } from "./relayer.js";
import { getUserDetails, createTransaction } from "../supabase/index.js";
import type { PendingTransaction, SafeTxData } from "../../types.js";

/** Resolve a token symbol → { address, decimals } from the Safe's holdings. */
async function resolveToken(
  safeAddress: string,
  symbol: string
): Promise<{ address: string; decimals: number } | null> {
  if (symbol.toUpperCase() === "BNB") {
    return { address: NATIVE_TOKEN_ADDRESS, decimals: 18 };
  }
  try {
    const { tokens } = await fetchTokenPositions(safeAddress);
    const t = tokens.find(
      (x) => x.address && x.symbol?.toUpperCase() === symbol.toUpperCase()
    );
    if (t?.address) return { address: t.address, decimals: t.decimals };
  } catch {
    /* fall through */
  }
  return null;
}

export interface AgentProposeInput {
  safeAddress: string;
  to: string;
  amount: string; // human-readable
  token: string; // symbol
  riskScore: number;
  riskReasons: string[];
}

/**
 * Builds + agent-signs a transfer SafeTx for an APPROVE request and stores it as
 * a pending (1-of-2) transaction, mirrored to the Transaction Service. Returns
 * the tx id, or null when it can't pre-sign (undeployed Safe, unknown embedded
 * owner, unresolvable token, or a build error) — the request then just stays
 * queued with its risk score.
 */
export async function agentProposeFromRequest(
  input: AgentProposeInput
): Promise<string | null> {
  const { safeAddress, to, amount, token, riskScore, riskReasons } = input;
  try {
    const record = await getUserDetails(safeAddress);
    const embedded = record?.signer_address;
    if (!embedded) return null; // no known user owner to co-sign later
    if (!record?.safe_deployed && !(await isSafeDeployed(safeAddress))) return null;

    const tk = await resolveToken(safeAddress, token);
    if (!tk) return null;

    const amountWei = parseUnits(amount, tk.decimals);
    const isNative = tk.address.toLowerCase() === NATIVE_TOKEN_ADDRESS.toLowerCase();
    const call = isNative
      ? { to: to as Address, value: amountWei, data: "0x" as Hex }
      : {
          to: tk.address as Address,
          value: 0n,
          data: encodeFunctionData({
            abi: ERC20_TRANSFER_ABI,
            functionName: "transfer",
            args: [to as Address, amountWei],
          }),
        };

    const nonce = await getNextSafeNonce(safeAddress);
    const safeTx: SafeTxData = {
      to: call.to,
      value: call.value.toString(),
      data: call.data,
      operation: 0,
      safeTxGas: "0",
      baseGas: "0",
      gasPrice: "0",
      gasToken: NATIVE_TOKEN_ADDRESS,
      refundReceiver: NATIVE_TOKEN_ADDRESS,
      nonce,
    };
    const safeTxHash = computeSafeTxHash(safeAddress, safeTx);

    // Agent's pre-signature — it screened this as APPROVE, so signing is
    // consistent with the invariant. The user's signature is still required.
    const protocolKit = await getProtocolKit(safeAddress);
    const agentSig = await protocolKit.signHash(safeTxHash);

    const owners =
      record.safe_owners?.length
        ? record.safe_owners
        : [embedded, getAgentAddress()];

    const txId = `req-tx-${randomUUID().slice(0, 8)}`;
    const tx: PendingTransaction = {
      id: txId,
      txType: "safetx",
      to,
      amount,
      token,
      tokenAddress: isNative ? NATIVE_TOKEN_ADDRESS : tk.address,
      proposedBy: embedded, // the eventual user co-signer (owner #1)
      // userSignature left undefined → marks this agent-proposed, awaiting user
      signatures: [],
      ownerAddresses: owners,
      threshold: record.safe_threshold ?? 2,
      safeAddress,
      safeTx,
      safeTxHash,
      safeNonce: nonce,
      riskScore,
      riskVerdict: "APPROVE",
      riskReasons,
      proposedAt: new Date().toISOString(),
    };
    await createTransaction(tx);

    // Mirror at 1-of-2 (agent as proposer + its signature) so it also shows in
    // app.safe.global. Best-effort — local assembly executes regardless.
    try {
      await proposeToService({
        safeAddress,
        safeTx,
        safeTxHash,
        senderAddress: getAgentAddress(),
        senderSignature: agentSig.data,
        origin: "Zhentan (agent pre-approved)",
      });
    } catch (err) {
      console.error("agentPropose: service mirror failed (continuing):", err);
    }

    return txId;
  } catch (err) {
    console.error("agentPropose failed (request stays queued):", err);
    return null;
  }
}

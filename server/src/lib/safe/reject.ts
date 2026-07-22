/**
 * On-chain rejection for the SafeTx flow.
 *
 * Safe nonces are sequential: a rejected proposal at nonce n blocks every
 * later proposal until n is consumed. This executes the pre-signed empty
 * self-call at the same nonce (the Safe UI's own "Reject transaction"
 * pattern), co-signed by the agent and relayed by the agent EOA.
 */
import { EthSafeSignature } from "@safe-global/protocol-kit";
import type { Hex } from "viem";

import type { PendingTransaction, SafeTxData } from "../../types.js";
import { computeSafeTxHash, getApiKit, getProtocolKit, proposeToService } from "./service.js";
import { readSafeNonce } from "./onchain.js";
import { assertAgentGas } from "./relayer.js";

export interface RejectionResult {
  status: "cancelled" | "skipped";
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

/**
 * Executes the pre-signed rejection tx for a rejected SafeTx proposal.
 * No-ops (status "skipped") when the nonce was already consumed on-chain —
 * e.g. the user executed something at that nonce from the Safe UI.
 */
export async function executeRejection(tx: PendingTransaction): Promise<RejectionResult> {
  if (tx.txType !== "safetx") return { status: "skipped", reason: "not a SafeTx" };
  if (tx.safeNonce === undefined || !tx.rejectionSignature) {
    return { status: "skipped", reason: "no pre-signed rejection available" };
  }

  const onChainNonce = await readSafeNonce(tx.safeAddress);
  if (onChainNonce > tx.safeNonce) {
    return { status: "skipped", reason: "nonce already consumed on-chain" };
  }

  await assertAgentGas();

  const rejectionTx = buildRejectionTxData(tx.safeAddress, tx.safeNonce);
  const rejectionHash = computeSafeTxHash(tx.safeAddress, rejectionTx);

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
    const protocolKit = await getProtocolKit(tx.safeAddress);
    const agentSig = await protocolKit.signHash(rejectionHash);
    await getApiKit().confirmTransaction(rejectionHash, agentSig.data);
  } catch (err) {
    console.error("Rejection service mirror failed (continuing on-chain):", err);
  }

  // Execute the cancel directly from the pre-signed user signature + a fresh
  // agent signature — no service dependency.
  const protocolKit = await getProtocolKit(tx.safeAddress);
  const safeTransaction = await protocolKit.createRejectionTransaction(tx.safeNonce);
  safeTransaction.addSignature(
    new EthSafeSignature(tx.proposedBy, tx.rejectionSignature as Hex)
  );
  const agentSignature = await protocolKit.signHash(rejectionHash);
  safeTransaction.addSignature(agentSignature);

  const result = await protocolKit.executeTransaction(safeTransaction);
  return { status: "cancelled", txHash: result.hash };
}

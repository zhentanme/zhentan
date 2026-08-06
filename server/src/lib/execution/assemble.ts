/**
 * Explicit execTransaction payload assembly — the "sign" and "send" halves
 * of the old fused protocolKit.executeTransaction(), separated (P4).
 *
 * Composition is deliberately identical to what the fused path fed on-chain:
 * protocol-kit's EthSafeTransaction.encodedSignatures() orders signatures
 * owner-ascending (GS026 reverts otherwise), and viem encodes the call. The
 * golden suite (golden.test.ts) byte-compares this module's output against
 * snapshots of the pre-refactor encoding — any drift fails there first.
 */
import { encodeFunctionData, type Hex } from "viem";
import { EthSafeTransaction, EthSafeSignature } from "@safe-global/protocol-kit";
import type { SafeSignature } from "@safe-global/types-kit";
import type { SafeTxData } from "../../types.js";

export const EXEC_TRANSACTION_ABI = [
  {
    type: "function",
    name: "execTransaction",
    inputs: [
      { type: "address", name: "to" },
      { type: "uint256", name: "value" },
      { type: "bytes", name: "data" },
      { type: "uint8", name: "operation" },
      { type: "uint256", name: "safeTxGas" },
      { type: "uint256", name: "baseGas" },
      { type: "uint256", name: "gasPrice" },
      { type: "address", name: "gasToken" },
      { type: "address", name: "refundReceiver" },
      { type: "bytes", name: "signatures" },
    ],
    outputs: [{ type: "bool", name: "success" }],
    stateMutability: "payable",
  },
] as const;

/**
 * Orders and concatenates signatures exactly as the Safe contract requires
 * (owner-ascending), via protocol-kit — nothing reimplemented.
 */
export function assembleSignatureBytes(
  safeTx: SafeTxData,
  signatures: SafeSignature[]
): Hex {
  const tx = new EthSafeTransaction({
    to: safeTx.to,
    value: safeTx.value,
    data: safeTx.data,
    operation: safeTx.operation,
    safeTxGas: safeTx.safeTxGas,
    baseGas: safeTx.baseGas,
    gasPrice: safeTx.gasPrice,
    gasToken: safeTx.gasToken,
    refundReceiver: safeTx.refundReceiver,
    nonce: safeTx.nonce,
  });
  for (const sig of signatures) {
    tx.addSignature(new EthSafeSignature(sig.signer, sig.data));
  }
  return tx.encodedSignatures() as Hex;
}

/** Full execTransaction calldata, ready for the sponsor wallet to send. */
export function encodeExecTransaction(
  safeTx: SafeTxData,
  signatures: SafeSignature[]
): Hex {
  return encodeFunctionData({
    abi: EXEC_TRANSACTION_ABI,
    functionName: "execTransaction",
    args: [
      safeTx.to as Hex,
      BigInt(safeTx.value),
      safeTx.data as Hex,
      safeTx.operation,
      BigInt(safeTx.safeTxGas),
      BigInt(safeTx.baseGas),
      BigInt(safeTx.gasPrice),
      safeTx.gasToken as Hex,
      safeTx.refundReceiver as Hex,
      assembleSignatureBytes(safeTx, signatures),
    ],
  });
}

/**
 * SafeTx EIP-712 hash — computed by the RUNTIME from raw fields, used in
 * two places that must agree: recorded with each screening decision (what
 * content was screened) and recomputed for each sign request (what content
 * would be signed). Their equality is the content binding behind "the
 * agent never signs what it didn't screen".
 */
import { hashTypedData, type Address, type Hex } from "viem";
import { SAFE_TX_TYPES, type SafeTxDataWire } from "zhentan-screening";

export function computeSafeTxHash(
  safeAddress: string,
  chainId: number,
  safeTx: SafeTxDataWire
): Hex {
  return hashTypedData({
    domain: { chainId, verifyingContract: safeAddress as Address },
    types: SAFE_TX_TYPES,
    primaryType: "SafeTx",
    message: {
      to: safeTx.to as Address,
      value: BigInt(safeTx.value),
      data: safeTx.data as Hex,
      operation: safeTx.operation,
      safeTxGas: BigInt(safeTx.safeTxGas),
      baseGas: BigInt(safeTx.baseGas),
      gasPrice: BigInt(safeTx.gasPrice),
      gasToken: safeTx.gasToken as Address,
      refundReceiver: safeTx.refundReceiver as Address,
      nonce: BigInt(safeTx.nonce),
    },
  });
}

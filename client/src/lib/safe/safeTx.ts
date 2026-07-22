"use client";

import {
  encodeFunctionData,
  encodePacked,
  hashTypedData,
  concatHex,
  size,
  type Address,
  type Hex,
  type LocalAccount,
} from "viem";
import { bsc } from "viem/chains";

import { MULTISEND_CALL_ONLY, MULTISEND_ABI, SAFE_TX_TYPES } from "../constants";
import type { SafeTxData } from "@/types";

export interface SafeCall {
  to: Address;
  value: bigint;
  data: Hex;
}

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000" as const;

/**
 * Builds a standard SafeTx from one or more calls.
 *
 * Single call → plain CALL (operation 0). Multiple calls → packed batch via
 * MultiSendCallOnly (operation 1, DELEGATECALL into the canonical batcher).
 * Gas fields are zero: the relayer (agent EOA) pays, standard for Safe ≥1.3.
 */
export function buildSafeTx(calls: SafeCall[], nonce: number): SafeTxData {
  if (calls.length === 0) throw new Error("buildSafeTx requires at least one call");

  let to: Address;
  let value: bigint;
  let data: Hex;
  let operation: 0 | 1;

  if (calls.length === 1) {
    ({ to, value, data } = calls[0]);
    operation = 0;
  } else {
    // MultiSend packed encoding per tx: operation(1) | to(20) | value(32) | dataLength(32) | data
    const packed = calls.map((c) =>
      encodePacked(
        ["uint8", "address", "uint256", "uint256", "bytes"],
        [0, c.to, c.value, BigInt(size(c.data)), c.data]
      )
    );
    to = MULTISEND_CALL_ONLY;
    value = 0n;
    data = encodeFunctionData({
      abi: MULTISEND_ABI,
      functionName: "multiSend",
      args: [concatHex(packed)],
    });
    operation = 1;
  }

  return {
    to,
    value: value.toString(),
    data,
    operation,
    safeTxGas: "0",
    baseGas: "0",
    gasPrice: "0",
    gasToken: ZERO_ADDRESS,
    refundReceiver: ZERO_ADDRESS,
    nonce,
  };
}

/** An empty self-call at the given nonce — Safe's canonical "reject" replacement tx. */
export function buildRejectionTx(safeAddress: Address, nonce: number): SafeTxData {
  return {
    to: safeAddress,
    value: "0",
    data: "0x",
    operation: 0,
    safeTxGas: "0",
    baseGas: "0",
    gasPrice: "0",
    gasToken: ZERO_ADDRESS,
    refundReceiver: ZERO_ADDRESS,
    nonce,
  };
}

function toTypedDataParams(safeAddress: Address, safeTx: SafeTxData) {
  return {
    domain: { chainId: bsc.id, verifyingContract: safeAddress },
    types: SAFE_TX_TYPES,
    primaryType: "SafeTx" as const,
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
  };
}

/** EIP-712 SafeTx hash — what owners sign and the Transaction Service keys on. */
export function getSafeTxHash(safeAddress: Address, safeTx: SafeTxData): Hex {
  return hashTypedData(toTypedDataParams(safeAddress, safeTx));
}

/**
 * Signs a SafeTx with the owner's wallet via eth_signTypedData_v4.
 * The signature keeps v ∈ {27, 28} — no eth_sign +4 adjustment; the
 * Transaction Service expects raw EOA typed-data signatures.
 */
export async function signSafeTx(
  owner: LocalAccount,
  safeAddress: Address,
  safeTx: SafeTxData
): Promise<Hex> {
  return owner.signTypedData(toTypedDataParams(safeAddress, safeTx));
}

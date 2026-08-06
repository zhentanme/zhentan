/**
 * Golden payload harness for the sign/send separation (B1/B2).
 *
 * The reference implementation is protocol-kit itself, offline:
 * EthSafeTransaction.encodedSignatures() is exactly what the fused
 * protocolKit.executeTransaction() path feeds into execTransaction today.
 * These tests pin that encoding — signature ordering and full calldata —
 * as committed snapshots. B1's assemble-then-send implementation must
 * reproduce every byte, and a dependency upgrade that shifts the encoding
 * fails these tests before it can ship.
 *
 * Signature bytes here are synthetic (ordering depends only on the signer
 * address); chain validity is B3's job, on real BSC dust transactions.
 */
import { describe, it, expect } from "vitest";
import { encodeFunctionData, type Hex } from "viem";
import { EthSafeTransaction, EthSafeSignature } from "@safe-global/protocol-kit";
import type { SafeTxData } from "../../types.js";

const SAFE = "0x4444444444444444444444444444444444444444";
const MULTISEND = "0x38869bf66a61cF6bDB996A6aE40D5853Fd43B526";

// Deliberately anti-sorted: OWNER_HIGH > OWNER_LOW numerically, and the
// checksummed casing exercises case-insensitive ordering.
const OWNER_HIGH = "0xAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAa";
const OWNER_LOW = "0x1111111111111111111111111111111111111111";

const SIG_HIGH = ("0x" + "aa".repeat(65)) as Hex;
const SIG_LOW = ("0x" + "11".repeat(65)) as Hex;

const BASE: Omit<SafeTxData, "to" | "value" | "data" | "operation" | "nonce"> = {
  safeTxGas: "0",
  baseGas: "0",
  gasPrice: "0",
  gasToken: "0x0000000000000000000000000000000000000000",
  refundReceiver: "0x0000000000000000000000000000000000000000",
};

/** The four SafeTx kinds the execution path must encode identically. */
const FIXTURES: Record<string, SafeTxData> = {
  transfer: {
    ...BASE,
    to: "0x55d398326f99059fF775485246999027B3197955", // BSC USDT
    value: "0",
    // transfer(address,uint256)
    data: "0xa9059cbb0000000000000000000000001111111111111111111111111111111111111111000000000000000000000000000000000000000000000000000000000000000a",
    operation: 0,
    nonce: 3,
  },
  swap_batch: {
    ...BASE,
    to: MULTISEND,
    value: "0",
    // representative multiSend(bytes) blob (approval + swap)
    data: "0x8d80ff0a00000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000052005500000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000",
    operation: 1,
    nonce: 4,
  },
  owner_management: {
    ...BASE,
    to: SAFE, // self-call
    value: "0",
    // addOwnerWithThreshold(address,uint256)
    data: "0x0d582f130000000000000000000000002222222222222222222222222222222222222222000000000000000000000000000000000000000000000000000000000000000002",
    operation: 0,
    nonce: 5,
  },
  rejection: {
    ...BASE,
    to: SAFE,
    value: "0",
    data: "0x",
    operation: 0,
    nonce: 6,
  },
};

const EXEC_TRANSACTION_ABI = [
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

/** Reference: how the fused path encodes signatures today. */
function referenceSignatureBytes(
  tx: SafeTxData,
  sigs: { signer: string; data: Hex }[]
): string {
  const safeTransaction = new EthSafeTransaction({
    to: tx.to,
    value: tx.value,
    data: tx.data,
    operation: tx.operation,
    safeTxGas: tx.safeTxGas,
    baseGas: tx.baseGas,
    gasPrice: tx.gasPrice,
    gasToken: tx.gasToken,
    refundReceiver: tx.refundReceiver,
    nonce: tx.nonce,
  });
  for (const sig of sigs) {
    safeTransaction.addSignature(new EthSafeSignature(sig.signer, sig.data));
  }
  return safeTransaction.encodedSignatures();
}

/** Reference: full execTransaction calldata as sent on-chain. */
function referenceCalldata(tx: SafeTxData, sigs: { signer: string; data: Hex }[]): Hex {
  return encodeFunctionData({
    abi: EXEC_TRANSACTION_ABI,
    functionName: "execTransaction",
    args: [
      tx.to as Hex,
      BigInt(tx.value),
      tx.data as Hex,
      tx.operation,
      BigInt(tx.safeTxGas),
      BigInt(tx.baseGas),
      BigInt(tx.gasPrice),
      tx.gasToken as Hex,
      tx.refundReceiver as Hex,
      referenceSignatureBytes(tx, sigs) as Hex,
    ],
  });
}

describe("signature assembly ordering (GS026 invariant)", () => {
  it("orders two signatures owner-ascending regardless of insertion order", () => {
    const inserted = referenceSignatureBytes(FIXTURES.transfer, [
      { signer: OWNER_HIGH, data: SIG_HIGH },
      { signer: OWNER_LOW, data: SIG_LOW },
    ]);
    // Owner-ascending: LOW's signature bytes must come first.
    expect(inserted).toBe(SIG_LOW + SIG_HIGH.slice(2));
  });

  it("produces identical bytes for both insertion orders", () => {
    const a = referenceSignatureBytes(FIXTURES.transfer, [
      { signer: OWNER_HIGH, data: SIG_HIGH },
      { signer: OWNER_LOW, data: SIG_LOW },
    ]);
    const b = referenceSignatureBytes(FIXTURES.transfer, [
      { signer: OWNER_LOW, data: SIG_LOW },
      { signer: OWNER_HIGH, data: SIG_HIGH },
    ]);
    expect(a).toBe(b);
  });

  it("sorts case-insensitively on the signer address", () => {
    const checksummed = referenceSignatureBytes(FIXTURES.transfer, [
      { signer: OWNER_HIGH, data: SIG_HIGH },
      { signer: OWNER_LOW, data: SIG_LOW },
    ]);
    const lowercased = referenceSignatureBytes(FIXTURES.transfer, [
      { signer: OWNER_HIGH.toLowerCase(), data: SIG_HIGH },
      { signer: OWNER_LOW, data: SIG_LOW },
    ]);
    expect(checksummed).toBe(lowercased);
  });

  it("passes a single signature through unchanged", () => {
    const one = referenceSignatureBytes(FIXTURES.rejection, [
      { signer: OWNER_LOW, data: SIG_LOW },
    ]);
    expect(one).toBe(SIG_LOW);
  });
});

describe("execTransaction calldata goldens (B1 must byte-match; dependency drift fails here)", () => {
  const TWO_SIGS = [
    { signer: OWNER_HIGH, data: SIG_HIGH },
    { signer: OWNER_LOW, data: SIG_LOW },
  ];

  for (const [kind, tx] of Object.entries(FIXTURES)) {
    it(`${kind} @ 2 signatures`, () => {
      expect(referenceCalldata(tx, TWO_SIGS)).toMatchSnapshot();
    });
  }

  it("rejection @ 1 signature (relay-only shape)", () => {
    expect(
      referenceCalldata(FIXTURES.rejection, [{ signer: OWNER_LOW, data: SIG_LOW }])
    ).toMatchSnapshot();
  });
});

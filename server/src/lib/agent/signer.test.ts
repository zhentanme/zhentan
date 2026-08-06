import { describe, it, expect } from "vitest";
import type { Hex } from "viem";
import { LocalSafeSigningAuthority } from "./signer.js";
import { computeSafeTxHash } from "../safe/service.js";
import type { SafeTxData } from "../../types.js";

const SAFE = "0x1111111111111111111111111111111111111111";
const SIGNER_ADDRESS = "0x2222222222222222222222222222222222222222";
const FAKE_SIG = ("0x" + "ab".repeat(65)) as Hex;

const SAFE_TX: SafeTxData = {
  to: "0x3333333333333333333333333333333333333333",
  value: "1000000",
  data: "0x",
  operation: 0,
  safeTxGas: "0",
  baseGas: "0",
  gasPrice: "0",
  gasToken: "0x0000000000000000000000000000000000000000",
  refundReceiver: "0x0000000000000000000000000000000000000000",
  nonce: 7,
};

/** The canonical rejection payload: empty self-call at the contested nonce. */
const REJECTION_TX: SafeTxData = {
  ...SAFE_TX,
  to: SAFE,
  value: "0",
  data: "0x",
};

// KeySigner is deliberately not exported — the fake relies on structural
// typing against the authority's factory parameter, which is the point:
// nothing outside signer.ts can name the raw-digest interface.
function fakeKeySigner() {
  const calls: Hex[] = [];
  const signer = {
    getAddress: () => SIGNER_ADDRESS,
    signDigest: async (hash: Hex) => {
      calls.push(hash);
      return FAKE_SIG;
    },
  };
  return { signer, calls };
}

describe("LocalSafeSigningAuthority", () => {
  it("signs when the recomputed hash matches the requested hash", async () => {
    const { signer, calls } = fakeKeySigner();
    const authority = new LocalSafeSigningAuthority(() => signer);
    const hash = computeSafeTxHash(SAFE, SAFE_TX);

    const result = await authority.sign({
      purpose: "execution",
      safeAddress: SAFE,
      safeTx: SAFE_TX,
      expectedSafeTxHash: hash,
    });

    expect(calls).toEqual([hash]);
    expect(result.signedBy).toBe(SIGNER_ADDRESS);
    expect(result.signature.signer).toBe(SIGNER_ADDRESS);
    expect(result.signature.data).toBe(FAKE_SIG);
  });

  it("accepts a hash that differs only in case", async () => {
    const { signer } = fakeKeySigner();
    const authority = new LocalSafeSigningAuthority(() => signer);
    const hash = computeSafeTxHash(SAFE, SAFE_TX);

    await expect(
      authority.sign({
        purpose: "execution",
        safeAddress: SAFE,
        safeTx: SAFE_TX,
        expectedSafeTxHash: hash.toUpperCase().replace("0X", "0x"),
      })
    ).resolves.toBeDefined();
  });

  it("refuses a mismatched hash and never touches the key", async () => {
    const { signer, calls } = fakeKeySigner();
    const authority = new LocalSafeSigningAuthority(() => signer);

    await expect(
      authority.sign({
        purpose: "execution",
        safeAddress: SAFE,
        safeTx: SAFE_TX,
        expectedSafeTxHash: "0x" + "00".repeat(32),
      })
    ).rejects.toThrow(/Signing refused/);
    expect(calls).toEqual([]);
  });

  it("refuses when a SafeTx field was tampered after hashing", async () => {
    const { signer, calls } = fakeKeySigner();
    const authority = new LocalSafeSigningAuthority(() => signer);
    const hash = computeSafeTxHash(SAFE, SAFE_TX);
    const tampered = { ...SAFE_TX, value: "999000000" };

    await expect(
      authority.sign({
        purpose: "execution",
        safeAddress: SAFE,
        safeTx: tampered,
        expectedSafeTxHash: hash,
      })
    ).rejects.toThrow(/Signing refused/);
    expect(calls).toEqual([]);
  });

  it("refuses when the nonce was tampered after hashing", async () => {
    const { signer, calls } = fakeKeySigner();
    const authority = new LocalSafeSigningAuthority(() => signer);
    const hash = computeSafeTxHash(SAFE, SAFE_TX);

    await expect(
      authority.sign({
        purpose: "execution",
        safeAddress: SAFE,
        safeTx: { ...SAFE_TX, nonce: 8 },
        expectedSafeTxHash: hash,
      })
    ).rejects.toThrow(/Signing refused/);
    expect(calls).toEqual([]);
  });

  it("signs a canonical empty self-call under the rejection purpose", async () => {
    const { signer, calls } = fakeKeySigner();
    const authority = new LocalSafeSigningAuthority(() => signer);
    const hash = computeSafeTxHash(SAFE, REJECTION_TX);

    const result = await authority.sign({
      purpose: "rejection",
      safeAddress: SAFE,
      safeTx: REJECTION_TX,
      expectedSafeTxHash: hash,
    });

    expect(calls).toEqual([hash]);
    expect(result.signature.data).toBe(FAKE_SIG);
  });

  it("refuses a value-moving transaction under the rejection purpose", async () => {
    const { signer, calls } = fakeKeySigner();
    const authority = new LocalSafeSigningAuthority(() => signer);
    // A perfectly valid transfer — but claimed to be a rejection.
    const hash = computeSafeTxHash(SAFE, SAFE_TX);

    await expect(
      authority.sign({
        purpose: "rejection",
        safeAddress: SAFE,
        safeTx: SAFE_TX,
        expectedSafeTxHash: hash,
      })
    ).rejects.toThrow(/rejection purpose requires the empty self-call/);
    expect(calls).toEqual([]);
  });

  it("refuses calldata under the rejection purpose even when self-targeted", async () => {
    const { signer, calls } = fakeKeySigner();
    const authority = new LocalSafeSigningAuthority(() => signer);
    const sneaky = { ...REJECTION_TX, data: "0xdeadbeef" };
    const hash = computeSafeTxHash(SAFE, sneaky);

    await expect(
      authority.sign({
        purpose: "rejection",
        safeAddress: SAFE,
        safeTx: sneaky,
        expectedSafeTxHash: hash,
      })
    ).rejects.toThrow(/rejection purpose requires the empty self-call/);
    expect(calls).toEqual([]);
  });
});

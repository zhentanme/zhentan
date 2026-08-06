import { describe, it, expect } from "vitest";
import type { Hex } from "viem";
import { LocalSafeSigningAuthority, type KeySigner } from "./signer.js";
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

function fakeKeySigner() {
  const calls: Hex[] = [];
  const signer: KeySigner = {
    getAddress: () => SIGNER_ADDRESS,
    signDigest: async (hash) => {
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
        safeAddress: SAFE,
        safeTx: { ...SAFE_TX, nonce: 8 },
        expectedSafeTxHash: hash,
      })
    ).rejects.toThrow(/Signing refused/);
    expect(calls).toEqual([]);
  });
});

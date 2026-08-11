/**
 * Signing-authority refusal matrix (D4). Refusals are the product: every
 * required refusal from issue #98 is pinned here. Chain reads and the
 * decision store are injected; the key is a well-known test key.
 */
import { describe, it, expect } from "vitest";
import { recoverAddress } from "viem";
import { verifySignRequest, verifyAndSign, computeSafeTxHashLocal, agentAddress } from "./signingAuthority.js";
import type { SignJobPayload } from "zhentan-screening";

// Well-known test key (hardhat account 0) — unit tests only.
process.env.AGENT_PRIVATE_KEY =
  "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

const SAFE = "0x1111111111111111111111111111111111111111";
const NOW = new Date("2026-08-11T12:00:00Z");

const safeTx = (over: Partial<SignJobPayload["safeTx"]> = {}): SignJobPayload["safeTx"] => ({
  to: "0x2222222222222222222222222222222222222222",
  value: "1000",
  data: "0x",
  operation: 0,
  safeTxGas: "0",
  baseGas: "0",
  gasPrice: "0",
  gasToken: "0x0000000000000000000000000000000000000000",
  refundReceiver: "0x0000000000000000000000000000000000000000",
  nonce: 7,
  ...over,
});

function payload(over: Partial<SignJobPayload> = {}): SignJobPayload {
  const base: SignJobPayload = {
    safeAddress: SAFE,
    chainId: 56,
    txId: "tx-1",
    txVersion: 3,
    safeTx: safeTx(),
    claimedSafeTxHash: "",
    derivationVersion: 2,
    userApproval: null,
    expiresAt: new Date(NOW.getTime() + 60_000).toISOString(),
    ...over,
  };
  base.claimedSafeTxHash = computeSafeTxHashLocal(base);
  return base;
}

const CHAIN = {
  owners: [agentAddress(), "0x3333333333333333333333333333333333333333", "0x4444444444444444444444444444444444444444"],
  threshold: 2,
  nonce: 7,
};

const APPROVE_RECORD = {
  jobId: "j1", txId: "tx-1", txVersion: 3, safeAddress: SAFE, inputHash: "h",
  decision: { riskScore: 5, verdict: "APPROVE" as const, reasons: [], triggeredRules: [] },
  evaluatedAt: "t", recordedAt: "t",
};

const deps = (over: Partial<{ chain: typeof CHAIN; record: typeof APPROVE_RECORD | null }> = {}) => ({
  readSafeState: async () => over.chain ?? CHAIN,
  findDecision: () => ("record" in over ? over.record : APPROVE_RECORD) as never,
  now: () => NOW,
});

describe("signing authority refusals (issue #98 matrix)", () => {
  it("signs a clean APPROVE execution at the exact screened version", async () => {
    const v = await verifySignRequest("execution", payload(), deps());
    expect(v).toMatchObject({ sign: true, signedBy: agentAddress() });
  });

  it("REFUSES with no local screening record — a payload claim is not evidence", async () => {
    const v = await verifySignRequest("execution", payload(), deps({ record: null }));
    expect(v).toMatchObject({ sign: false });
    expect((v as { reason: string }).reason).toContain("no local screening record");
  });

  it("REFUSES a version mismatch between the record and the request", async () => {
    const v = await verifySignRequest("execution", payload({ txVersion: 4 }), deps());
    expect((v as { reason: string }).reason).toContain("does not match request version");
  });

  it("REFUSES an expired request", async () => {
    const v = await verifySignRequest(
      "execution",
      payload({ expiresAt: new Date(NOW.getTime() - 1).toISOString() }),
      deps()
    );
    expect((v as { reason: string }).reason).toContain("expired");
  });

  it("REFUSES a claimed hash that does not match the SafeTx fields", async () => {
    const p = payload();
    p.claimedSafeTxHash = "0x" + "ab".repeat(32);
    const v = await verifySignRequest("execution", p, deps());
    expect((v as { reason: string }).reason).toContain("safeTxHash mismatch");
  });

  it("REFUSES the wrong purpose for the operation (transfer under 'rejection')", async () => {
    const v = await verifySignRequest("rejection", payload(), deps());
    expect((v as { reason: string }).reason).toContain("empty self-call");
  });

  it("REFUSES draft_finalization without user-approval evidence", async () => {
    const v = await verifySignRequest("draft_finalization", payload(), deps({ record: null }));
    expect((v as { reason: string }).reason).toContain("requires user-approval evidence");
  });

  it("signs draft_finalization with version-pinned user approval, no decision record needed", async () => {
    const v = await verifySignRequest(
      "draft_finalization",
      payload({ userApproval: { txVersion: 3, approvedAt: "t", source: "backend" } }),
      deps({ record: null })
    );
    expect(v).toMatchObject({ sign: true });
  });

  it("REFUSES a nonce that does not match chain", async () => {
    const v = await verifySignRequest("execution", payload(), deps({ chain: { ...CHAIN, nonce: 9 } }));
    expect((v as { reason: string }).reason).toContain("nonce mismatch");
  });

  it("REFUSES when the agent is not an on-chain owner", async () => {
    const v = await verifySignRequest(
      "execution",
      payload(),
      deps({ chain: { ...CHAIN, owners: ["0x5555555555555555555555555555555555555555"] } })
    );
    expect((v as { reason: string }).reason).toContain("not an owner");
  });

  it("signs a well-formed rejection (empty self-call at chain nonce) with NO decision record", async () => {
    const p = payload({
      safeTx: safeTx({ to: SAFE, value: "0", data: "0x" }),
    });
    const v = await verifySignRequest("rejection", p, deps({ record: null }));
    expect(v).toMatchObject({ sign: true });
  });
});

describe("REVIEW/BLOCK approval evidence", () => {
  const REVIEW_RECORD = {
    ...APPROVE_RECORD,
    txVersion: 3,
    decision: { riskScore: 45, verdict: "REVIEW" as const, reasons: ["r"], triggeredRules: [] },
  };

  it("REFUSES REVIEW without approval evidence", async () => {
    const v = await verifySignRequest("execution", payload({ txVersion: 4 }), deps({ record: REVIEW_RECORD }));
    expect((v as { reason: string }).reason).toContain("requires user-approval evidence");
  });

  it("signs REVIEW with evidence pinned to the request version", async () => {
    const v = await verifySignRequest(
      "execution",
      payload({ txVersion: 4, userApproval: { txVersion: 4, approvedAt: "t", source: "backend" } }),
      deps({ record: REVIEW_RECORD })
    );
    expect(v).toMatchObject({ sign: true });
  });

  it("REFUSES evidence pinned to a different version", async () => {
    const v = await verifySignRequest(
      "execution",
      payload({ txVersion: 4, userApproval: { txVersion: 3, approvedAt: "t", source: "backend" } }),
      deps({ record: REVIEW_RECORD })
    );
    expect((v as { reason: string }).reason).toContain("approval evidence pinned to version 3");
  });
});

describe("legacy blind co-sign capability", () => {
  // 2-of-2: agent + one user key → user cannot meet threshold alone.
  const LEGACY_CHAIN = { owners: [agentAddress(), "0x3333333333333333333333333333333333333333"], threshold: 2, nonce: 7 };

  it("signs for a RE-DERIVED v1 capability with no decision record", async () => {
    const v = await verifySignRequest(
      "execution",
      payload({ derivationVersion: 1 }),
      deps({ chain: LEGACY_CHAIN, record: null })
    );
    expect(v).toMatchObject({ sign: true });
  });

  it("REFUSES a forged capability: v1 claim but chain shows user keys meet the threshold", async () => {
    // Upgraded v1: two user owners + agent, threshold 2 → capability gone.
    const v = await verifySignRequest(
      "execution",
      payload({ derivationVersion: 1 }),
      deps({ chain: CHAIN, record: null })
    );
    expect((v as { reason: string }).reason).toContain("no local screening record");
  });

  it("REFUSES a v2 account regardless of owner math without a record", async () => {
    const v = await verifySignRequest(
      "execution",
      payload({ derivationVersion: 2 }),
      deps({ chain: LEGACY_CHAIN, record: null })
    );
    expect((v as { reason: string }).reason).toContain("no local screening record");
  });
});

describe("verifyAndSign", () => {
  it("produces a signature that recovers to the agent address over the recomputed hash", async () => {
    const p = payload();
    const result = await verifyAndSign("execution", p, deps());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.signedBy).toBe(agentAddress());
    const recovered = await recoverAddress({
      hash: computeSafeTxHashLocal(p),
      signature: result.signature as `0x${string}`,
    });
    expect(recovered.toLowerCase()).toBe(agentAddress());
  });

  it("never signs on refusal", async () => {
    const result = await verifyAndSign("execution", payload(), deps({ record: null }));
    expect(result.ok).toBe(false);
  });
});

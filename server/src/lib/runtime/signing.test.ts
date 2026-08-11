/**
 * Sign-job requester tests (D4): the backend must verify what comes back —
 * signedBy must be the configured agent AND the signature must recover to
 * it. A runtime substituting another key, a refusal, and a timeout all
 * surface as typed SignRequestError.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../supabase/client.js", () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn(async () => ({ data: { version: 3 }, error: null })),
    })),
  },
}));
vi.mock("./jobs.js", () => ({ enqueueJob: vi.fn(), getJob: vi.fn() }));
vi.mock("../supabase/index.js", () => ({
  getUserDetails: vi.fn(async () => ({ derivation_version: 2 })),
}));
vi.mock("../safe/relayer.js", () => ({
  getAgentAddress: vi.fn(() => "0xAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAaAa"),
}));
vi.mock("../safe/service.js", () => ({ recoverSafeTxSigner: vi.fn() }));

import { requestAgentSignature, SignRequestError } from "./signing.js";
import { enqueueJob, getJob } from "./jobs.js";
import { recoverSafeTxSigner } from "../safe/service.js";

const AGENT = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const CTX = {
  txId: "tx-1",
  safeAddress: "0x1111111111111111111111111111111111111111",
  safeTx: {
    to: "0x2", value: "0", data: "0x", operation: 0 as const, safeTxGas: "0",
    baseGas: "0", gasPrice: "0", gasToken: "0x0", refundReceiver: "0x0", nonce: 7,
  },
  safeTxHash: "0xhash",
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(enqueueJob).mockResolvedValue({ id: "job-1" } as never);
});

const jobResult = (result: unknown, status = "succeeded") =>
  vi.mocked(getJob).mockResolvedValue({ id: "job-1", status, result, last_error: null } as never);

describe("requestAgentSignature verification", () => {
  it("returns the signature when signedBy and the recovered signer both match the agent", async () => {
    jobResult({ signature: "0xsig", signedBy: AGENT });
    vi.mocked(recoverSafeTxSigner).mockResolvedValue(AGENT as never);
    const out = await requestAgentSignature("execution", CTX);
    expect(out).toEqual({ signature: "0xsig", signedBy: AGENT });
    expect(enqueueJob).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "sign", purpose: "execution", txId: "tx-1", txVersion: 3 })
    );
  });

  it("REJECTS a result whose signedBy is not the configured agent", async () => {
    jobResult({ signature: "0xsig", signedBy: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" });
    await expect(requestAgentSignature("execution", CTX)).rejects.toMatchObject({
      reason: "invalid_result",
    });
  });

  it("REJECTS a signature that recovers to a different key even with a matching signedBy claim", async () => {
    jobResult({ signature: "0xsig", signedBy: AGENT });
    vi.mocked(recoverSafeTxSigner).mockResolvedValue("0xcccccccccccccccccccccccccccccccccccccccc" as never);
    await expect(requestAgentSignature("execution", CTX)).rejects.toMatchObject({
      reason: "invalid_result",
    });
  });

  it("surfaces a runtime refusal with its named reason", async () => {
    vi.mocked(getJob).mockResolvedValue({
      id: "job-1", status: "failed", result: null,
      last_error: "no local screening record for this transaction — re-screen required",
    } as never);
    await expect(requestAgentSignature("execution", CTX)).rejects.toMatchObject({
      reason: "refused",
      message: expect.stringContaining("no local screening record"),
    });
  });

  it("a voided sign job (transaction moved on) is a refusal", async () => {
    jobResult(null, "void");
    await expect(requestAgentSignature("execution", CTX)).rejects.toMatchObject({ reason: "refused" });
  });

  it("REVIEW/BLOCK context sends version-pinned approval evidence", async () => {
    jobResult({ signature: "0xsig", signedBy: AGENT });
    vi.mocked(recoverSafeTxSigner).mockResolvedValue(AGENT as never);
    await requestAgentSignature("execution", { ...CTX, userApproved: true });
    const payload = vi.mocked(enqueueJob).mock.calls[0][0].payload as {
      userApproval: { txVersion: number } | null;
    };
    expect(payload.userApproval).toMatchObject({ txVersion: 3, source: "backend" });
  });

  it("no approval evidence rides along unless asserted", async () => {
    jobResult({ signature: "0xsig", signedBy: AGENT });
    vi.mocked(recoverSafeTxSigner).mockResolvedValue(AGENT as never);
    await requestAgentSignature("execution", CTX);
    const payload = vi.mocked(enqueueJob).mock.calls[0][0].payload as { userApproval: unknown };
    expect(payload.userApproval).toBeNull();
  });
});

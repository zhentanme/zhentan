/**
 * Decision-application tests (D3): exactly-once by transaction state, the
 * verdict branches, and the not-applicable guards. All I/O mocked — these
 * pin the CONTRACT of apply, not the integrations.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../supabase/index.js", () => ({
  getTransaction: vi.fn(),
  getTelegramChatId: vi.fn(async () => "chat-1"),
  getUserDetails: vi.fn(async () => null),
}));
vi.mock("./applyClaim.js", () => ({
  claimScreeningApplication: vi.fn(async () => true),
}));
vi.mock("../../agent/index.js", () => ({
  recordOutcome: vi.fn(async () => undefined),
  noteReviewOutcome: vi.fn(async () => undefined),
}));
vi.mock("../execution/execute.js", () => ({ runExecutionById: vi.fn() }));
vi.mock("../../notify.js", () => ({ notifyTelegram: vi.fn() }));
vi.mock("../../notifications/index.js", () => ({ notify: vi.fn(async () => undefined) }));
vi.mock("../safe/relayer.js", () => ({ getAgentAddress: vi.fn(() => "0xagent") }));

import { applyScreeningDecision } from "./apply.js";
import { getTransaction } from "../supabase/index.js";
import { claimScreeningApplication } from "./applyClaim.js";
import { runExecutionById } from "../execution/execute.js";
import { notifyTelegram } from "../../notify.js";

const TX = {
  id: "tx-1",
  to: "0x2222222222222222222222222222222222222222",
  amount: "10",
  token: "USDC",
  safeAddress: "0x1111111111111111111111111111111111111111",
  txType: "safetx" as const,
  proposedAt: "2026-08-11T10:00:00Z",
};

const APPROVE = { riskScore: 5, verdict: "APPROVE" as const, reasons: ["ok"], triggeredRules: [] };
const REVIEW = { riskScore: 45, verdict: "REVIEW" as const, reasons: ["unknown recipient"], triggeredRules: ["r1"] };

beforeEach(() => vi.clearAllMocks());

describe("applyScreeningDecision", () => {
  it("APPROVE: one consolidated write (no review flag), then auto-execute", async () => {
    vi.mocked(getTransaction).mockResolvedValueOnce(TX as never);
    vi.mocked(runExecutionById).mockResolvedValueOnce({ status: "executed", txId: "tx-1", txHash: "0xhash" } as never);
    const outcome = await applyScreeningDecision("tx-1", APPROVE, 3);
    expect(outcome).toEqual({ status: "applied_executed", txHash: "0xhash" });
    expect(claimScreeningApplication).toHaveBeenCalledTimes(1);
    expect(claimScreeningApplication).toHaveBeenCalledWith("tx-1", APPROVE, 3);
  });

  it("REVIEW: review flag rides the SAME write; no execution; TG review keyboard fires", async () => {
    vi.mocked(getTransaction).mockResolvedValueOnce(TX as never);
    const outcome = await applyScreeningDecision("tx-1", REVIEW, 3);
    expect(outcome).toEqual({ status: "applied_review" });
    expect(runExecutionById).not.toHaveBeenCalled();
    expect(claimScreeningApplication).toHaveBeenCalledWith("tx-1", REVIEW, 3);
    expect(notifyTelegram).toHaveBeenCalledOnce();
    expect(vi.mocked(notifyTelegram).mock.calls[0][0]).toContain("REVIEW NEEDED");
  });

  it("BLOCK: no execution, blocked notification path", async () => {
    vi.mocked(getTransaction).mockResolvedValueOnce(TX as never);
    const outcome = await applyScreeningDecision("tx-1", { ...REVIEW, verdict: "BLOCK" }, 3);
    expect(outcome).toEqual({ status: "applied_blocked" });
    expect(runExecutionById).not.toHaveBeenCalled();
    expect(vi.mocked(notifyTelegram).mock.calls[0][0]).toContain("BLOCKED");
  });

  it("exactly-once: a transaction that already carries a verdict is never re-applied", async () => {
    vi.mocked(getTransaction).mockResolvedValueOnce({ ...TX, riskVerdict: "APPROVE" } as never);
    const outcome = await applyScreeningDecision("tx-1", APPROVE, 3);
    expect(outcome).toEqual({ status: "already_applied" });
    expect(claimScreeningApplication).not.toHaveBeenCalled();
    expect(runExecutionById).not.toHaveBeenCalled();
  });

  it("a rejection in progress wins over a late decision", async () => {
    vi.mocked(getTransaction).mockResolvedValueOnce({ ...TX, rejectionStatus: "cancel_submitted" } as never);
    const outcome = await applyScreeningDecision("tx-1", APPROVE, 3);
    expect(outcome).toEqual({ status: "not_applicable", reason: "rejection in progress" });
    expect(claimScreeningApplication).not.toHaveBeenCalled();
  });

  it("screening-disabled transactions are never screened", async () => {
    vi.mocked(getTransaction).mockResolvedValueOnce({ ...TX, screeningDisabled: true } as never);
    const outcome = await applyScreeningDecision("tx-1", APPROVE, 3);
    expect(outcome).toEqual({ status: "not_applicable", reason: "screening disabled" });
    expect(claimScreeningApplication).not.toHaveBeenCalled();
  });

  it("execution failure degrades to applied_execute_failed with a retry notification", async () => {
    vi.mocked(getTransaction).mockResolvedValueOnce(TX as never);
    vi.mocked(runExecutionById).mockRejectedValueOnce(new Error("nonce gap"));
    const outcome = await applyScreeningDecision("tx-1", APPROVE, 3);
    expect(outcome).toEqual({ status: "applied_execute_failed" });
    expect(vi.mocked(notifyTelegram).mock.calls[0][0]).toContain("execution failed");
  });

  it("a LOST claim (transaction moved on mid-application) applies nothing", async () => {
    vi.mocked(getTransaction)
      .mockResolvedValueOnce(TX as never) // eligibility read: looks fine
      .mockResolvedValueOnce({ ...TX, rejected: true } as never); // re-read after lost claim
    vi.mocked(claimScreeningApplication).mockResolvedValueOnce(false);
    const outcome = await applyScreeningDecision("tx-1", APPROVE, 3);
    expect(outcome).toEqual({ status: "not_applicable", reason: "transaction moved on during application" });
    expect(runExecutionById).not.toHaveBeenCalled();
    expect(notifyTelegram).not.toHaveBeenCalled();
  });

  it("a lost claim against a racing APPLY reports already_applied", async () => {
    vi.mocked(getTransaction)
      .mockResolvedValueOnce(TX as never)
      .mockResolvedValueOnce({ ...TX, riskVerdict: "REVIEW" } as never);
    vi.mocked(claimScreeningApplication).mockResolvedValueOnce(false);
    const outcome = await applyScreeningDecision("tx-1", REVIEW, 3);
    expect(outcome).toEqual({ status: "already_applied" });
    expect(notifyTelegram).not.toHaveBeenCalled();
  });
});

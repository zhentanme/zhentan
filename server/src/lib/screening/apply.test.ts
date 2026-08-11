/**
 * Decision-application tests (D3): exactly-once by transaction state, the
 * verdict branches, and the not-applicable guards. All I/O mocked — these
 * pin the CONTRACT of apply, not the integrations.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../supabase/index.js", () => ({
  getTransaction: vi.fn(),
  updateTransaction: vi.fn(async () => undefined),
  getTelegramChatId: vi.fn(async () => "chat-1"),
  getUserDetails: vi.fn(async () => null),
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
import { getTransaction, updateTransaction } from "../supabase/index.js";
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
    const outcome = await applyScreeningDecision("tx-1", APPROVE);
    expect(outcome).toEqual({ status: "applied_executed", txHash: "0xhash" });
    expect(updateTransaction).toHaveBeenCalledTimes(1);
    expect(vi.mocked(updateTransaction).mock.calls[0][1]).toEqual({
      riskScore: 5,
      riskVerdict: "APPROVE",
      riskReasons: ["ok"],
    });
  });

  it("REVIEW: review flag rides the SAME write; no execution; TG review keyboard fires", async () => {
    vi.mocked(getTransaction).mockResolvedValueOnce(TX as never);
    const outcome = await applyScreeningDecision("tx-1", REVIEW);
    expect(outcome).toEqual({ status: "applied_review" });
    expect(runExecutionById).not.toHaveBeenCalled();
    expect(updateTransaction).toHaveBeenCalledTimes(1);
    const patch = vi.mocked(updateTransaction).mock.calls[0][1] as Record<string, unknown>;
    expect(patch.inReview).toBe(true);
    expect(patch.riskVerdict).toBe("REVIEW");
    expect(notifyTelegram).toHaveBeenCalledOnce();
    expect(vi.mocked(notifyTelegram).mock.calls[0][0]).toContain("REVIEW NEEDED");
  });

  it("BLOCK: no execution, blocked notification path", async () => {
    vi.mocked(getTransaction).mockResolvedValueOnce(TX as never);
    const outcome = await applyScreeningDecision("tx-1", { ...REVIEW, verdict: "BLOCK" });
    expect(outcome).toEqual({ status: "applied_blocked" });
    expect(runExecutionById).not.toHaveBeenCalled();
    expect(vi.mocked(notifyTelegram).mock.calls[0][0]).toContain("BLOCKED");
  });

  it("exactly-once: a transaction that already carries a verdict is never re-applied", async () => {
    vi.mocked(getTransaction).mockResolvedValueOnce({ ...TX, riskVerdict: "APPROVE" } as never);
    const outcome = await applyScreeningDecision("tx-1", APPROVE);
    expect(outcome).toEqual({ status: "already_applied" });
    expect(updateTransaction).not.toHaveBeenCalled();
    expect(runExecutionById).not.toHaveBeenCalled();
  });

  it("a rejection in progress wins over a late decision", async () => {
    vi.mocked(getTransaction).mockResolvedValueOnce({ ...TX, rejectionStatus: "cancel_submitted" } as never);
    const outcome = await applyScreeningDecision("tx-1", APPROVE);
    expect(outcome).toEqual({ status: "not_applicable", reason: "rejection in progress" });
    expect(updateTransaction).not.toHaveBeenCalled();
  });

  it("screening-disabled transactions are never screened", async () => {
    vi.mocked(getTransaction).mockResolvedValueOnce({ ...TX, screeningDisabled: true } as never);
    const outcome = await applyScreeningDecision("tx-1", APPROVE);
    expect(outcome).toEqual({ status: "not_applicable", reason: "screening disabled" });
    expect(updateTransaction).not.toHaveBeenCalled();
  });

  it("execution failure degrades to applied_execute_failed with a retry notification", async () => {
    vi.mocked(getTransaction).mockResolvedValueOnce(TX as never);
    vi.mocked(runExecutionById).mockRejectedValueOnce(new Error("nonce gap"));
    const outcome = await applyScreeningDecision("tx-1", APPROVE);
    expect(outcome).toEqual({ status: "applied_execute_failed" });
    expect(vi.mocked(notifyTelegram).mock.calls[0][0]).toContain("execution failed");
  });
});

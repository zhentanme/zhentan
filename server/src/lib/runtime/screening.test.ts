/**
 * Bounded-await tests (D3): the propose handler's observer must return the
 * applied outcome quickly, keep waiting for execution on APPROVE, and
 * degrade to null (→ pending/screening response) on timeout — the
 * fail-closed behavior when no runtime answers.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../supabase/index.js", () => ({ getTransaction: vi.fn() }));
vi.mock("../supabase/client.js", () => ({ supabase: {} }));
vi.mock("../../agent/index.js", () => ({ loadPolicySnapshot: vi.fn() }));

import { awaitScreeningOutcome } from "./screening.js";
import { getTransaction } from "../supabase/index.js";

const BASE = { id: "tx-1", to: "0x2", amount: "1", token: "T", safeAddress: "0x1" };

beforeEach(() => vi.clearAllMocks());

describe("awaitScreeningOutcome", () => {
  it("returns the review outcome as soon as the decision is applied", async () => {
    vi.mocked(getTransaction)
      .mockResolvedValueOnce(BASE as never) // not yet applied
      .mockResolvedValueOnce({ ...BASE, riskVerdict: "REVIEW", riskScore: 45, riskReasons: ["r"], inReview: true } as never);
    const outcome = await awaitScreeningOutcome("tx-1", 2_000);
    expect(outcome).toEqual({ kind: "review", risk: { riskScore: 45, verdict: "REVIEW", reasons: ["r"] } });
  });

  it("APPROVE: keeps waiting past the verdict until execution lands, then reports the hash", async () => {
    vi.mocked(getTransaction)
      .mockResolvedValueOnce({ ...BASE, riskVerdict: "APPROVE", riskScore: 3, riskReasons: [] } as never)
      .mockResolvedValueOnce({ ...BASE, riskVerdict: "APPROVE", riskScore: 3, riskReasons: [], executedAt: "t", txHash: "0xh" } as never);
    const outcome = await awaitScreeningOutcome("tx-1", 2_000);
    expect(outcome).toEqual({
      kind: "executed",
      risk: { riskScore: 3, verdict: "APPROVE", reasons: [] },
      txHash: "0xh",
    });
  });

  it("timeout with no decision → null (fail-closed: proposal stays pending)", async () => {
    vi.mocked(getTransaction).mockResolvedValue(BASE as never);
    const outcome = await awaitScreeningOutcome("tx-1", 400);
    expect(outcome).toBeNull();
  });

  it("timeout AFTER an APPROVE verdict but before execution → approve_pending (pre-D3 autoExecuted:false shape)", async () => {
    vi.mocked(getTransaction).mockResolvedValue({ ...BASE, riskVerdict: "APPROVE", riskScore: 3, riskReasons: [] } as never);
    const outcome = await awaitScreeningOutcome("tx-1", 400);
    expect(outcome).toEqual({
      kind: "approve_pending",
      risk: { riskScore: 3, verdict: "APPROVE", reasons: [] },
    });
  });

  it("a user rejection during screening surfaces immediately", async () => {
    vi.mocked(getTransaction).mockResolvedValueOnce({ ...BASE, rejected: true } as never);
    expect(await awaitScreeningOutcome("tx-1", 2_000)).toEqual({ kind: "rejected" });
  });
});

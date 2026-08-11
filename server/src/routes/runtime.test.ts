/**
 * Runtime API trust-boundary tests (D1 review): the fail-closed auth and
 * request validation must never silently weaken. Jobs I/O and the agent
 * domain are mocked — these tests exercise the ROUTER over real HTTP.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import express from "express";
import type { Server } from "http";
import type { AddressInfo } from "net";

vi.mock("../lib/runtime/jobs.js", () => ({
  leaseNextJob: vi.fn(),
  heartbeatJob: vi.fn(),
  submitJobResult: vi.fn(),
  getJob: vi.fn(),
  getDeadLetterJobs: vi.fn(async () => []),
}));
vi.mock("../agent/index.js", () => ({
  loadPolicySnapshot: vi.fn(async () => ({ recipients: {} })),
}));
vi.mock("../lib/screening/apply.js", () => ({
  applyScreeningDecision: vi.fn(async () => ({ status: "applied_review" })),
}));

import { createRuntimeRouter } from "./runtime.js";
import { leaseNextJob, submitJobResult, getJob } from "../lib/runtime/jobs.js";
import { applyScreeningDecision } from "../lib/screening/apply.js";

const TOKEN = "route-test-token";
let server: Server;
let baseUrl: string;

const call = (path: string, opts: { method?: string; token?: string; body?: unknown } = {}) =>
  fetch(`${baseUrl}${path}`, {
    method: opts.method ?? "POST",
    headers: {
      "content-type": "application/json",
      ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
    },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });

beforeAll(async () => {
  const app = express();
  app.use(express.json());
  app.use("/runtime", createRuntimeRouter());
  server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => server.close());

beforeEach(() => {
  process.env.RUNTIME_API_TOKEN = TOKEN;
  vi.clearAllMocks();
});

describe("fail-closed auth", () => {
  it("unset token → every endpoint answers 503, nothing is exposed", async () => {
    delete process.env.RUNTIME_API_TOKEN;
    const res = await call("/runtime/lease", { body: { agentInstanceId: "shared-agent" } });
    expect(res.status).toBe(503);
    expect(leaseNextJob).not.toHaveBeenCalled();
  });

  it("missing or wrong token → 401 before any delegation", async () => {
    for (const token of [undefined, "wrong-token"]) {
      const res = await call("/runtime/lease", { token, body: { agentInstanceId: "a" } });
      expect(res.status).toBe(401);
    }
    expect(leaseNextJob).not.toHaveBeenCalled();
  });
});

describe("lease delegation", () => {
  it("correct token → delegates and returns the leased job", async () => {
    vi.mocked(leaseNextJob).mockResolvedValueOnce({
      job: { id: "j1" } as never,
      leaseToken: "lt1",
    });
    const res = await call("/runtime/lease", {
      token: TOKEN,
      body: { agentInstanceId: "shared-agent" },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ job: { id: "j1" }, leaseToken: "lt1" });
    expect(leaseNextJob).toHaveBeenCalledWith("shared-agent", { safeAddress: undefined });
  });

  it("no work → 204", async () => {
    vi.mocked(leaseNextJob).mockResolvedValueOnce(null);
    const res = await call("/runtime/lease", { token: TOKEN, body: { agentInstanceId: "a" } });
    expect(res.status).toBe(204);
  });

  it("missing agentInstanceId → 400", async () => {
    const res = await call("/runtime/lease", { token: TOKEN, body: {} });
    expect(res.status).toBe(400);
  });
});

describe("result submission", () => {
  const VALID = {
    schemaVersion: 1,
    leaseToken: "lt1",
    agentInstanceId: "shared-agent",
    txId: "tx1",
    txVersion: 3,
    inputHash: "h",
    policyVersion: "p",
    credentialVersion: 1,
    result: { ok: true },
  };

  it("malformed input → 400, never reaches the jobs layer", async () => {
    for (const bad of [
      {},
      { ...VALID, leaseToken: "" },
      { ...VALID, txId: undefined },
      { ...VALID, schemaVersion: "not-a-number" },
      { ...VALID, credentialVersion: undefined },
    ]) {
      const res = await call("/runtime/jobs/j1/result", { token: TOKEN, body: bad });
      expect(res.status).toBe(400);
    }
    expect(submitJobResult).not.toHaveBeenCalled();
  });

  it("valid submission delegates with the URL job id and returns the outcome", async () => {
    vi.mocked(submitJobResult).mockResolvedValueOnce({ decision: "accept" });
    const res = await call("/runtime/jobs/j1/result", { token: TOKEN, body: VALID });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ decision: "accept" });
    expect(submitJobResult).toHaveBeenCalledWith(
      expect.objectContaining({ jobId: "j1", leaseToken: "lt1", txVersion: 3 }),
      expect.objectContaining({ success: true, retryable: true })
    );
  });

  it("D3: an ACCEPTED screen result triggers decision application for its transaction", async () => {
    vi.mocked(getJob).mockResolvedValueOnce({ id: "j1", kind: "screen", tx_id: "tx-9" } as never);
    vi.mocked(submitJobResult).mockResolvedValueOnce({ decision: "accept" });
    const decision = { riskScore: 5, verdict: "APPROVE", reasons: [] };
    const res = await call("/runtime/jobs/j1/result", {
      token: TOKEN,
      body: { ...VALID, result: { decision } },
    });
    expect(res.status).toBe(200);
    await new Promise((r) => setTimeout(r, 10)); // fire-and-forget settles
    expect(applyScreeningDecision).toHaveBeenCalledWith("tx-9", decision);
  });

  it("D3: a SUCCESSFUL screen result with a missing/malformed decision is rejected BEFORE acceptance", async () => {
    for (const badResult of [
      undefined,
      {},
      { decision: null },
      { decision: { verdict: "MAYBE", riskScore: 5, reasons: [] } },
      { decision: { verdict: "APPROVE", riskScore: Infinity, reasons: [] } },
      { decision: { verdict: "APPROVE", riskScore: 5, reasons: "not-an-array" } },
    ]) {
      vi.mocked(getJob).mockResolvedValueOnce({ id: "j1", kind: "screen", tx_id: "tx-9" } as never);
      const res = await call("/runtime/jobs/j1/result", {
        token: TOKEN,
        body: { ...VALID, result: badResult },
      });
      expect(res.status).toBe(400);
    }
    // The job was never settled — it stays leased and retries/dead-letters.
    expect(submitJobResult).not.toHaveBeenCalled();
  });

  it("D3: a FAILURE submission (e.g. sign refusal) needs no decision", async () => {
    vi.mocked(getJob).mockResolvedValueOnce({ id: "j1", kind: "screen", tx_id: "tx-9" } as never);
    vi.mocked(submitJobResult).mockResolvedValueOnce({ decision: "accept" });
    const res = await call("/runtime/jobs/j1/result", {
      token: TOKEN,
      body: { ...VALID, result: null, success: false, error: "evaluation crashed" },
    });
    expect(res.status).toBe(200);
  });

  it("D3: rejected/void submissions and sign jobs never trigger application", async () => {
    vi.mocked(getJob).mockResolvedValueOnce({ id: "j1", kind: "screen", tx_id: "tx-9" } as never);
    vi.mocked(submitJobResult).mockResolvedValueOnce({ decision: "void", reason: "stale_tx_version" });
    await call("/runtime/jobs/j1/result", { token: TOKEN, body: VALID });

    vi.mocked(getJob).mockResolvedValueOnce({ id: "j2", kind: "sign", tx_id: "tx-9" } as never);
    vi.mocked(submitJobResult).mockResolvedValueOnce({ decision: "accept" });
    await call("/runtime/jobs/j2/result", { token: TOKEN, body: VALID });

    await new Promise((r) => setTimeout(r, 10));
    expect(applyScreeningDecision).not.toHaveBeenCalled();
  });
});

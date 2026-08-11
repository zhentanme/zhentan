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
  getDeadLetterJobs: vi.fn(async () => []),
}));
vi.mock("../agent/index.js", () => ({
  loadPolicySnapshot: vi.fn(async () => ({ recipients: {} })),
}));

import { createRuntimeRouter } from "./runtime.js";
import { leaseNextJob, submitJobResult } from "../lib/runtime/jobs.js";

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
});

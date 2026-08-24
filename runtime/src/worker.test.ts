import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer, type Server } from "http";
import type { AddressInfo } from "net";
import { tmpdir } from "os";
import { join } from "path";
import { computeInputHash, JOB_SCHEMA_VERSION } from "zhentan-screening";
import { RuntimeApiClient } from "./apiClient.js";
import { loadConfigFromEnv, processJob } from "./worker.js";

// processJob records decisions through the store — point it at a throwaway
// file so test runs never append stub rows to the REAL data/decisions.jsonl
// (the signing authority's evidence store).
process.env.DECISION_STORE_PATH = join(tmpdir(), `zhentan-test-decisions-${process.pid}.jsonl`);

// ─────────────────────────────────────────────────────────────
// Boundary proof: the runtime imports and configures with NO database
// environment. If any module in the import graph reached for Supabase (the
// backend's client throws at load without SUPABASE_URL), these would fail.
// ─────────────────────────────────────────────────────────────
describe("no-database boot boundary", () => {
  it("worker modules import with zero database env vars set", () => {
    expect(process.env.SUPABASE_URL).toBeUndefined();
    expect(process.env.SUPABASE_SERVICE_ROLE_KEY).toBeUndefined();
    expect(typeof processJob).toBe("function");
  });

  it("config requires ONLY the Runtime API pair — nothing else", () => {
    expect(() => loadConfigFromEnv()).toThrow(/RUNTIME_API_URL/);
    process.env.RUNTIME_API_URL = "http://localhost:9";
    try {
      expect(() => loadConfigFromEnv()).toThrow(/RUNTIME_API_TOKEN/);
      process.env.RUNTIME_API_TOKEN = "t";
      const config = loadConfigFromEnv();
      expect(config.agentInstanceId).toBe("shared-agent");
    } finally {
      delete process.env.RUNTIME_API_URL;
      delete process.env.RUNTIME_API_TOKEN;
    }
  });
});

// ─────────────────────────────────────────────────────────────
// Integration: full lease→evaluate→submit cycle against a stub Runtime API.
// ─────────────────────────────────────────────────────────────
const SNAPSHOT = {
  recipients: {
    "0x2222222222222222222222222222222222222222": {
      label: "payroll", totalTxCount: 12, totalVolume: "1200", avgAmount: "100",
      minAmount: "90", maxAmount: "110", stddevAmount: "5", typicalHoursUtc: [12],
      typicalDaysOfWeek: [1], avgDaysBetweenTxs: 7, category: "payroll",
      trustLevel: "trusted", firstSeen: null, lastSeen: null, customAttributes: {},
    },
  },
  dailyStats: {}, timePatterns: {}, tokenPatterns: {}, rules: [],
  velocity: { hourly: null, daily: null, weekly: null },
  globalLimits: {
    maxSingleTx: "1000", maxHourlyVolume: "2000", maxDailyVolume: "5000",
    maxWeeklyVolume: "20000", maxDailyTxCount: 20, allowedHoursUTC: [], allowedDaysUTC: [],
    unknownRecipientAction: "review", riskThresholdApprove: 40, riskThresholdBlock: 70,
    learningEnabled: true,
  },
};

const TX = {
  id: "tx-stub-1", to: "0x2222222222222222222222222222222222222222", amount: "100",
  amountUSD: "100", token: "USDC", tokenAddress: "0x3333333333333333333333333333333333333333",
  proposedBy: "0x4", signatures: [], ownerAddresses: [], threshold: 2,
  safeAddress: "0x1111111111111111111111111111111111111111", proposedAt: "2026-08-10T12:00:00Z",
};

const PAYLOAD = { tx: TX, snapshot: SNAPSHOT, evaluatedAt: "2026-08-10T12:00:00Z" };

const JOB = {
  id: "job-stub-1", schema_version: 1, kind: "screen" as const, purpose: null,
  safe_address: TX.safeAddress, tx_id: TX.id, tx_version: 1,
  payload: PAYLOAD as unknown as Record<string, unknown>,
  input_hash: computeInputHash(PAYLOAD), credential_version: 1, attempt_count: 0,
};

let server: Server;
let baseUrl: string;
const submitted: Record<string, unknown>[] = [];
let leaseCount = 0;
// The stub's next /result response — lets each test script the backend.
let nextDecision: Record<string, unknown> = { decision: "accept" };

beforeAll(async () => {
  server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {};
      if (req.url === "/runtime/lease") {
        leaseCount++;
        if (leaseCount === 1) {
          res.writeHead(200, { "content-type": "application/json" });
          res.end(JSON.stringify({ job: JOB, leaseToken: "stub-lease" }));
        } else {
          res.writeHead(204);
          res.end();
        }
        return;
      }
      if (req.url === `/runtime/jobs/${JOB.id}/result`) {
        submitted.push(body);
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify(nextDecision));
        return;
      }
      res.writeHead(404);
      res.end();
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => server.close());

describe("full lease→evaluate→submit cycle (stub Runtime API)", () => {
  it("leases the job, evaluates with the shared core, and submits a verifiable result", async () => {
    const client = new RuntimeApiClient({ baseUrl, token: "stub" });
    const leased = await client.lease("shared-agent");
    expect(leased?.job.id).toBe(JOB.id);

    const outcome = await processJob(client, "shared-agent", leased!.job, leased!.leaseToken);
    expect(outcome).toBe("succeeded");

    expect(submitted).toHaveLength(1);
    const result = submitted[0];
    expect(result.schemaVersion).toBe(JOB_SCHEMA_VERSION);
    expect(result.leaseToken).toBe("stub-lease");
    expect(result.agentInstanceId).toBe("shared-agent");
    expect(result.txVersion).toBe(1);
    // The runtime hashed the payload it actually evaluated — matches enqueue.
    expect(result.inputHash).toBe(JOB.input_hash);
    const decision = (result.result as { decision: { verdict: string; riskScore: number } }).decision;
    // Trusted recipient, normal amount, explicit timestamp → deterministic APPROVE.
    expect(decision.verdict).toBe("APPROVE");
  });

  it("a second lease finds no work (204 path)", async () => {
    const client = new RuntimeApiClient({ baseUrl, token: "stub" });
    expect(await client.lease("shared-agent")).toBeNull();
  });

  it("a protocol REJECTION is not success — the job was not settled by us", async () => {
    const client = new RuntimeApiClient({ baseUrl, token: "stub" });
    nextDecision = { decision: "reject", reason: "lease_mismatch" };
    const outcome = await processJob(client, "shared-agent", JOB as never, "stale-lease");
    expect(outcome).toBe("rejected");
  });

  it("a VOID (transaction moved on) is tracked apart from success and failure", async () => {
    const client = new RuntimeApiClient({ baseUrl, token: "stub" });
    nextDecision = { decision: "void", reason: "stale_tx_version" };
    expect(await processJob(client, "shared-agent", JOB as never, "stub-lease")).toBe("voided");
  });

  it("an idempotent duplicate counts as completed", async () => {
    const client = new RuntimeApiClient({ baseUrl, token: "stub" });
    nextDecision = { decision: "duplicate_noop" };
    expect(await processJob(client, "shared-agent", JOB as never, "stub-lease")).toBe("succeeded");
  });
});

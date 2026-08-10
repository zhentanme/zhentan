/**
 * Runtime API (D1) — the ONLY door between the runtime worker and the
 * backend. The runtime leases work, heartbeats, submits results, and
 * fetches Safe-scoped policy context here; it never touches the database.
 * The backend alone accesses runtime_jobs and transaction state.
 *
 * Auth is a dedicated bearer token (RUNTIME_API_TOKEN), fail-closed: with
 * the env unset every endpoint answers 503, so a misconfigured deployment
 * exposes nothing. Per-agent credentials (F1) replace the shared token
 * without changing any endpoint shape.
 */
import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { timingSafeEqual } from "crypto";
import { leaseNextJob, heartbeatJob, submitJobResult, getDeadLetterJobs } from "../lib/runtime/jobs.js";
import type { JobResultSubmission } from "../lib/runtime/jobsPolicy.js";
import { loadPolicySnapshot } from "../agent/index.js";

function tokenMatches(header: string | undefined, expected: string): boolean {
  if (!header?.startsWith("Bearer ")) return false;
  const presented = Buffer.from(header.slice(7));
  const secret = Buffer.from(expected);
  return presented.length === secret.length && timingSafeEqual(presented, secret);
}

function runtimeAuth(req: Request, res: Response, next: NextFunction): void {
  const expected = process.env.RUNTIME_API_TOKEN;
  if (!expected) {
    res.status(503).json({ error: "Runtime API disabled (RUNTIME_API_TOKEN not configured)" });
    return;
  }
  if (!tokenMatches(req.headers.authorization, expected)) {
    res.status(401).json({ error: "Invalid runtime credential" });
    return;
  }
  next();
}

export function createRuntimeRouter(): IRouter {
  const router = Router();
  router.use(runtimeAuth);

  // Lease the next available job for this agent instance. 204 = no work.
  router.post("/lease", async (req, res) => {
    try {
      const agentInstanceId = String(req.body?.agentInstanceId ?? "");
      if (!agentInstanceId) {
        res.status(400).json({ error: "Missing agentInstanceId" });
        return;
      }
      const safeAddress = req.body?.safeAddress ? String(req.body.safeAddress) : undefined;
      const leased = await leaseNextJob(agentInstanceId, { safeAddress });
      if (!leased) {
        res.status(204).end();
        return;
      }
      res.json({ job: leased.job, leaseToken: leased.leaseToken });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error("Runtime lease error:", message);
      res.status(500).json({ error: message });
    }
  });

  router.post("/jobs/:id/heartbeat", async (req, res) => {
    try {
      const leaseToken = String(req.body?.leaseToken ?? "");
      if (!leaseToken) {
        res.status(400).json({ error: "Missing leaseToken" });
        return;
      }
      const alive = await heartbeatJob(req.params.id, leaseToken);
      res.json({ alive });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error("Runtime heartbeat error:", message);
      res.status(500).json({ error: message });
    }
  });

  router.post("/jobs/:id/result", async (req, res) => {
    try {
      const b = req.body ?? {};
      const submission: JobResultSubmission = {
        jobId: req.params.id,
        schemaVersion: Number(b.schemaVersion),
        leaseToken: String(b.leaseToken ?? ""),
        agentInstanceId: String(b.agentInstanceId ?? ""),
        txId: String(b.txId ?? ""),
        txVersion: Number(b.txVersion),
        inputHash: String(b.inputHash ?? ""),
        policyVersion: String(b.policyVersion ?? ""),
        credentialVersion: Number(b.credentialVersion),
        result: b.result,
      };
      const outcome = await submitJobResult(submission, {
        success: b.success !== false,
        retryable: b.retryable !== false,
        error: typeof b.error === "string" ? b.error : undefined,
      });
      res.json(outcome);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error("Runtime result error:", message);
      res.status(500).json({ error: message });
    }
  });

  // Safe-scoped policy/pattern context — assembled by the backend so the
  // runtime evaluates without any database access.
  router.get("/context/:safeAddress", async (req, res) => {
    try {
      const snapshot = await loadPolicySnapshot(req.params.safeAddress);
      res.json({ snapshot });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error("Runtime context error:", message);
      res.status(500).json({ error: message });
    }
  });

  // Dead-letter visibility (dashboard/ops).
  router.get("/jobs/dead-letter", async (req, res) => {
    try {
      const safeAddress = req.query.safeAddress ? String(req.query.safeAddress) : undefined;
      res.json({ jobs: await getDeadLetterJobs(safeAddress) });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  return router;
}

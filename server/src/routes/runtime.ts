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
import { leaseNextJob, heartbeatJob, submitJobResult, getJob, getDeadLetterJobs } from "../lib/runtime/jobs.js";
import type { JobResultSubmission } from "../lib/runtime/jobsPolicy.js";
import { loadPolicySnapshot, type RiskResult } from "../agent/index.js";
import { applyScreeningDecision } from "../lib/screening/apply.js";

/**
 * A screen result must carry a complete, well-formed decision BEFORE it can
 * be accepted — otherwise a malformed submission would settle the job as
 * terminal `succeeded` while application silently skips, leaving the
 * transaction unscreened with no retry (the runtime never resubmits a
 * terminal job).
 */
export function isValidScreenDecision(d: unknown): d is RiskResult {
  if (d === null || typeof d !== "object") return false;
  const o = d as Record<string, unknown>;
  return (
    (o.verdict === "APPROVE" || o.verdict === "REVIEW" || o.verdict === "BLOCK") &&
    typeof o.riskScore === "number" &&
    Number.isFinite(o.riskScore) &&
    o.riskScore >= 0 &&
    o.riskScore <= 100 &&
    Array.isArray(o.reasons) &&
    o.reasons.every((r) => typeof r === "string") &&
    (o.triggeredRules === undefined ||
      (Array.isArray(o.triggeredRules) && o.triggeredRules.every((r) => typeof r === "string")))
  );
}

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
      if (
        !b.leaseToken ||
        !b.txId ||
        !b.agentInstanceId ||
        !Number.isFinite(Number(b.schemaVersion)) ||
        !Number.isFinite(Number(b.txVersion)) ||
        !Number.isFinite(Number(b.credentialVersion))
      ) {
        res.status(400).json({ error: "Malformed result submission" });
        return;
      }
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
      const job = await getJob(req.params.id);
      // A SUCCESSFUL screen result without a valid decision is rejected
      // BEFORE acceptance — the job stays leased and retries/dead-letters
      // visibly instead of settling terminal with nothing to apply.
      const decisionCandidate = (b.result as { decision?: unknown } | undefined)?.decision;
      if (job?.kind === "screen" && b.success !== false && !isValidScreenDecision(decisionCandidate)) {
        res.status(400).json({ error: "Malformed screen decision in result" });
        return;
      }
      const outcome = await submitJobResult(submission, {
        success: b.success !== false,
        retryable: b.retryable !== false,
        error: typeof b.error === "string" ? b.error : undefined,
      });
      // Authoritative screening (D3): an ACCEPTED screen result becomes
      // canonical state — decision write, notifications, auto-execute.
      // Fire-and-forget: the runtime's submit must never wait on chain
      // execution; the propose handler observes the transaction row.
      // (Application is atomically claimed and idempotent by tx state; a
      // crash here is healed by the screening reconciler, which re-applies
      // succeeded screen jobs whose transaction carries no verdict.)
      if (outcome.decision === "accept" && job?.kind === "screen" && isValidScreenDecision(decisionCandidate)) {
        void applyScreeningDecision(job.tx_id, decisionCandidate).catch((err) =>
          console.error(`Screening apply failed for ${job.tx_id}:`, err)
        );
      }
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

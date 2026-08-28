import { Router, Request, Response, type IRouter } from "express";
import type { RequestStatus, RequestType, QueuedRequest, PendingTransaction } from "../types.js";
import { getRequests, getRequest, createRequest, updateRequest, updateTransaction, getTransaction } from "../lib/supabase/index.js";
import { requireCallerSafe, sameAddress } from "../lib/authz.js";
import { evaluateRequest, loadPolicySnapshot } from "../agent/index.js";
import { agentProposeFromRequest } from "../lib/safe/agentPropose.js";
import { getKind, VALID_KINDS, type KindDefinition } from "../lib/safe/kinds.js";
import { randomUUID } from "crypto";

const VALID_STATUSES: RequestStatus[] = [
  "queued",
  "approved",
  "executed",
  "rejected",
];

const VALID_TYPES: RequestType[] = ["invoice", "transfer"];

/**
 * Kind resolution + field validation shared by POST / and POST /quote.
 * Writes the HTTP error response itself and returns null when invalid.
 */
function parseKindRequest(
  req: Request,
  res: Response
): { def: KindDefinition<unknown>; params: unknown; safeAddress: string } | null {
  const body = req.body ?? {};

  const def = getKind(body.kind);
  if (!def) {
    res.status(400).json({ error: `Invalid kind: ${body.kind}. Valid: ${VALID_KINDS.join(", ")}` });
    return null;
  }

  // `kind` is settlement, `type` is presentation: an invoice is always a
  // transfer with billing metadata — there is no such thing as paying an
  // invoice with a swap.
  if (!def.allowsInvoiceMeta) {
    const hasInvoiceMeta = Boolean(
      req.body.type === "invoice" ||
        body.invoiceNumber ||
        body.billedFrom ||
        body.billedTo ||
        (body.services && body.services.length) ||
        body.dueDate
    );
    if (hasInvoiceMeta) {
      res.status(400).json({
        error: `${def.kind[0].toUpperCase()}${def.kind.slice(1)} requests cannot carry invoice fields — invoices settle as transfers`,
      });
      return null;
    }
  }

  const parsed = def.parse(body);
  if (!parsed.ok) {
    res.status(400).json({ error: parsed.error });
    return null;
  }

  // The request is scoped to the caller's own Safe — resolved in auth(),
  // never from the body, so an agent call can't queue into another user's
  // dashboard.
  const safeAddress = req.callerSafe;
  if (!safeAddress) {
    res.status(403).json({
      error: "Could not resolve request owner. Provide a valid callerId (telegram:<id>) for a registered user.",
    });
    return null;
  }

  return { def, params: parsed.params, safeAddress };
}

/**
 * Requests — incoming payment asks routed through the agent: parsed invoices
 * or general transfer instructions. Mounted at /requests, with /invoices kept
 * as a legacy alias for the deployed agent skill.
 */
export function createRequestsRouter(): IRouter {
  const router = Router();

  // POST /requests — queue a new request
  router.post("/", async (req: Request, res: Response) => {
    try {
      const body = req.body ?? {};
      const { type, description, invoiceNumber, issueDate, dueDate, billedFrom, billedTo, services, riskScore, riskNotes, sourceChannel } = body;

      if (type !== undefined && !VALID_TYPES.includes(type)) {
        res.status(400).json({ error: `Invalid type: ${type}. Valid: ${VALID_TYPES.join(", ")}` });
        return;
      }

      const kindReq = parseKindRequest(req, res);
      if (!kindReq) return;
      const { def, params, safeAddress } = kindReq;
      const view = def.scoringView(params);

      // Explicit type wins; otherwise infer: invoice-ish fields → invoice, else transfer.
      const hasInvoiceFields = Boolean(invoiceNumber || billedFrom || billedTo || (services && services.length) || dueDate);
      const requestType: RequestType = type ?? (hasInvoiceFields ? "invoice" : "transfer");

      // Risk: the server engine ALWAYS scores the behavioral factors it owns
      // (recipient history, amounts, velocity, time) — the same deterministic
      // rules that score live transactions. The agent's score is advisory
      // context the engine can't see (invoice anomalies, social-engineering
      // smell): it can only RAISE the engine's score, never lower or replace
      // it. An LLM hand-applying the rules table drifts (e.g. scoring a
      // well-known recipient as unknown) — the engine must win on its turf.
      const agentScore: number | undefined =
        riskScore != null && Number.isFinite(Number(riskScore))
          ? Math.max(0, Math.min(100, Math.round(Number(riskScore))))
          : undefined;

      let finalRiskScore: number | undefined = agentScore;
      let finalRiskNotes: string | undefined = riskNotes ?? undefined;
      let finalRiskVerdict: QueuedRequest["riskVerdict"];
      let finalRiskReasons: string[] | undefined;

      try {
        const patterns = await loadPolicySnapshot(safeAddress);
        const synthTx = view as unknown as PendingTransaction;
        const engine = evaluateRequest(synthTx, patterns, def.syntheticDecoded(params));
        finalRiskScore = Math.max(engine.riskScore, agentScore ?? 0);
        // Structured verdict/reasons (#142) — same shape transactions carry,
        // so request surfaces render the same screening panel. The verdict is
        // recomputed from the FINAL score (an agent raise can move the band);
        // when the agent raised, its note joins the signal list.
        const agentRaised = agentScore != null && agentScore > engine.riskScore;
        const { riskThresholdApprove, riskThresholdBlock } = patterns.globalLimits;
        // Mirror the engine's boundary semantics exactly (risk.ts): a score
        // AT the block threshold is BLOCK, not REVIEW.
        finalRiskVerdict =
          finalRiskScore < riskThresholdApprove
            ? "APPROVE"
            : finalRiskScore < riskThresholdBlock
              ? "REVIEW"
              : "BLOCK";
        finalRiskReasons =
          agentRaised && riskNotes ? [...engine.reasons, `Agent: ${riskNotes}`] : engine.reasons;
        const engineNotes = `${engine.verdict}: ${engine.reasons.join("; ")}`;
        finalRiskNotes =
          agentRaised && riskNotes
            ? `${engineNotes} | Agent: ${riskNotes}`
            : engineNotes;
      } catch (err) {
        // Engine unavailable — the agent's score (if any) stands alone.
        console.error(
          "Request risk scoring failed:",
          err instanceof Error ? err.message : err
        );
      }

      // Draft path: the agent builds the SafeTx as a DRAFT row (no nonce, no
      // signatures — see agentPropose.ts) the user completes with one
      // signature. The kind's draftBand picks the gate: "approve" kinds get a
      // draft only when the score clears the user's APPROVE threshold
      // (riskier ones fall back to the client's own propose flow, which
      // re-screens); "block" kinds draft below the BLOCK threshold (no client
      // fallback builder exists, and the user still explicitly signs).
      // Best-effort: if the draft can't be built, the request queues normally.
      let draftTxId: string | undefined;
      try {
        const patterns = await loadPolicySnapshot(safeAddress);
        const { riskThresholdApprove, riskThresholdBlock } = patterns.globalLimits;
        const score = finalRiskScore ?? 100;
        const shouldDraft =
          score < (def.draftBand === "block" ? riskThresholdBlock : riskThresholdApprove);
        if (shouldDraft) {
          draftTxId =
            (await agentProposeFromRequest({
              kind: def.kind,
              safeAddress,
              params,
              riskScore: finalRiskScore ?? 0,
              riskVerdict:
                score < riskThresholdApprove ? "APPROVE" : "REVIEW",
              riskReasons: finalRiskNotes ? [finalRiskNotes] : [],
            })) ?? undefined;
        }
      } catch (err) {
        console.error("Request draft build failed (queuing normally):", err);
      }

      // Display fields: the draft knows the real target (e.g. a swap's
      // router + pair label); a draft-less request falls back to the kind's
      // own display.
      const draftTx = draftTxId ? await getTransaction(draftTxId).catch(() => null) : null;
      const fallback = def.displayFallback(params);
      const displayTo = draftTx?.to ?? fallback.to;
      const displayToken = draftTx?.token ?? fallback.token;

      const request: QueuedRequest = {
        id: `req-${randomUUID().slice(0, 8)}`,
        type: requestType,
        kind: def.kind,
        safeAddress,
        to: displayTo,
        amount: view.amount,
        token: displayToken,
        ...def.requestFields(params),
        description: description ?? undefined,
        invoiceNumber: invoiceNumber ?? undefined,
        issueDate: issueDate ?? undefined,
        dueDate: dueDate ?? undefined,
        billedFrom: billedFrom ?? undefined,
        billedTo: billedTo ?? undefined,
        services: services ?? [],
        riskScore: finalRiskScore,
        riskNotes: finalRiskNotes,
        riskVerdict: finalRiskVerdict,
        riskReasons: finalRiskReasons,
        sourceChannel: sourceChannel ?? "unknown",
        queuedAt: new Date().toISOString(),
        // A draft tx id on a still-queued request signals the client to show
        // "Zhentan prepared this — sign to execute" instead of "approve to pay".
        status: "queued",
        txId: draftTxId,
      };

      console.log(`Queueing request ${request.id} for Safe ${safeAddress}:`, {
        type: request.type,
        kind: request.kind,
        to: request.to,
        amount: request.amount,
        token: request.token,
        riskScore: request.riskScore,
        riskNotes: request.riskNotes,
        draftTxId: request.txId,
      });
      await createRequest(request);
      res.status(201).json({ status: "queued", id: request.id, type: request.type, kind: request.kind, to: request.to, amount: request.amount, token: request.token, ...(draftTxId && { txId: draftTxId, presigned: true }) });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  // POST /requests/quote — READ-ONLY preview of a request's outcome (#142).
  // Same body as POST / (settlement fields only); runs the kind's quote()
  // (balance/token resolution, live route pricing) plus the same request
  // risk engine, so the agent can tell the user what would happen — and
  // whether it would auto-approve — BEFORE queueing. Never writes anything.
  router.post("/quote", async (req: Request, res: Response) => {
    try {
      const kindReq = parseKindRequest(req, res);
      if (!kindReq) return;
      const { def, params, safeAddress } = kindReq;

      const quote = await def.quote(params, { safeAddress });

      // Risk preview mirrors POST /'s engine call (same synthetic inputs →
      // same score the real queue would get, engine-availability aside).
      let riskPreview: {
        score: number;
        verdict: string;
        reasons: string[];
        wouldAutoExecute: boolean;
      } | null = null;
      try {
        const patterns = await loadPolicySnapshot(safeAddress);
        const synthTx = def.scoringView(params) as unknown as PendingTransaction;
        const engine = evaluateRequest(synthTx, patterns, def.syntheticDecoded(params));
        riskPreview = {
          score: engine.riskScore,
          verdict: engine.verdict,
          reasons: engine.reasons,
          wouldAutoExecute: engine.riskScore < patterns.globalLimits.riskThresholdApprove,
        };
      } catch (err) {
        console.error("Quote risk preview failed:", err instanceof Error ? err.message : err);
      }

      res.json({ kind: def.kind, quote, riskPreview });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  router.get("/", async (req: Request, res: Response) => {
    try {
      // Scope to the caller's own Safe. Callers with no resolvable Safe (users
      // mid-onboarding) see nothing rather than everything.
      const safeAddress = req.callerSafe;
      if (!safeAddress) {
        res.json({ requests: [], invoices: [] });
        return;
      }
      const requests = await getRequests(safeAddress);
      // `invoices` kept for backward compatibility with older clients/skills.
      res.json({ requests, invoices: requests });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  router.patch("/", async (req: Request, res: Response) => {
    try {
      const body = req.body ?? {};
      const { id, status, rejectReason, txId, txHash } = body;

      if (!id || !status) {
        res.status(400).json({ error: "Missing id or status" });
        return;
      }

      if (!VALID_STATUSES.includes(status)) {
        res.status(400).json({ error: `Invalid status: ${status}` });
        return;
      }

      const callerSafe = requireCallerSafe(req, res);
      if (!callerSafe) return;

      // A request that belongs to someone else answers 404, same as one that
      // doesn't exist. The previous `req.user && …` form checked ownership only
      // when a row happened to resolve, so a caller without one skipped it.
      const existing = await getRequest(id);
      if (!existing || !sameAddress(existing.safeAddress, callerSafe)) {
        res.status(404).json({ error: `Request not found: ${id}` });
        return;
      }

      const patch: Parameters<typeof updateRequest>[1] = { status };

      if (status === "approved" && txId)   patch.txId        = txId;
      if (status === "executed")           patch.executedAt  = new Date().toISOString();
      if (status === "executed" && txHash) patch.txHash      = txHash;
      if (status === "rejected")           patch.rejectedAt  = new Date().toISOString();
      if (status === "rejected" && rejectReason) patch.rejectReason = rejectReason;

      // Auto-approve flow: rejecting a request that carries a pre-signed tx
      // cancels that tx too. It never executed on-chain (the nonce isn't
      // consumed), so a DB reject suffices — there's no user rejection signature
      // to run an on-chain cancel with.
      if (status === "rejected" && existing.txId) {
        await updateTransaction(existing.txId, {
          rejected: true,
          rejectedAt: new Date().toISOString(),
          rejectReason: rejectReason || "Request rejected",
          inReview: false,
        }).catch((err) => console.error("Failed to reject linked tx:", err));
      }

      const request = await updateRequest(id, patch);
      // `invoice` kept for backward compatibility with older clients/skills.
      res.json({ request, invoice: request });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  return router;
}

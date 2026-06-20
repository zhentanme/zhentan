import { Router, Request, Response, type IRouter } from "express";
import type { RequestStatus, RequestType, QueuedRequest, PendingTransaction } from "../types.js";
import { getRequests, getRequest, createRequest, updateRequest, getPatternsForSafe } from "../lib/supabase/index.js";
import { getSafeAddressFromCallerId } from "../lib/caller.js";
import { analyzeRisk } from "../risk.js";
import { randomUUID } from "crypto";

const VALID_STATUSES: RequestStatus[] = [
  "queued",
  "approved",
  "executed",
  "rejected",
];

const VALID_TYPES: RequestType[] = ["invoice", "transfer"];

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
      const { type, to, amount, token, description, invoiceNumber, issueDate, dueDate, billedFrom, billedTo, services, riskScore, riskNotes, sourceChannel } = body;

      if (!to || !amount || !token) {
        res.status(400).json({ error: "Missing required fields: to, amount, token" });
        return;
      }

      if (type !== undefined && !VALID_TYPES.includes(type)) {
        res.status(400).json({ error: `Invalid type: ${type}. Valid: ${VALID_TYPES.join(", ")}` });
        return;
      }

      // Resolve the owner Safe so the request is scoped to one user.
      // Client calls carry req.user (Privy token); agent calls carry a
      // "telegram:<id>" callerId we resolve to the user's Safe. Fall back to
      // body.callerId so the agent path also works when auth is skipped in dev.
      const safeAddress =
        req.user?.safe_address ??
        (await getSafeAddressFromCallerId(req.callerId ?? body.callerId));

      if (!safeAddress) {
        res.status(400).json({
          error: "Could not resolve request owner. Provide a valid callerId (telegram:<id>) for a registered user.",
        });
        return;
      }

      // Explicit type wins; otherwise infer: invoice-ish fields → invoice, else transfer.
      const hasInvoiceFields = Boolean(invoiceNumber || billedFrom || billedTo || (services && services.length) || dueDate);
      const requestType: RequestType = type ?? (hasInvoiceFields ? "invoice" : "transfer");

      // Risk: the agent's own assessment wins. Only when it omits a score do we
      // fall back to the same rules engine that scores live transactions, so a
      // request never ends up without a score for the dashboard.
      let finalRiskScore: number | undefined =
        riskScore != null && Number.isFinite(Number(riskScore))
          ? Math.max(0, Math.min(100, Math.round(Number(riskScore))))
          : undefined;
      let finalRiskNotes: string | undefined = riskNotes ?? undefined;

      if (finalRiskScore == null) {
        try {
          const patterns = await getPatternsForSafe(safeAddress);
          const synthTx = {
            to,
            amount: String(amount),
            token,
          } as unknown as PendingTransaction;
          const risk = analyzeRisk(synthTx, patterns);
          finalRiskScore = risk.riskScore;
          if (!finalRiskNotes) {
            finalRiskNotes = `${risk.verdict}: ${risk.reasons.join("; ")}`;
          }
        } catch (err) {
          console.error(
            "Request risk scoring failed:",
            err instanceof Error ? err.message : err
          );
        }
      }

      const request: QueuedRequest = {
        id: `req-${randomUUID().slice(0, 8)}`,
        type: requestType,
        safeAddress,
        to,
        amount: String(amount),
        token,
        description: description ?? undefined,
        invoiceNumber: invoiceNumber ?? undefined,
        issueDate: issueDate ?? undefined,
        dueDate: dueDate ?? undefined,
        billedFrom: billedFrom ?? undefined,
        billedTo: billedTo ?? undefined,
        services: services ?? [],
        riskScore: finalRiskScore,
        riskNotes: finalRiskNotes,
        sourceChannel: sourceChannel ?? "unknown",
        queuedAt: new Date().toISOString(),
        status: "queued",
      };

      console.log(request)

      await createRequest(request);
      res.status(201).json({ status: "queued", id: request.id, type: request.type, to: request.to, amount: request.amount, token: request.token });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  router.get("/", async (req: Request, res: Response) => {
    try {
      // Scope to a single user's Safe. Client calls use the authenticated
      // user; agent calls may scope by a "telegram:<id>" callerId query.
      // Unauthenticated callers (or users mid-onboarding) see nothing.
      const safeAddress =
        req.user?.safe_address ?? (await getSafeAddressFromCallerId(req.callerId));
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

      const existing = await getRequest(id);
      if (!existing) {
        res.status(404).json({ error: `Request not found: ${id}` });
        return;
      }

      // Ownership: a client may only mutate requests belonging to their own Safe.
      // Agent calls (authenticated via AGENT_SECRET, no req.user) are exempt.
      if (
        req.user &&
        existing.safeAddress &&
        existing.safeAddress.toLowerCase() !== req.user.safe_address.toLowerCase()
      ) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }

      const patch: Parameters<typeof updateRequest>[1] = { status };

      if (status === "approved" && txId)   patch.txId        = txId;
      if (status === "executed")           patch.executedAt  = new Date().toISOString();
      if (status === "executed" && txHash) patch.txHash      = txHash;
      if (status === "rejected")           patch.rejectedAt  = new Date().toISOString();
      if (status === "rejected" && rejectReason) patch.rejectReason = rejectReason;

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

import { Router, Request, Response, type IRouter } from "express";
import type { RequestStatus, RequestType, RequestKind, QueuedRequest, PendingTransaction } from "../types.js";
import { getRequests, getRequest, createRequest, updateRequest, updateTransaction, getTransaction, getPatternsForSafe } from "../lib/supabase/index.js";
import { requireCallerSafe, sameAddress } from "../lib/authz.js";
import { analyzeRisk } from "../risk.js";
import { agentProposeFromRequest } from "../lib/safe/agentPropose.js";
import type { DecodedKind } from "../lib/safe/kind.js";
import { randomUUID } from "crypto";

const VALID_STATUSES: RequestStatus[] = [
  "queued",
  "approved",
  "executed",
  "rejected",
];

const VALID_TYPES: RequestType[] = ["invoice", "transfer"];
const VALID_KINDS: RequestKind[] = ["transfer", "swap"];

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
      const { type, kind, to, amount, token, fromToken, toToken, slippage, description, invoiceNumber, issueDate, dueDate, billedFrom, billedTo, services, riskScore, riskNotes, sourceChannel } = body;

      if (kind !== undefined && !VALID_KINDS.includes(kind)) {
        res.status(400).json({ error: `Invalid kind: ${kind}. Valid: ${VALID_KINDS.join(", ")}` });
        return;
      }
      const requestKind: RequestKind = kind ?? "transfer";

      if (type !== undefined && !VALID_TYPES.includes(type)) {
        res.status(400).json({ error: `Invalid type: ${type}. Valid: ${VALID_TYPES.join(", ")}` });
        return;
      }

      // `kind` is settlement, `type` is presentation: an invoice is always a
      // transfer with billing metadata — there is no such thing as paying an
      // invoice with a swap.
      if (requestKind === "swap") {
        const hasInvoiceMeta = Boolean(
          type === "invoice" || invoiceNumber || billedFrom || billedTo || (services && services.length) || dueDate
        );
        if (hasInvoiceMeta) {
          res.status(400).json({ error: "Swap requests cannot carry invoice fields — invoices settle as transfers" });
          return;
        }
        if (!fromToken || !toToken || !amount) {
          res.status(400).json({ error: "Swap requests require fromToken, toToken, amount (sell amount)" });
          return;
        }
      } else if (!to || !amount || !token) {
        res.status(400).json({ error: "Missing required fields: to, amount, token" });
        return;
      }

      // The request is scoped to the caller's own Safe — resolved in auth(),
      // never from the body, so an agent call can't queue into another user's
      // dashboard.
      const safeAddress = req.callerSafe;

      if (!safeAddress) {
        res.status(403).json({
          error: "Could not resolve request owner. Provide a valid callerId (telegram:<id>) for a registered user.",
        });
        return;
      }

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

      try {
        const patterns = await getPatternsForSafe(safeAddress);
        const synthTx = {
          to: to ?? "",
          amount: String(amount),
          token: token ?? fromToken,
        } as unknown as PendingTransaction;
        // Swap scoring matches what the swap builder produces by
        // construction: a known router (LI.FI first, PancakeSwap fallback)
        // and an exact-amount approval — so only the amount/velocity/time
        // factors contribute.
        const syntheticDecoded: DecodedKind | undefined =
          requestKind === "swap"
            ? {
                kind: "swap",
                router: "",
                routerName: "LI.FI / PancakeSwap",
                sellTokenAddress: null,
                sellAmountWei: 0n,
                approval: null,
              }
            : undefined;
        const engine = analyzeRisk(synthTx, patterns, syntheticDecoded);
        finalRiskScore = Math.max(engine.riskScore, agentScore ?? 0);
        const engineNotes = `${engine.verdict}: ${engine.reasons.join("; ")}`;
        finalRiskNotes =
          agentScore != null && agentScore > engine.riskScore && riskNotes
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
      // signature. Transfers get a draft only when the score clears the
      // user's APPROVE threshold (riskier ones fall back to the client's own
      // propose flow, which re-screens). Swaps get a draft whenever the score
      // is below the BLOCK threshold — the client has no swap builder to fall
      // back to, and the user still explicitly signs. Best-effort: if the
      // draft can't be built, the request queues normally.
      let draftTxId: string | undefined;
      try {
        const patterns = await getPatternsForSafe(safeAddress);
        const { riskThresholdApprove, riskThresholdBlock } = patterns.globalLimits;
        const score = finalRiskScore ?? 100;
        const shouldDraft =
          requestKind === "swap" ? score < riskThresholdBlock : score < riskThresholdApprove;
        if (shouldDraft) {
          draftTxId =
            (await agentProposeFromRequest({
              kind: requestKind,
              safeAddress,
              to,
              amount: String(amount),
              token,
              fromToken,
              toToken,
              sellAmount: String(amount),
              slippage: slippage != null ? Number(slippage) : undefined,
              riskScore: finalRiskScore ?? 0,
              riskVerdict:
                score < riskThresholdApprove ? "APPROVE" : "REVIEW",
              riskReasons: finalRiskNotes ? [finalRiskNotes] : [],
            })) ?? undefined;
        }
      } catch (err) {
        console.error("Request draft build failed (queuing normally):", err);
      }

      // Swap display fields: the draft knows the router + label; a draft-less
      // swap request (build failed) shows the pair label with no recipient.
      const draftTx = draftTxId ? await getTransaction(draftTxId).catch(() => null) : null;
      const displayTo = requestKind === "swap" ? draftTx?.to ?? "" : to;
      const displayToken =
        requestKind === "swap"
          ? draftTx?.token ?? `${String(fromToken).toUpperCase()} → ${String(toToken).toUpperCase()}`
          : token;

      const request: QueuedRequest = {
        id: `req-${randomUUID().slice(0, 8)}`,
        type: requestType,
        kind: requestKind,
        safeAddress,
        to: displayTo,
        amount: String(amount),
        token: displayToken,
        ...(requestKind === "swap" && {
          fromToken: String(fromToken),
          toToken: String(toToken),
          ...(slippage != null && { slippage: Number(slippage) }),
        }),
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

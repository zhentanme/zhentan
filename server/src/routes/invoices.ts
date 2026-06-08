import { Router, Request, Response, type IRouter } from "express";
import type { InvoiceStatus, QueuedInvoice } from "../types.js";
import { getInvoices, getInvoice, createInvoice, updateInvoice } from "../lib/supabase/index.js";
import { getSafeAddressFromCallerId } from "../lib/caller.js";
import { randomUUID } from "crypto";

const VALID_STATUSES: InvoiceStatus[] = [
  "queued",
  "approved",
  "executed",
  "rejected",
];

export function createInvoicesRouter(): IRouter {
  const router = Router();

  // POST /invoices — queue a new invoice
  router.post("/", async (req: Request, res: Response) => {
    try {
      const body = req.body ?? {};
      const { to, amount, token, invoiceNumber, issueDate, dueDate, billedFrom, billedTo, services, riskScore, riskNotes, sourceChannel } = body;

      if (!to || !amount || !token) {
        res.status(400).json({ error: "Missing required fields: to, amount, token" });
        return;
      }

      // Resolve the owner Safe so the invoice is scoped to one user.
      // Client calls carry req.user (Privy token); agent calls carry a
      // "telegram:<id>" callerId we resolve to the user's Safe. Fall back to
      // body.callerId so the agent path also works when auth is skipped in dev.
      const safeAddress =
        req.user?.safe_address ??
        (await getSafeAddressFromCallerId(req.callerId ?? body.callerId));

      if (!safeAddress) {
        res.status(400).json({
          error: "Could not resolve invoice owner. Provide a valid callerId (telegram:<id>) for a registered user.",
        });
        return;
      }

      const invoice: QueuedInvoice = {
        id: `inv-${randomUUID().slice(0, 8)}`,
        safeAddress,
        to,
        amount: String(amount),
        token,
        invoiceNumber: invoiceNumber ?? undefined,
        issueDate: issueDate ?? undefined,
        dueDate: dueDate ?? undefined,
        billedFrom: billedFrom ?? undefined,
        billedTo: billedTo ?? undefined,
        services: services ?? [],
        riskScore: riskScore ?? undefined,
        riskNotes: riskNotes ?? undefined,
        sourceChannel: sourceChannel ?? "unknown",
        queuedAt: new Date().toISOString(),
        status: "queued",
      };

      await createInvoice(invoice);
      res.status(201).json({ status: "queued", id: invoice.id, to: invoice.to, amount: invoice.amount, token: invoice.token });
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
        res.json({ invoices: [] });
        return;
      }
      const invoices = await getInvoices(safeAddress);
      res.json({ invoices });
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

      const existing = await getInvoice(id);
      if (!existing) {
        res.status(404).json({ error: `Invoice not found: ${id}` });
        return;
      }

      // Ownership: a client may only mutate invoices belonging to their own Safe.
      // Agent calls (authenticated via AGENT_SECRET, no req.user) are exempt.
      if (
        req.user &&
        existing.safeAddress &&
        existing.safeAddress.toLowerCase() !== req.user.safe_address.toLowerCase()
      ) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }

      const patch: Parameters<typeof updateInvoice>[1] = { status };

      if (status === "approved" && txId)   patch.txId        = txId;
      if (status === "executed")           patch.executedAt  = new Date().toISOString();
      if (status === "executed" && txHash) patch.txHash      = txHash;
      if (status === "rejected")           patch.rejectedAt  = new Date().toISOString();
      if (status === "rejected" && rejectReason) patch.rejectReason = rejectReason;

      const invoice = await updateInvoice(id, patch);
      res.json({ invoice });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  return router;
}

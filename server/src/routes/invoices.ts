import { Router, Request, Response, type IRouter } from "express";
import type { InvoiceStatus, QueuedInvoice } from "../types.js";
import { getInvoices, getInvoice, createInvoice, updateInvoice } from "../lib/supabase/index.js";
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

      const invoice: QueuedInvoice = {
        id: `inv-${randomUUID().slice(0, 8)}`,
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

  router.get("/", async (_req: Request, res: Response) => {
    try {
      const invoices = await getInvoices();
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

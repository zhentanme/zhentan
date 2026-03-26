import { Router, Request, Response, type IRouter } from "express";
import type { TransactionWithStatus } from "../types.js";
import { getTransactionStatus } from "../lib/format.js";
import {
  getTransactionsByAddress,
  getTransaction,
  updateTransaction,
} from "../lib/supabase/index.js";

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

export function createTransactionsRouter(): IRouter {
  const router = Router();

  router.get("/", async (req: Request, res: Response) => {
    try {
      const safeAddress = req.query.safeAddress as string;

      if (!safeAddress || !ADDRESS_RE.test(safeAddress)) {
        res.status(400).json({ error: "Missing or invalid safeAddress" });
        return;
      }

      const pending = await getTransactionsByAddress(safeAddress);

      const transactions: TransactionWithStatus[] = pending.map((tx) => ({
        ...tx,
        status: getTransactionStatus(tx),
      }));

      res.json({ transactions });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  // GET /transactions/:id — fetch a single transaction
  router.get("/:id", async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const tx = await getTransaction(id);
      if (!tx) {
        res.status(404).json({ error: `Transaction not found: ${id}` });
        return;
      }
      res.json({ transaction: { ...tx, status: getTransactionStatus(tx) } });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  // PATCH /transactions/:id — update inReview / rejected fields
  router.patch("/:id", async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { action, reason } = req.body ?? {};

      if (!action || !["review", "reject"].includes(action)) {
        res.status(400).json({ error: "action must be 'review' or 'reject'" });
        return;
      }

      const tx = await getTransaction(id);
      if (!tx) {
        res.status(404).json({ error: `Transaction not found: ${id}` });
        return;
      }

      if (action === "review") {
        await updateTransaction(id, {
          inReview: true,
          reviewReason: reason ?? "Flagged for manual review",
          reviewedAt: new Date().toISOString(),
        });
        res.json({ status: "marked_review", txId: id });
      } else {
        await updateTransaction(id, {
          rejected: true,
          rejectedAt: new Date().toISOString(),
          rejectReason: reason ?? "Rejected by owner",
          inReview: false,
        });
        res.json({ status: "rejected", txId: id, to: tx.to, amount: tx.amount });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  return router;
}

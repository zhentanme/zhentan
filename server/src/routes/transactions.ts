import { Router, Request, Response, type IRouter } from "express";
import type { TransactionWithStatus } from "../types.js";
import { getTransactionStatus } from "../lib/format.js";
import {
  getTransactionsByAddress,
  getTransaction,
  getLastInReviewTransaction,
  updateTransaction,
} from "../lib/supabase/index.js";
import { getSafeAddressFromCallerId } from "../lib/caller.js";
import { fetchTransfers, type ZerionHistoryItem } from "../lib/zerion.js";

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("timeout")), ms)
    ),
  ]);
}

/** Pure Zerion-only item (external on-chain tx not in our DB) */
function zerionOnlyToActivity(z: ZerionHistoryItem, safeAddress: string): TransactionWithStatus {
  return {
    id: `zerion:${z.hash}`,
    source: "zerion-only",
    operationType: z.operationType,
    direction: z.direction,
    token: z.token.symbol,
    tokenAddress: z.token.address,
    tokenIconUrl: z.token.iconUrl,
    amount: z.amount,
    valueUSD: z.valueUSD ?? undefined,
    tradeReceived: z.received
      ? { symbol: z.received.token.symbol, amount: z.received.amount, iconUrl: z.received.token.iconUrl ?? "" }
      : undefined,
    // "to" doubles as the display counterparty:
    //   receives → "from <z.from>", sends → "to <z.to>"
    to: z.direction === "receive" ? z.from : z.to,
    proposedBy: safeAddress,
    signatures: [],
    ownerAddresses: [],
    threshold: 2,
    safeAddress,
    userOp: {},
    partialSignatures: "",
    proposedAt: z.timestamp,
    executedAt: z.timestamp,
    txHash: z.hash,
    success: true,
    status: "executed",
  };
}

/**
 * Merge Zerion op data into a Zhentan record.
 * Zerion wins on all token details (symbol, address, icon, amount, USD value) when present,
 * since it reflects actual on-chain state rather than what was proposed.
 * Zhentan's `to` is preserved for sends (the intended recipient from the proposal).
 */
function mergeWithZerion(tx: TransactionWithStatus, z: ZerionHistoryItem): TransactionWithStatus {
  return {
    ...tx,
    source: "both",
    operationType: z.operationType,
    direction: z.direction,
    // Zerion token details override Zhentan's stored values when available
    token:        z.token.symbol   || tx.token,
    tokenAddress: z.token.address  || tx.tokenAddress,
    tokenIconUrl: z.token.iconUrl  ?? tx.tokenIconUrl,
    amount:       z.amount         || tx.amount,
    valueUSD:     z.valueUSD       ?? tx.valueUSD,
    tradeReceived: z.received
      ? { symbol: z.received.token.symbol, amount: z.received.amount, iconUrl: z.received.token.iconUrl ?? "" }
      : undefined,
    // For receives, Zerion knows the actual sender. For sends, keep our stored recipient.
    to: z.direction === "receive" ? z.from : tx.to,
  };
}

export function createTransactionsRouter(): IRouter {
  const router = Router();

  router.get("/", async (req: Request, res: Response) => {
    try {
      const safeAddress = req.query.safeAddress as string;

      if (!safeAddress || !ADDRESS_RE.test(safeAddress)) {
        res.status(400).json({ error: "Missing or invalid safeAddress" });
        return;
      }

      // Fetch our records and Zerion history in parallel; Zerion has a 4s timeout
      const [ourResult, zerionResult] = await Promise.allSettled([
        getTransactionsByAddress(safeAddress),
        withTimeout(fetchTransfers(safeAddress), 4000),
      ]);

      const ourTxs = ourResult.status === "fulfilled" ? ourResult.value : [];
      const zerionItems = zerionResult.status === "fulfilled" ? zerionResult.value : [];

      // Index Zerion items by hash for O(1) lookup
      const zerionByHash = new Map(zerionItems.map((z) => [z.hash.toLowerCase(), z]));

      // Process our DB records:
      // - executed with a matching Zerion record → "both" (Zhentan risk data + Zerion op details)
      // - everything else → "zhentan-only" (pending / in_review / rejected / no Zerion match)
      const ourActivity: TransactionWithStatus[] = ourTxs.map((tx) => {
        const base: TransactionWithStatus = {
          ...tx,
          source: "zhentan-only",
          status: getTransactionStatus(tx),
        };
        if (!tx.txHash) return base;
        const zerionMatch = zerionByHash.get(tx.txHash.toLowerCase());
        return zerionMatch ? mergeWithZerion(base, zerionMatch) : base;
      });

      // Zerion items that have NO matching Zhentan record → "zerion-only"
      const ourHashes = new Set(ourTxs.filter((t) => t.txHash).map((t) => t.txHash!.toLowerCase()));
      const zerionOnlyActivity: TransactionWithStatus[] = zerionItems
        .filter((z) => !ourHashes.has(z.hash.toLowerCase()))
        .map((z) => zerionOnlyToActivity(z, safeAddress));

      // Merge and sort newest-first
      const transactions = [...ourActivity, ...zerionOnlyActivity].sort(
        (a, b) => new Date(b.proposedAt).getTime() - new Date(a.proposedAt).getTime()
      );

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
  // Use id = "latest" with safeAddress in body to target the most recent in-review tx
  router.patch("/:id", async (req: Request, res: Response) => {
    try {
      const { action, reason, callerId } = req.body ?? {};

      if (!action || !["review", "reject"].includes(action)) {
        res.status(400).json({ error: "action must be 'review' or 'reject'" });
        return;
      }

      let id = req.params.id;
      if (id === "latest") {
        const safeAddress = await getSafeAddressFromCallerId(callerId);
        if (!safeAddress) {
          res.status(400).json({ error: "Could not resolve Safe from callerId" });
          return;
        }
        const latest = await getLastInReviewTransaction(safeAddress);
        if (!latest) {
          res.status(404).json({ error: "No in-review transaction found for this Safe" });
          return;
        }
        id = latest.id;
      }

      const tx = await getTransaction(id);
      if (!tx) {
        res.status(404).json({ error: `Transaction not found: ${id}` });
        return;
      }

      if (!tx.inReview) {
        res.status(409).json({ error: `Transaction ${id} is not in review state` });
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

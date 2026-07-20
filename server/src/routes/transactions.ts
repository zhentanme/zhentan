import { Router, Request, Response, type IRouter } from "express";
import type { Hex } from "viem";
import type { TransactionWithStatus } from "../types.js";
import { getTransactionStatus } from "../lib/format.js";
import { recoverSafeTxSigner } from "../lib/safe/service.js";
import { getAgentAddress } from "../lib/safe/relayer.js";
import {
  getTransactionsByAddress,
  getTransaction,
  getLastInReviewTransaction,
  updateTransaction,
  getUserDetails,
  syncLinkedRequest,
} from "../lib/supabase/index.js";
import { getSafeAddressFromCallerId } from "../lib/caller.js";
import { notify } from "../notifications/index.js";
import { fetchTransfers, type ZerionHistoryItem } from "../lib/zerion.js";
import { executeRejection } from "../lib/safe/reject.js";
import { reconcileSafeTx } from "../lib/safe/reconcile.js";

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

/** Human-amount equality with a tiny relative tolerance (trailing-zero / precision drift). */
function amountsClose(a: string | undefined, b: string | undefined): boolean {
  if (a === undefined || b === undefined) return false;
  const na = parseFloat(a);
  const nb = parseFloat(b);
  if (!Number.isFinite(na) || !Number.isFinite(nb)) return a === b;
  return Math.abs(na - nb) <= 1e-9 * Math.max(1, Math.abs(na), Math.abs(nb));
}

/**
 * Hash-independent match for the pre-reconciliation window: an on-chain send
 * Zerion already sees, whose Zhentan row hasn't been written back with its
 * txHash yet (the Safe-app override path resolves only on the ~60s safeSync
 * tick). Match an unresolved OUTGOING row to the transfer by recipient, token
 * and amount, refusing an execution that predates the proposal (small clock
 * skew allowed). Conservative on purpose — a miss just falls back to the old
 * behaviour (a transient duplicate), a false positive would wrongly merge.
 */
function attributesMatch(tx: TransactionWithStatus, z: ZerionHistoryItem): boolean {
  if (z.direction !== "send") return false;
  if (!tx.to || !z.to || tx.to.toLowerCase() !== z.to.toLowerCase()) return false;
  const txToken = (tx.tokenAddress ?? "").toLowerCase();
  const zToken = (z.token.address ?? "").toLowerCase();
  if (txToken && zToken && txToken !== zToken) return false;
  if (!amountsClose(tx.amount, z.amount)) return false;
  const zTime = new Date(z.timestamp).getTime();
  const pTime = new Date(tx.proposedAt).getTime();
  if (Number.isFinite(zTime) && Number.isFinite(pTime) && zTime < pTime - 5 * 60_000) {
    return false;
  }
  return true;
}

/** Cap on how many (newest-first) transactions any list endpoint returns. */
const MAX_TRANSACTIONS = 100;

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

      // Reconcile unresolved SafeTx rows on read — the SAME service-backed flow
      // safeSync runs on a timer, but for the rows we're about to render. A tx
      // executed with the backup key on the Safe app folds to executed here
      // (exact match by safeTxHash), collapsing to one row instead of showing
      // twice (pending + executed) until the next 60s poll. Rows we previously
      // (prematurely) marked "Superseded:" are re-verified and healed. In the
      // race window where the chain has moved but the service hasn't, the row is
      // marked `confirming` — never rejected. Best-effort and bounded: in
      // parallel, each with a timeout — the history view must never block.
      const confirmingIds = new Set<string>();
      await Promise.all(
        ourTxs
          .filter(
            (t) =>
              t.txType === "safetx" &&
              !t.txHash &&
              (!t.rejected || t.rejectReason?.startsWith("Superseded:"))
          )
          .map((t) =>
            withTimeout(reconcileSafeTx(t), 4000)
              .then((outcome) => {
                if (outcome.status === "executed") {
                  t.txHash = outcome.txHash;
                  t.success = outcome.success;
                  t.executedBy = outcome.executedBy;
                  t.executedAt = t.executedAt ?? new Date().toISOString();
                  t.inReview = false;
                  t.rejected = false; // heal a stale premature-supersede marking
                } else if (outcome.status === "superseded") {
                  t.rejected = true;
                  t.inReview = false;
                } else if (outcome.status === "confirming") {
                  // In flight — leave the row untouched, just flag the display.
                  confirmingIds.add(t.id);
                }
              })
              .catch(() => {})
          )
      );

      // Index Zerion items by hash for O(1) lookup
      const zerionByHash = new Map(zerionItems.map((z) => [z.hash.toLowerCase(), z]));

      // Process our DB records:
      // - executed with a matching Zerion record → "both" (Zhentan risk data + Zerion op details)
      // - everything else → "zhentan-only" (pending / in_review / rejected / no Zerion match)
      const ourActivity: TransactionWithStatus[] = ourTxs.map((tx) => {
        const base: TransactionWithStatus = {
          ...tx,
          source: "zhentan-only",
          // `confirming` is a transient read-time state (chain ahead of the
          // service) — it isn't derivable from stored fields, so apply it here.
          status: confirmingIds.has(tx.id) ? "confirming" : getTransactionStatus(tx),
        };
        if (!tx.txHash) return base;
        const zerionMatch = zerionByHash.get(tx.txHash.toLowerCase());
        return zerionMatch ? mergeWithZerion(base, zerionMatch) : base;
      });

      // Zerion hashes already reconciled by the primary (txHash) pass.
      const matchedHashes = new Set(
        ourTxs.filter((t) => t.txHash).map((t) => t.txHash!.toLowerCase())
      );

      // Last-resort fallback: rows the service-backed reconcile above could NOT
      // resolve (proposal never indexed — e.g. the mirror failed — or the
      // service was down) still have no txHash. Fold each into the on-chain
      // send Zerion sees, matched by attributes, so the transfer doesn't render
      // twice (pending + executed). Heuristic and self-healing: if the service
      // later indexes it, the exact reconcile/hash pass takes over.
      for (const z of zerionItems) {
        if (matchedHashes.has(z.hash.toLowerCase())) continue;
        const row = ourActivity.find(
          (t) =>
            !t.txHash &&
            (t.status === "pending" ||
              t.status === "in_review" ||
              t.status === "confirming") &&
            attributesMatch(t, z)
        );
        if (!row) continue;
        Object.assign(row, mergeWithZerion(row, z), {
          status: "executed" as const,
          executedAt: z.timestamp,
          txHash: z.hash,
          success: true,
        });
        matchedHashes.add(z.hash.toLowerCase());
      }

      // Zerion items with NO matching Zhentan record (by hash or attributes) → "zerion-only"
      const zerionOnlyActivity: TransactionWithStatus[] = zerionItems
        .filter((z) => !matchedHashes.has(z.hash.toLowerCase()))
        .map((z) => zerionOnlyToActivity(z, safeAddress));

      // Merge, sort newest-first, cap at the 100 most recent
      const transactions = [...ourActivity, ...zerionOnlyActivity]
        .sort((a, b) => new Date(b.proposedAt).getTime() - new Date(a.proposedAt).getTime())
        .slice(0, MAX_TRANSACTIONS);

      res.json({ transactions });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  // GET /transactions/db — Zhentan DB records only, no Zerion enrichment.
  // Cheap + fast: powers the co-sign rail / badges (pending review + recent
  // decisions) without paying the multi-second Zerion history merge that "/"
  // incurs. Must be registered before "/:id" so it isn't matched as an id.
  router.get("/db", async (req: Request, res: Response) => {
    try {
      const safeAddress = req.query.safeAddress as string;
      if (!safeAddress || !ADDRESS_RE.test(safeAddress)) {
        res.status(400).json({ error: "Missing or invalid safeAddress" });
        return;
      }
      const txs = await getTransactionsByAddress(safeAddress);
      const transactions: TransactionWithStatus[] = txs
        .map((tx) => ({
          ...tx,
          source: "zhentan-only" as const,
          status: getTransactionStatus(tx),
        }))
        .sort((a, b) => new Date(b.proposedAt).getTime() - new Date(a.proposedAt).getTime())
        .slice(0, MAX_TRANSACTIONS);
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

  // POST /transactions/:id/sign — the user adds their signature to an
  // agent-proposed (pre-signed, 1-of-2) tx, then the relayer executes it. This
  // is the completion half of the auto-approve flow: the agent already
  // contributed its co-signature at request time, so the user's one signature
  // reaches the threshold and the agent EOA relays execTransaction.
  router.post("/:id/sign", async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { userSignature } = req.body ?? {};
      if (!userSignature) {
        res.status(400).json({ error: "Missing userSignature" });
        return;
      }
      const tx = await getTransaction(id);
      if (!tx) {
        res.status(404).json({ error: `Transaction not found: ${id}` });
        return;
      }
      if (tx.txType !== "safetx" || !tx.safeTxHash) {
        res.status(400).json({ error: "Not a SafeTx" });
        return;
      }
      if (tx.userSignature) {
        res.status(409).json({ error: "Transaction already has a user signature" });
        return;
      }
      if (tx.executedAt || tx.rejected) {
        res.status(409).json({ error: "Transaction already resolved" });
        return;
      }
      // Ownership: client calls carry req.user; the tx must be theirs.
      if (
        req.user &&
        tx.safeAddress.toLowerCase() !== req.user.safe_address.toLowerCase()
      ) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
      // The signature must recover to the intended user owner (proposedBy) and
      // never the agent — the agent already contributed its co-signature.
      const signer = (
        await recoverSafeTxSigner(tx.safeTxHash as Hex, userSignature as Hex)
      ).toLowerCase();
      const agent = getAgentAddress().toLowerCase();
      const owners = (tx.ownerAddresses ?? []).map((o) => o.toLowerCase());
      if (signer === agent || !owners.includes(signer)) {
        res.status(400).json({ error: "Signature does not recover to a user owner" });
        return;
      }
      if (tx.proposedBy && signer !== tx.proposedBy.toLowerCase()) {
        res.status(400).json({ error: "Signature signer does not match the intended owner" });
        return;
      }

      await updateTransaction(id, { userSignature });
      // The user has signed — reflect that on a linked request immediately, so it
      // reads "approved" even if execution lags or fails (finishExecution flips
      // it to "executed" on success). No-op for non-request txs.
      syncLinkedRequest(id, { status: "approved" }).catch((err) =>
        console.error("syncLinkedRequest (approved) failed:", err)
      );

      // Execute via the relayer (agent re-signs its part + the user's sig → n/n).
      const port = Number(process.env.PORT) || 3001;
      const agentSecret = process.env.AGENT_SECRET;
      const execRes = await fetch(`http://localhost:${port}/execute`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(agentSecret && { Authorization: `Bearer ${agentSecret}` }),
        },
        body: JSON.stringify({ txId: id }),
      });
      const execResult = (await execRes.json()) as Record<string, unknown>;
      res.json({ status: "signed", txId: id, execution: execResult });
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

        // SafeTx flow: consume the nonce on-chain with the pre-signed cancel
        // tx, otherwise this rejection blocks every later proposal. Runs
        // async — the rejection itself is already recorded.
        if (tx.txType === "safetx") {
          executeRejection(tx)
            .then((r) =>
              console.log(
                `Rejection cancel for ${id}: ${r.status}${r.txHash ? ` (${r.txHash})` : ""}${r.reason ? ` — ${r.reason}` : ""}`
              )
            )
            .catch((err) => console.error(`Rejection cancel failed for ${id}:`, err));
        }

        // Email notification (TG confirmation is handled by notify-resolve editing the message)
        getUserDetails(tx.safeAddress)
          .then((user) => {
            if (!user) return;
            return notify("tx_rejected", user, {
              txId: id,
              amount: tx.amount,
              token: tx.token || "USDC",
              tokenLogoUrl: tx.tokenIconUrl ?? undefined,
              amountUsd: tx.amountUSD ? `$${tx.amountUSD}` : undefined,
              toAddress: tx.to,
              rejectReason: reason ?? "Rejected by owner",
            });
          })
          .catch((err) => console.error("tx_rejected notify failed:", err));

        res.json({ status: "rejected", txId: id, to: tx.to, amount: tx.amount });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  return router;
}

import { Router, Request, Response, type IRouter } from "express";
import { getLastInReviewTransaction } from "../lib/supabase/index.js";
import { assertOwnsTx, requireCallerSafe } from "../lib/authz.js";
import { runExecution } from "../lib/execution/execute.js";
import type { PendingTransaction } from "../types.js";

export function createExecuteRouter(): IRouter {
  const router = Router();

  router.post("/", async (req: Request, res: Response) => {
    try {
      const { txId: rawTxId } = req.body ?? {};

      // Two ways in, both anchored on the authenticated principal:
      //   - explicit txId → must belong to the caller's Safe
      //   - no txId       → the caller's own latest in-review tx
      // The body's `callerId` is not consulted here; auth() already resolved it
      // into req.callerSafe, and re-reading it would reopen the impersonation
      // path this gate exists to close.
      let tx: PendingTransaction | null;
      if (rawTxId) {
        tx = await assertOwnsTx(req, res, rawTxId);
        if (!tx) return;
      } else {
        const safeAddress = requireCallerSafe(req, res);
        if (!safeAddress) return;
        tx = await getLastInReviewTransaction(safeAddress);
        if (!tx) {
          res.status(404).json({ error: "No in-review transaction found for this Safe" });
          return;
        }
      }

      const result = await runExecution(tx);
      if (result.status === "in_progress") {
        res.status(409).json(result);
        return;
      }
      res.json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error("Execute error:", message);
      res.status(500).json({ error: message });
    }
  });

  return router;
}

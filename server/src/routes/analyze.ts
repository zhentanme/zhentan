import { Router, Request, Response, type IRouter } from "express";
import { getLastInReviewTransaction } from "../lib/supabase/index.js";
import { deepAnalyze } from "../agent/index.js";
import { assertOwnsTx, requireCallerSafe } from "../lib/authz.js";
import type { PendingTransaction } from "../types.js";

export function createAnalyzeRouter(): IRouter {
  const router = Router();

  // GET /analyze/:id — deep security analysis for a transaction
  // Use id = "latest" with ?safeAddress=0x... to analyze the most recent in-review tx
  router.get("/:id", async (req: Request, res: Response) => {
    try {
      // Deep analysis exposes the recipient profile, decoded calldata and the
      // full risk rationale, so it is gated like any other read of tx state.
      // Auth + HTTP serialization live here; the analysis itself is an
      // agent-domain operation.
      let tx: PendingTransaction | null;
      if (req.params.id === "latest") {
        const safeAddress = requireCallerSafe(req, res);
        if (!safeAddress) return;
        tx = await getLastInReviewTransaction(safeAddress);
        if (!tx) {
          res.status(404).json({ error: "No in-review transaction found for this Safe" });
          return;
        }
      } else {
        tx = await assertOwnsTx(req, res, req.params.id);
        if (!tx) return;
      }

      const result = await deepAnalyze(tx);
      res.json({ ...result, callerId: req.callerId });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  return router;
}

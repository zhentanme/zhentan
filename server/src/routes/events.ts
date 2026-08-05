import { Router, Request, Response, type IRouter } from "express";
import { getBehavioralEvents } from "../lib/supabase/index.js";
import { assertOwnsSafe } from "../lib/authz.js";

const ADDRESS_RE = /^0x[a-fA-F0-9]{40}$/;

export function createEventsRouter(): IRouter {
  const router = Router();

  // GET /events?safe=0x...&limit=50
  // Returns the behavioral event log for a Safe, newest first.
  router.get("/", async (req: Request, res: Response) => {
    try {
      const requested = req.query.safe as string | undefined;
      const limit = Math.min(Number(req.query.limit ?? 100), 500);

      if (requested && !ADDRESS_RE.test(requested)) {
        res.status(400).json({ error: "Invalid safeAddress" });
        return;
      }
      const safe = assertOwnsSafe(req, res, requested);
      if (!safe) return;

      const events = await getBehavioralEvents(safe, limit);
      res.json({ events });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      res.status(500).json({ error: message });
    }
  });

  return router;
}

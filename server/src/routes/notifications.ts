import { Router, type Request, type Response, type IRouter } from "express";
import { getUserDetails } from "../lib/supabase/index.js";
import { notify, type EventName } from "../notifications/index.js";
import { EVENTS } from "../notifications/events.js";

export function createNotificationsRouter(): IRouter {
  const router = Router();

  // GET /notifications/events — list registered events (handy for the client UI / docs)
  router.get("/events", (_req: Request, res: Response) => {
    res.json({ events: Object.keys(EVENTS) });
  });

  // POST /notifications/test
  // Body: { event: "onboarding_completed", safeAddress: "0x...", payload?: {...} }
  // Dispatches the event for the user owning the given safeAddress.
  router.post("/test", async (req: Request, res: Response) => {
    const { event, safeAddress, payload } = req.body ?? {};

    if (!event || !safeAddress) {
      res.status(400).json({ error: "Missing required fields: event, safeAddress" });
      return;
    }

    if (!(event in EVENTS)) {
      res.status(400).json({
        error: `Unknown event: ${event}`,
        knownEvents: Object.keys(EVENTS),
      });
      return;
    }

    try {
      const user = await getUserDetails(safeAddress);
      if (!user) {
        res.status(404).json({ error: "User not found" });
        return;
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await notify(event as EventName, user, (payload ?? {}) as any);

      res.json({
        ok: true,
        event,
        sentTo: {
          telegram: Boolean(user.telegram_id),
          email: Boolean(user.email),
        },
      });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  return router;
}

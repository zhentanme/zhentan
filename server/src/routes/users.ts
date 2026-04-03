import { Router, type Request, type Response, type IRouter } from "express";
import { getUserDetails, getUserByUsername, upsertUserDetails } from "../lib/supabase/index.js";

export function createUsersRouter(): IRouter {
  const router = Router();

  // GET /users/check-username?username=foo
  router.get("/check-username", async (req: Request, res: Response) => {
    const username = (req.query.username as string | undefined)?.toLowerCase().trim();
    if (!username || username.length < 3) {
      res.status(400).json({ error: "Username must be at least 3 characters" });
      return;
    }
    try {
      const existing = await getUserByUsername(username);
      res.json({ available: !existing });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // GET /users?safe=0x...
  router.get("/", async (req: Request, res: Response) => {
    const safe = req.query.safe as string | undefined;
    if (!safe) {
      res.status(400).json({ error: "Missing required query param: safe" });
      return;
    }
    try {
      const details = await getUserDetails(safe);
      res.json({ user: details });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // POST /users — upsert on login
  router.post("/", async (req: Request, res: Response) => {
    const { safeAddress, email, name, telegramId, signerAddress, username, onboardingCompleted } = req.body ?? {};
    if (!safeAddress) {
      res.status(400).json({ error: "Missing required field: safeAddress" });
      return;
    }
    try {
      await upsertUserDetails(safeAddress, {
        ...(email !== undefined && { email }),
        ...(name !== undefined && { name }),
        ...(telegramId !== undefined && { telegram_id: telegramId }),
        ...(signerAddress !== undefined && { signer_address: signerAddress }),
        ...(username !== undefined && { username: username.toLowerCase() }),
        ...(onboardingCompleted !== undefined && { onboarding_completed: onboardingCompleted }),
      });
      const details = await getUserDetails(safeAddress);
      res.json({ user: details });
    } catch (err) {
      const msg = String(err);
      if (msg.includes("unique") || msg.includes("duplicate") || msg.includes("23505")) {
        res.status(409).json({ error: "Username already taken" });
      } else {
        res.status(500).json({ error: msg });
      }
    }
  });

  return router;
}

import { Router, type Request, type Response, type IRouter } from "express";
import {
  getUserDetails,
  getUserByUsername,
  getUserBySignerAddress,
  upsertUserDetails,
} from "../lib/supabase/index.js";
import { notify } from "../notifications/index.js";

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

  // GET /users/by-signer/:address — resolve the user record (and Safe address)
  // from the embedded-wallet signer. The client asks this before deriving a
  // Safe address so legacy and returning users keep their stored address.
  router.get("/by-signer/:address", async (req: Request, res: Response) => {
    const address = req.params.address;
    if (!address || !address.startsWith("0x")) {
      res.status(400).json({ error: "Invalid signer address" });
      return;
    }
    try {
      const user = await getUserBySignerAddress(address);
      res.json({ user });
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
    const {
      safeAddress,
      email,
      name,
      telegramId,
      signerAddress,
      username,
      onboardingCompleted,
      externalWalletAddress,
      safeOwners,
      safeThreshold,
      derivationVersion,
    } = req.body ?? {};
    if (!safeAddress) {
      res.status(400).json({ error: "Missing required field: safeAddress" });
      return;
    }
    if (derivationVersion !== undefined && ![1, 2].includes(derivationVersion)) {
      res.status(400).json({ error: "derivationVersion must be 1 or 2" });
      return;
    }
    try {
      const before = await getUserDetails(safeAddress);
      await upsertUserDetails(safeAddress, {
        ...(email !== undefined && { email }),
        ...(name !== undefined && { name }),
        ...(telegramId !== undefined && { telegram_id: telegramId }),
        ...(signerAddress !== undefined && { signer_address: signerAddress }),
        ...(username !== undefined && { username: username.toLowerCase() }),
        ...(onboardingCompleted !== undefined && { onboarding_completed: onboardingCompleted }),
        ...(externalWalletAddress !== undefined && { external_wallet_address: externalWalletAddress }),
        ...(safeOwners !== undefined && { safe_owners: safeOwners }),
        ...(safeThreshold !== undefined && { safe_threshold: safeThreshold }),
        ...(derivationVersion !== undefined && { derivation_version: derivationVersion }),
      });
      const details = await getUserDetails(safeAddress);

      const onboardingJustCompleted =
        onboardingCompleted === true && before?.onboarding_completed !== true;
      if (onboardingJustCompleted && details) {
        notify("onboarding_completed", details, {
          displayName: details.name ?? details.username ?? undefined,
        }).catch((err) => console.error("onboarding notify failed:", err));
      }

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

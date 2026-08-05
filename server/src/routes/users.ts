import { Router, type Request, type Response, type IRouter } from "express";
import {
  getUserDetails,
  getUserByUsername,
  getUserBySignerAddress,
  upsertUserDetails,
  setCreationSnapshot,
} from "../lib/supabase/index.js";
import { DEFAULT_SALT_NONCE } from "../lib/safe/derive.js";
import { notify } from "../notifications/index.js";
import { assertOwnsSafe, sameAddress } from "../lib/authz.js";

/**
 * Decides whether the caller may write the `user_details` row for `safeAddress`.
 *
 * This route can't authorize against `req.user` the way the others do. `req.user`
 * is found by `signer_address`, and during onboarding that column is empty until
 * the very last step — the username and Telegram writes happen before it. Gating
 * on `req.user` would therefore reject every new user.
 *
 * So the anchor is the embedded wallet the Privy token proves, which exists from
 * the first request. A row belongs to whoever's wallet it names; a row that names
 * nobody yet is claimable by the caller creating it.
 */
async function mayWriteUser(
  req: Request,
  safeAddress: string
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const signer = req.signerAddress;

  // Agent callers authorize the ordinary way — auth() resolved their Safe.
  if (!signer) {
    return req.callerSafe && sameAddress(req.callerSafe, safeAddress)
      ? { ok: true }
      : { ok: false, reason: "caller does not own this Safe" };
  }

  const existing = await getUserDetails(safeAddress);
  if (!existing) return { ok: true }; // first write — claimed below

  if (existing.signer_address) {
    return sameAddress(existing.signer_address, signer)
      ? { ok: true }
      : { ok: false, reason: "caller does not own this Safe" };
  }

  // Mid-onboarding row: no signer yet, so fall back to the owner set the Safe
  // was derived from. Empty owners means the row is still unclaimed.
  const owners = existing.creation_owners ?? existing.safe_owners ?? [];
  if (owners.length === 0) return { ok: true };
  return owners.some((o) => sameAddress(o, signer))
    ? { ok: true }
    : { ok: false, reason: "caller is not an owner of this Safe" };
}

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
    // This runs before a Safe exists, so it can't be gated on one — but a Privy
    // caller may only look up their own wallet, otherwise it's an oracle for
    // mapping any signer address to that user's record.
    if (req.signerAddress && !sameAddress(req.signerAddress, address)) {
      res.status(403).json({ error: "Forbidden: not your signer address" });
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
    // The row carries email, telegram id and signer address — own-record only.
    const safe = assertOwnsSafe(req, res, req.query.safe as string | undefined);
    if (!safe) return;
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
      const permitted = await mayWriteUser(req, safeAddress);
      if (!permitted.ok) {
        res.status(403).json({ error: `Forbidden: ${permitted.reason}` });
        return;
      }

      // Bind the row to the wallet the token proved rather than the one the body
      // claims. Without this an attacker could point a fresh row's signer at
      // someone else, or redirect notifications by rewriting telegram_id.
      const boundSigner = req.signerAddress ?? signerAddress;

      const before = await getUserDetails(safeAddress);
      await upsertUserDetails(safeAddress, {
        ...(email !== undefined && { email }),
        ...(name !== undefined && { name }),
        ...(telegramId !== undefined && { telegram_id: telegramId }),
        ...(signerAddress !== undefined && { signer_address: boundSigner }),
        ...(username !== undefined && { username: username.toLowerCase() }),
        ...(onboardingCompleted !== undefined && { onboarding_completed: onboardingCompleted }),
        ...(externalWalletAddress !== undefined && { external_wallet_address: externalWalletAddress }),
        ...(safeOwners !== undefined && { safe_owners: safeOwners }),
        ...(safeThreshold !== undefined && { safe_threshold: safeThreshold }),
        ...(derivationVersion !== undefined && { derivation_version: derivationVersion }),
      });

      // Birth certificate: the first sync that carries the full recipe pins
      // it immutably (no-op for records that already have a snapshot).
      if (safeOwners !== undefined && safeThreshold !== undefined && derivationVersion !== undefined) {
        await setCreationSnapshot(safeAddress, {
          owners: safeOwners,
          threshold: safeThreshold,
          saltNonce: DEFAULT_SALT_NONCE,
          derivationVersion,
        }).catch((err) => console.error("setCreationSnapshot failed:", err));
      }
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

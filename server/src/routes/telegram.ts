/**
 * Telegram linking endpoints (#134) — the account side of the device-grant
 * flow. All three mutations are Privy-session actions: the completing human
 * proves control of the ACCOUNT with their app session, the code proves
 * possession of the CHAT, and the binding is their intersection. The agent's
 * shared secret can never complete or remove a binding.
 *
 *   GET  /telegram               — current link state for the caller's Safe
 *   POST /telegram/link/preview  — non-consuming code lookup: which Telegram
 *                                  would be bound, and how that relates to
 *                                  this account (link / no-op / relink)
 *   POST /telegram/link          — atomic completion; relink away from another
 *                                  account requires explicit confirmRelink
 *   POST /telegram/unlink        — atomic unlink (binding + screening
 *                                  consequence in one transaction)
 */
import { Router, type Request, type Response, type IRouter } from "express";
import { requireCallerSafe } from "../lib/authz.js";
import {
  completeLink,
  getLinkBySafe,
  previewLinkCode,
  unlinkTelegram,
} from "../lib/telegram/binding.js";
import { getUserDetails } from "../lib/supabase/index.js";
import { notify } from "../notifications/index.js";
import { retireChatNotifications } from "../notify.js";

/** Privy-proven session only — see module doc. */
function requireAppSession(req: Request, res: Response): string | null {
  if (!req.signerAddress) {
    res.status(403).json({ error: "Telegram linking requires an app session" });
    return null;
  }
  return requireCallerSafe(req, res);
}

/**
 * Post-commit consequences for an account that just LOST its Telegram channel
 * (explicit unlink, or the losing side of a relink): retire that chat's live
 * approve/reject messages and tell the account through its remaining channels.
 */
async function notifyChannelLost(
  safeAddress: string,
  chatId: string,
  reason: "unlinked" | "relinked"
): Promise<void> {
  retireChatNotifications(
    chatId,
    "🔌 Telegram was disconnected from this Zhentan account. Manage this transaction from your dashboard."
  );
  const user = await getUserDetails(safeAddress).catch(() => null);
  if (user) {
    notify("telegram_unlinked", user, { reason }).catch((err) =>
      console.error("telegram_unlinked notify failed:", err)
    );
  }
}

export function createTelegramRouter(): IRouter {
  const router = Router();

  router.get("/", async (req: Request, res: Response) => {
    const safe = requireCallerSafe(req, res);
    if (!safe) return;
    try {
      const link = await getLinkBySafe(safe);
      res.json({
        linked: Boolean(link),
        telegram: link
          ? {
              userId: link.telegram_user_id,
              username: link.telegram_username,
              name: link.telegram_name,
              linkedAt: link.linked_at,
            }
          : null,
      });
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  router.post("/link/preview", async (req: Request, res: Response) => {
    const safe = requireAppSession(req, res);
    if (!safe) return;
    const code = typeof req.body?.code === "string" ? req.body.code : "";
    if (!code) {
      res.status(400).json({ error: "Missing code" });
      return;
    }
    try {
      res.json(await previewLinkCode(code, safe));
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  router.post("/link", async (req: Request, res: Response) => {
    const safe = requireAppSession(req, res);
    if (!safe) return;
    const code = typeof req.body?.code === "string" ? req.body.code : "";
    if (!code) {
      res.status(400).json({ error: "Missing code" });
      return;
    }
    try {
      const result = await completeLink(code, safe, req.body?.confirmRelink === true);

      if (result.status === "relinked") {
        // The losing account: exactly what the consented confirmation warned about.
        notifyChannelLost(result.previous_safe_address, result.previous_chat_id, "relinked");
      }
      if (result.status === "linked" && result.replaced_chat_id) {
        // This account re-pointed itself to a new Telegram: the OLD chat's
        // live messages must stop looking actionable.
        retireChatNotifications(
          result.replaced_chat_id,
          "🔌 This Zhentan account moved to a different Telegram. Manage this transaction from your dashboard."
        );
      }
      if (result.status === "linked" || result.status === "relinked") {
        // Actionable "new Telegram linked" alert to the account's existing
        // channels — the guard against a phished completion is this alert's
        // revoke path plus the identity shown on the consent page.
        const [user, link] = await Promise.all([
          getUserDetails(safe).catch(() => null),
          getLinkBySafe(safe).catch(() => null),
        ]);
        if (user) {
          notify("telegram_linked", user, {
            username: link?.telegram_username ?? undefined,
            name: link?.telegram_name ?? undefined,
          }).catch((err) => console.error("telegram_linked notify failed:", err));
        }
      }

      res.status(result.status === "invalid_code" ? 400 : 200).json(result);
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  router.post("/unlink", async (req: Request, res: Response) => {
    const safe = requireAppSession(req, res);
    if (!safe) return;
    try {
      const result = await unlinkTelegram(safe);
      if (result.status === "unlinked") {
        await notifyChannelLost(safe, result.telegram_chat_id, "unlinked");
      }
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  return router;
}

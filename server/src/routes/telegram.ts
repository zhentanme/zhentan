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
  ensureLinkMeta,
  getLinkBySafe,
  lookupCodeByUserCode,
  previewLinkCode,
  telegramUserIdForCode,
  unlinkTelegram,
} from "../lib/telegram/binding.js";
import { checkUserCodeGuess } from "../lib/telegram/linking.js";
import { fetchTelegramPhoto } from "../lib/telegram/profile.js";
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

type Credential =
  | { kind: "code"; code: string }
  | { kind: "miss" } // well-formed request, but no live code matched
  | { kind: "handled" }; // a 4xx was already written

/**
 * Both entry paths converge here (RFC 8628): the long code from the deep
 * link, or a typed user code resolved to the SAME long code — so preview,
 * photo, and completion run one identical pipeline. Typed entry is
 * attempt-limited per authenticated account: a wrong guess matches no row,
 * so the limiter must sit on the guesser, not the code.
 */
async function resolveCredential(req: Request, res: Response, safe: string): Promise<Credential> {
  const code = typeof req.body?.code === "string" ? req.body.code : "";
  if (code) return { kind: "code", code };

  const userCode = typeof req.body?.userCode === "string" ? req.body.userCode : "";
  if (!userCode) {
    res.status(400).json({ error: "Missing code" });
    return { kind: "handled" };
  }
  const guess = checkUserCodeGuess(safe);
  if (!guess.allowed) {
    res.status(429).json({ error: "too_many_attempts", retry_after: guess.retryAfterSeconds });
    return { kind: "handled" };
  }
  const resolved = await lookupCodeByUserCode(userCode);
  return resolved ? { kind: "code", code: resolved } : { kind: "miss" };
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
      let link = await getLinkBySafe(safe);
      if (link) link = await ensureLinkMeta(link);
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

  // Profile photo of the caller's LINKED Telegram, proxied — Telegram file
  // URLs embed the bot token and can never be handed to a browser.
  router.get("/photo", async (req: Request, res: Response) => {
    const safe = requireCallerSafe(req, res);
    if (!safe) return;
    try {
      const link = await getLinkBySafe(safe);
      const photo = link ? await fetchTelegramPhoto(link.telegram_user_id) : null;
      if (!photo) {
        res.status(404).json({ error: "No photo" });
        return;
      }
      res.setHeader("Content-Type", photo.contentType);
      res.setHeader("Cache-Control", "private, max-age=3600");
      res.end(photo.bytes);
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  // Photo of the Telegram a still-valid link code would bind — shown on the
  // consent page next to the handle. POST so codes stay out of URLs.
  router.post("/link/photo", async (req: Request, res: Response) => {
    const safe = requireAppSession(req, res);
    if (!safe) return;
    try {
      const cred = await resolveCredential(req, res, safe);
      if (cred.kind === "handled") return;
      const userId = cred.kind === "code" ? await telegramUserIdForCode(cred.code) : null;
      const photo = userId ? await fetchTelegramPhoto(userId) : null;
      if (!photo) {
        res.status(404).json({ error: "No photo" });
        return;
      }
      res.setHeader("Content-Type", photo.contentType);
      res.setHeader("Cache-Control", "private, max-age=600");
      res.end(photo.bytes);
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  router.post("/link/preview", async (req: Request, res: Response) => {
    const safe = requireAppSession(req, res);
    if (!safe) return;
    try {
      const cred = await resolveCredential(req, res, safe);
      if (cred.kind === "handled") return;
      if (cred.kind === "miss") {
        res.json({ status: "invalid_code" });
        return;
      }
      res.json(await previewLinkCode(cred.code, safe));
    } catch (err) {
      res.status(500).json({ error: String(err) });
    }
  });

  router.post("/link", async (req: Request, res: Response) => {
    const safe = requireAppSession(req, res);
    if (!safe) return;
    try {
      const cred = await resolveCredential(req, res, safe);
      if (cred.kind === "handled") return;
      if (cred.kind === "miss") {
        res.status(400).json({ status: "invalid_code" });
        return;
      }
      const result = await completeLink(cred.code, safe, req.body?.confirmRelink === true);

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

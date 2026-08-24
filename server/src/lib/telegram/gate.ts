/**
 * The Telegram enrollment gate (#134) — enforced ONCE, in the auth
 * middleware, after a gateway-authenticated principal has been resolved and
 * BEFORE any route handler or account-scoped read. Unlinked callers get zero
 * account information from any tool; what they get instead is the
 * `auth_required` envelope with a verification link.
 *
 * Invalid identity stays distinct from unlinked identity: a missing,
 * malformed, or unsupported callerId is refused outright and never mints a
 * link code. Only a valid, gateway-trusted-but-unbound Telegram principal
 * enters enrollment (the #74 trust model: issuance binds to the
 * gateway-asserted callerId; the completion page's identity display is where
 * a human catches a wrong binding before it is written).
 */
import type { Request, Response } from "express";
import { buildAuthRequiredEnvelope, issueLinkCode } from "./linking.js";

export type TelegramCallerClass =
  | { kind: "none" } // no callerId, or not a telegram principal — not ours to gate
  | { kind: "invalid" } // telegram: prefix but malformed — refuse, never mint
  | { kind: "valid"; telegramUserId: string };

const TELEGRAM_CALLER = /^telegram:(\d{1,20})$/;

export function classifyTelegramCaller(callerId: string | undefined): TelegramCallerClass {
  if (!callerId || !callerId.startsWith("telegram:")) return { kind: "none" };
  const match = TELEGRAM_CALLER.exec(callerId);
  if (!match) return { kind: "invalid" };
  return { kind: "valid", telegramUserId: match[1] };
}

/**
 * Optional chat context riding the request body (the mandatory
 * `handle_bot_start` call sends it) — enriches the code row so the completion
 * page can show the human WHICH Telegram they are binding.
 *
 * Private chats only: a chatId is accepted only when it equals the caller's
 * Telegram user id (they coincide in a DM; group ids never match), so a group
 * chat can never become a delivery destination.
 */
export function telegramMetaFromBody(
  body: unknown,
  telegramUserId: string
): { chatId?: string; username?: string; name?: string } {
  if (!body || typeof body !== "object") return {};
  const b = body as Record<string, unknown>;
  const meta: { chatId?: string; username?: string; name?: string } = {};
  if (typeof b.chatId === "string" && b.chatId === telegramUserId) meta.chatId = b.chatId;
  if (typeof b.telegramUsername === "string" && b.telegramUsername) {
    meta.username = b.telegramUsername.slice(0, 64);
  }
  if (typeof b.telegramName === "string" && b.telegramName) {
    meta.name = b.telegramName.slice(0, 128);
  }
  return meta;
}

/**
 * Runs the gate for an agent-path request whose principal has been resolved.
 * Returns true when it wrote the response (the request is settled); false
 * when the caller may proceed to the route handler.
 */
export async function enforceTelegramGate(req: Request, res: Response): Promise<boolean> {
  const caller = classifyTelegramCaller(req.callerId);
  if (caller.kind === "none") return false;

  if (caller.kind === "invalid") {
    res.status(403).json({ error: "Invalid caller identity" });
    return true;
  }

  if (req.callerSafe) return false; // linked — the ordinary authorized path

  try {
    const issued = await issueLinkCode({
      telegramUserId: caller.telegramUserId,
      ...telegramMetaFromBody(req.body, caller.telegramUserId),
    });
    if ("rateLimited" in issued) {
      res.status(429).json({
        error: "rate_limited",
        retry_after: issued.retryAfterSeconds,
      });
      return true;
    }
    res.status(403).json(buildAuthRequiredEnvelope(issued.code, issued.expiresAt));
  } catch (err) {
    // Fail closed: enrollment being down must not open any other path.
    console.error("Telegram enrollment issuance failed:", err);
    res.status(503).json({ error: "Linking is temporarily unavailable" });
  }
  return true;
}

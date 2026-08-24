/**
 * Telegram link-code issuance and the `auth_required` envelope (#134).
 *
 * The enrollment flow is the OAuth Device Authorization Grant shape (RFC
 * 8628): a valid-but-unbound Telegram principal is refused with a
 * verification URI until a Privy-authed completion writes the binding. The
 * envelope is deliberately credential-agnostic — nothing Telegram-specific in
 * the field names — so a future OAuth-backed agent credential reuses it
 * unchanged.
 *
 * Codes are high-entropy (256-bit), one active code per Telegram user,
 * idempotently re-issued until used/expired so the bot repeats the identical
 * message. Consumption (lib/telegram/binding.ts) looks rows up by sha256 hash,
 * never by the code itself. Fresh generations are rate-limited per chat;
 * re-reads of an active code are free.
 */
import crypto from "node:crypto";
import { fetchTelegramProfile } from "./profile.js";

export const AUTH_REQUIRED_ERROR = "auth_required" as const;

export const LINK_CODE_TTL_MS = 15 * 60 * 1000;
/** Fresh code generations allowed per Telegram user per window. */
export const LINK_CODE_RATE_LIMIT = { max: 6, windowMs: 60 * 60 * 1000 };

// ─────────────────────────────────────────────────────────────
// User codes (RFC 8628 §6.1) — the cross-device path: short and
// human-transcribable, typed at the stable /link page. The alphabet is
// ambiguity-free (no vowels → no accidental words; no digits → no 0/O 1/I
// confusion). 20^8 ≈ 2^34.5 of entropy is safe ONLY because entry happens
// inside an authenticated session and verification attempts are limited.
// ─────────────────────────────────────────────────────────────

export const USER_CODE_ALPHABET = "BCDFGHJKLMNPQRSTVWXZ";
export const USER_CODE_LENGTH = 8;
/** Failed user-code verification attempts allowed per account per window. */
export const USER_CODE_GUESS_LIMIT = { max: 10, windowMs: 15 * 60 * 1000 };

export function generateUserCode(): string {
  const bytes = crypto.randomBytes(USER_CODE_LENGTH);
  let out = "";
  for (let i = 0; i < USER_CODE_LENGTH; i++) {
    out += USER_CODE_ALPHABET[bytes[i] % USER_CODE_ALPHABET.length];
  }
  return out;
}

/** Canonical form: strip separators/junk, uppercase. Null when it can't be a code. */
export function normalizeUserCode(input: string): string | null {
  const canonical = input.toUpperCase().replace(new RegExp(`[^${USER_CODE_ALPHABET}]`, "g"), "");
  return canonical.length === USER_CODE_LENGTH ? canonical : null;
}

/** Display form: XXXX-XXXX. */
export function formatUserCode(canonical: string): string {
  return `${canonical.slice(0, 4)}-${canonical.slice(4)}`;
}

// Per-account guess limiter — in-memory is sufficient under the documented
// single-process constraint (PM2 instances: 1), and the window matches the
// code TTL. Keyed by the AUTHENTICATED account doing the typing: a failed
// guess matches no code row, so the limit must sit on the guesser.
const guessWindows = new Map<string, { windowStart: number; count: number }>();

export function checkUserCodeGuess(
  accountKey: string,
  now: Date = new Date()
): { allowed: true } | { allowed: false; retryAfterSeconds: number } {
  const t = now.getTime();
  const entry = guessWindows.get(accountKey);
  if (!entry || t - entry.windowStart >= USER_CODE_GUESS_LIMIT.windowMs) {
    guessWindows.set(accountKey, { windowStart: t, count: 1 });
    return { allowed: true };
  }
  if (entry.count >= USER_CODE_GUESS_LIMIT.max) {
    return {
      allowed: false,
      retryAfterSeconds: Math.ceil((USER_CODE_GUESS_LIMIT.windowMs - (t - entry.windowStart)) / 1000),
    };
  }
  entry.count++;
  return { allowed: true };
}

export function appUrl(): string {
  return (process.env.APP_URL ?? "https://app.zhentan.me").replace(/\/$/, "");
}

export function verificationUri(code: string): string {
  return `${appUrl()}/link?code=${encodeURIComponent(code)}`;
}

export function hashLinkCode(code: string): string {
  return crypto.createHash("sha256").update(code, "utf8").digest("hex");
}

/**
 * THE user-facing relay text — pinned here and nowhere else, so the agent
 * skill's "relay verbatim" rule is mechanical, not interpretive. Two paths,
 * per RFC 8628: the deep link (same device) and the short user code typed at
 * the stable /link page (any device with a signed-in session).
 */
export function authRequiredRelayText(
  uri: string,
  expiresInSeconds: number,
  userCode?: string | null
): string {
  const minutes = Math.max(1, Math.round(expiresInSeconds / 60));
  const codeLine = userCode
    ? `Or, on any device where you're signed in to Zhentan, go to ${appUrl()}/link ` +
      `and enter this code: ${formatUserCode(userCode)}\n\n`
    : "";
  return (
    `🔐 This Telegram isn't connected to a Zhentan account yet.\n\n` +
    `Open this link and confirm to connect it:\n${uri}\n\n` +
    codeLine +
    `The link expires in ${minutes} minute${minutes === 1 ? "" : "s"}. ` +
    `I can't help with anything account-related until then — if it expires, ` +
    `just message me again and I'll send a fresh one.`
  );
}

/**
 * Pinned relay for the consented RELINK intent (#134 §6) — same issuance and
 * the same two entry paths as enrollment; only the framing differs, because
 * the chat IS already connected and the user asked to re-point it.
 */
export function relinkRelayText(
  uri: string,
  expiresInSeconds: number,
  userCode?: string | null,
  accountLabel?: string | null
): string {
  const minutes = Math.max(1, Math.round(expiresInSeconds / 60));
  const codeLine = userCode
    ? `Or, on any device where you're signed in, go to ${appUrl()}/link ` +
      `and enter this code: ${formatUserCode(userCode)}\n\n`
    : "";
  return (
    `🔁 This Telegram is already connected` +
    (accountLabel ? ` to *${accountLabel}*` : "") +
    `.\n\nTo link it to a (different) Zhentan account, open this link and confirm:\n${uri}\n\n` +
    codeLine +
    `It expires in ${minutes} minute${minutes === 1 ? "" : "s"}.`
  );
}

export interface AuthRequiredEnvelope {
  error: typeof AUTH_REQUIRED_ERROR;
  verification_uri: string;
  /** Display-form user code (XXXX-XXXX) for cross-device entry at /link. */
  user_code: string | null;
  /** Seconds until the code expires (remaining, not the full TTL, on re-issue). */
  expires_in: number;
  /** Exact user-facing text the agent must relay verbatim. */
  relay: string;
}

export function buildAuthRequiredEnvelope(
  code: string,
  expiresAt: Date,
  userCode?: string | null,
  now: Date = new Date()
): AuthRequiredEnvelope {
  const expiresIn = Math.max(0, Math.floor((expiresAt.getTime() - now.getTime()) / 1000));
  const uri = verificationUri(code);
  return {
    error: AUTH_REQUIRED_ERROR,
    verification_uri: uri,
    user_code: userCode ? formatUserCode(userCode) : null,
    expires_in: expiresIn,
    relay: authRequiredRelayText(uri, expiresIn, userCode),
  };
}

// ─────────────────────────────────────────────────────────────
// Issuance
// ─────────────────────────────────────────────────────────────

export interface LinkCodeRow {
  telegram_user_id: string;
  code: string;
  code_hash: string;
  /** Canonical (undashed) RFC 8628 user code; rides the same lifecycle. */
  user_code: string | null;
  user_code_hash: string | null;
  telegram_chat_id: string;
  telegram_username: string | null;
  telegram_name: string | null;
  created_at: string;
  expires_at: string;
  used_at: string | null;
  window_started_at: string;
  window_count: number;
}

/** Storage seam — the default hits telegram_link_codes; tests use memory. */
export interface LinkCodeStore {
  get(telegramUserId: string): Promise<LinkCodeRow | null>;
  /** Upsert on telegram_user_id. */
  put(row: LinkCodeRow): Promise<void>;
}

// Lazy import: the supabase client throws without env at module load, and
// this module is reachable from env-free unit tests via the auth middleware.
const supabaseStore: LinkCodeStore = {
  async get(telegramUserId) {
    const { supabase } = await import("../supabase/client.js");
    const { data, error } = await supabase
      .from("telegram_link_codes")
      .select("*")
      .eq("telegram_user_id", telegramUserId)
      .maybeSingle<LinkCodeRow>();
    if (error) throw error;
    return data ?? null;
  },
  async put(row) {
    const { supabase } = await import("../supabase/client.js");
    const { error } = await supabase.from("telegram_link_codes").upsert(row);
    if (error) throw error;
  },
};

export interface IssueLinkCodeInput {
  telegramUserId: string;
  /** Private-chat delivery id; in a DM it equals the user id, the default. */
  chatId?: string;
  username?: string;
  name?: string;
}

export type IssueLinkCodeResult =
  | { code: string; userCode: string | null; expiresAt: Date }
  | { rateLimited: true; retryAfterSeconds: number };

export async function issueLinkCode(
  input: IssueLinkCodeInput,
  now: Date = new Date(),
  store: LinkCodeStore = supabaseStore,
  enrich: typeof fetchTelegramProfile = fetchTelegramProfile
): Promise<IssueLinkCodeResult> {
  const existing = await store.get(input.telegramUserId);

  // Active code → idempotent re-issue (refresh chat metadata if the caller
  // supplied richer context than the row holds; backfill a user code onto
  // rows minted before user codes existed).
  if (existing && !existing.used_at && new Date(existing.expires_at) > now) {
    const meta = mergeMeta(existing, input) ?? {};
    if (!existing.user_code) {
      meta.user_code = generateUserCode();
      meta.user_code_hash = hashLinkCode(meta.user_code);
    }
    if (Object.keys(meta).length > 0) await store.put({ ...existing, ...meta });
    return {
      code: existing.code,
      userCode: existing.user_code ?? meta.user_code ?? null,
      expiresAt: new Date(existing.expires_at),
    };
  }

  // Fresh generation → rate-limited per Telegram user.
  let windowStartedAt = now;
  let windowCount = 1;
  if (existing) {
    const windowAge = now.getTime() - new Date(existing.window_started_at).getTime();
    if (windowAge < LINK_CODE_RATE_LIMIT.windowMs) {
      if (existing.window_count >= LINK_CODE_RATE_LIMIT.max) {
        return {
          rateLimited: true,
          retryAfterSeconds: Math.ceil((LINK_CODE_RATE_LIMIT.windowMs - windowAge) / 1000),
        };
      }
      windowStartedAt = new Date(existing.window_started_at);
      windowCount = existing.window_count + 1;
    }
  }

  // Identity display shouldn't depend on the gateway passing metadata along:
  // when the caller supplied none, ask Telegram directly (the user has
  // messaged the bot, so getChat resolves). Best-effort — the code issues
  // either way, and the completion page falls back to the numeric id.
  let fetched: Awaited<ReturnType<typeof fetchTelegramProfile>> = null;
  if (!input.username && !input.name && !existing?.telegram_username && !existing?.telegram_name) {
    fetched = await enrich(input.telegramUserId).catch(() => null);
  }

  const code = crypto.randomBytes(32).toString("base64url");
  const expiresAt = new Date(now.getTime() + LINK_CODE_TTL_MS);
  // A user-code hash collision across active rows is ~(active codes / 2^34.5)
  // — but the unique index makes it an error, so regenerate rather than 500.
  let userCode = generateUserCode();
  for (let attempt = 0; ; attempt++) {
    try {
      await store.put({
        telegram_user_id: input.telegramUserId,
        code,
        code_hash: hashLinkCode(code),
        user_code: userCode,
        user_code_hash: hashLinkCode(userCode),
        telegram_chat_id: input.chatId ?? input.telegramUserId,
        telegram_username: input.username ?? existing?.telegram_username ?? fetched?.username ?? null,
        telegram_name: input.name ?? existing?.telegram_name ?? fetched?.name ?? null,
        created_at: now.toISOString(),
        expires_at: expiresAt.toISOString(),
        used_at: null,
        window_started_at: windowStartedAt.toISOString(),
        window_count: windowCount,
      });
      break;
    } catch (err) {
      if (attempt < 2 && /user_code_hash/.test(String((err as { message?: string })?.message ?? err))) {
        userCode = generateUserCode();
        continue;
      }
      throw err;
    }
  }
  return { code, userCode, expiresAt };
}

function mergeMeta(
  existing: LinkCodeRow,
  input: IssueLinkCodeInput
): Partial<LinkCodeRow> | null {
  const patch: Partial<LinkCodeRow> = {};
  if (input.chatId && input.chatId !== existing.telegram_chat_id) {
    patch.telegram_chat_id = input.chatId;
  }
  if (input.username && input.username !== existing.telegram_username) {
    patch.telegram_username = input.username;
  }
  if (input.name && input.name !== existing.telegram_name) {
    patch.telegram_name = input.name;
  }
  return Object.keys(patch).length > 0 ? patch : null;
}

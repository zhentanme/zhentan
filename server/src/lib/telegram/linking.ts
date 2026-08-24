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

export const AUTH_REQUIRED_ERROR = "auth_required" as const;

export const LINK_CODE_TTL_MS = 15 * 60 * 1000;
/** Fresh code generations allowed per Telegram user per window. */
export const LINK_CODE_RATE_LIMIT = { max: 6, windowMs: 60 * 60 * 1000 };

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
 * skill's "relay verbatim" rule is mechanical, not interpretive.
 */
export function authRequiredRelayText(uri: string, expiresInSeconds: number): string {
  const minutes = Math.max(1, Math.round(expiresInSeconds / 60));
  return (
    `🔐 This Telegram isn't connected to a Zhentan account yet.\n\n` +
    `Open this link and confirm to connect it:\n${uri}\n\n` +
    `The link expires in ${minutes} minute${minutes === 1 ? "" : "s"}. ` +
    `I can't help with anything account-related until then — if it expires, ` +
    `just message me again and I'll send a fresh one.`
  );
}

export interface AuthRequiredEnvelope {
  error: typeof AUTH_REQUIRED_ERROR;
  verification_uri: string;
  /** Seconds until the code expires (remaining, not the full TTL, on re-issue). */
  expires_in: number;
  /** Exact user-facing text the agent must relay verbatim. */
  relay: string;
}

export function buildAuthRequiredEnvelope(
  code: string,
  expiresAt: Date,
  now: Date = new Date()
): AuthRequiredEnvelope {
  const expiresIn = Math.max(0, Math.floor((expiresAt.getTime() - now.getTime()) / 1000));
  const uri = verificationUri(code);
  return {
    error: AUTH_REQUIRED_ERROR,
    verification_uri: uri,
    expires_in: expiresIn,
    relay: authRequiredRelayText(uri, expiresIn),
  };
}

// ─────────────────────────────────────────────────────────────
// Issuance
// ─────────────────────────────────────────────────────────────

export interface LinkCodeRow {
  telegram_user_id: string;
  code: string;
  code_hash: string;
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
  | { code: string; expiresAt: Date }
  | { rateLimited: true; retryAfterSeconds: number };

export async function issueLinkCode(
  input: IssueLinkCodeInput,
  now: Date = new Date(),
  store: LinkCodeStore = supabaseStore
): Promise<IssueLinkCodeResult> {
  const existing = await store.get(input.telegramUserId);

  // Active code → idempotent re-issue (refresh chat metadata if the caller
  // supplied richer context than the row holds).
  if (existing && !existing.used_at && new Date(existing.expires_at) > now) {
    const meta = mergeMeta(existing, input);
    if (meta) await store.put({ ...existing, ...meta });
    return { code: existing.code, expiresAt: new Date(existing.expires_at) };
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

  const code = crypto.randomBytes(32).toString("base64url");
  const expiresAt = new Date(now.getTime() + LINK_CODE_TTL_MS);
  await store.put({
    telegram_user_id: input.telegramUserId,
    code,
    code_hash: hashLinkCode(code),
    telegram_chat_id: input.chatId ?? input.telegramUserId,
    telegram_username: input.username ?? existing?.telegram_username ?? null,
    telegram_name: input.name ?? existing?.telegram_name ?? null,
    created_at: now.toISOString(),
    expires_at: expiresAt.toISOString(),
    used_at: null,
    window_started_at: windowStartedAt.toISOString(),
    window_count: windowCount,
  });
  return { code, expiresAt };
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

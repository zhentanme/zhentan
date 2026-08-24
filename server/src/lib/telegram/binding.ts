/**
 * Telegram binding reads + atomic completion/unlink (#134).
 *
 * The binding lives in telegram_links: trusted Telegram USER identity
 * (from.id) and the private CHAT id for delivery as distinct columns,
 * UNIQUE(telegram_user_id) — strictly one account per Telegram, enforced by
 * the constraint. All multi-row state changes (link, relink re-point, unlink
 * with its screening consequence) run inside SQL functions so a partial
 * failure is impossible; this module is the thin typed wrapper.
 */
import { supabase } from "../supabase/client.js";
import type { TelegramLinkRow } from "../supabase/types.js";
import { hashLinkCode, normalizeUserCode, type LinkCodeRow } from "./linking.js";
import { fetchTelegramProfile } from "./profile.js";

export type { TelegramLinkRow };

/**
 * Lazy identity enrichment: links created before enrichment existed (the
 * Privy-era backfill) carry neither username nor name. Fill them from the
 * Bot API ONCE — Telegram guarantees a first name, so after one successful
 * fetch the row is never re-fetched. Best-effort; the caller always gets a
 * usable link back.
 */
export async function ensureLinkMeta(link: TelegramLinkRow): Promise<TelegramLinkRow> {
  if (link.telegram_username || link.telegram_name) return link;
  const profile = await fetchTelegramProfile(link.telegram_user_id).catch(() => null);
  if (!profile || (!profile.username && !profile.name)) return link;
  const { error } = await supabase
    .from("telegram_links")
    .update({ telegram_username: profile.username, telegram_name: profile.name })
    .eq("telegram_user_id", link.telegram_user_id);
  if (error) console.error("Telegram link meta refresh failed:", error.message);
  return { ...link, telegram_username: profile.username, telegram_name: profile.name };
}

export async function getLinkBySafe(safeAddress: string): Promise<TelegramLinkRow | null> {
  const { data, error } = await supabase
    .from("telegram_links")
    .select("*")
    .eq("safe_address", safeAddress.toLowerCase())
    .maybeSingle<TelegramLinkRow>();
  if (error) throw error;
  return data ?? null;
}

export async function getLinkByTelegramUserId(
  telegramUserId: string
): Promise<TelegramLinkRow | null> {
  const { data, error } = await supabase
    .from("telegram_links")
    .select("*")
    .eq("telegram_user_id", telegramUserId)
    .maybeSingle<TelegramLinkRow>();
  if (error) throw error;
  return data ?? null;
}

// ─────────────────────────────────────────────────────────────
// Preview — non-consuming code lookup for the /link page: shows the human
// WHICH Telegram they are about to bind (the one point where a wrong or
// phished binding can be caught) plus the relink state for their account.
// ─────────────────────────────────────────────────────────────

export type LinkPreview =
  | { status: "invalid_code" }
  | {
      status: "valid";
      telegram: { userId: string; username: string | null; name: string | null };
      /** How completing would relate to the CALLER's account. */
      relation: "unlinked" | "already_linked" | "linked_elsewhere";
    };

export async function previewLinkCode(
  code: string,
  callerSafe: string
): Promise<LinkPreview> {
  const { data, error } = await supabase
    .from("telegram_link_codes")
    .select("*")
    .eq("code_hash", hashLinkCode(code))
    .maybeSingle<LinkCodeRow>();
  if (error) throw error;
  if (!data || data.used_at || new Date(data.expires_at) <= new Date()) {
    return { status: "invalid_code" };
  }

  const existing = await getLinkByTelegramUserId(data.telegram_user_id);
  const relation = !existing
    ? "unlinked"
    : existing.safe_address === callerSafe.toLowerCase()
      ? "already_linked"
      : "linked_elsewhere";

  return {
    status: "valid",
    telegram: {
      userId: data.telegram_user_id,
      username: data.telegram_username,
      name: data.telegram_name,
    },
    relation,
  };
}

/**
 * Cross-device entry (RFC 8628): resolve a typed user code to the row's LONG
 * code, so everything downstream (preview / photo / completion) runs the
 * identical pipeline regardless of which credential the human presented.
 * Null for malformed, unknown, used, or expired codes — indistinguishable.
 */
export async function lookupCodeByUserCode(input: string): Promise<string | null> {
  const canonical = normalizeUserCode(input);
  if (!canonical) return null;
  const { data, error } = await supabase
    .from("telegram_link_codes")
    .select("code, used_at, expires_at")
    .eq("user_code_hash", hashLinkCode(canonical))
    .maybeSingle<{ code: string; used_at: string | null; expires_at: string }>();
  if (error) throw error;
  if (!data || data.used_at || new Date(data.expires_at) <= new Date()) return null;
  return data.code;
}

/** The Telegram user behind a still-valid (unused, unexpired) code — for
 *  the consent page's photo proxy. Null for anything else. */
export async function telegramUserIdForCode(code: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("telegram_link_codes")
    .select("telegram_user_id, used_at, expires_at")
    .eq("code_hash", hashLinkCode(code))
    .maybeSingle<{ telegram_user_id: string; used_at: string | null; expires_at: string }>();
  if (error) throw error;
  if (!data || data.used_at || new Date(data.expires_at) <= new Date()) return null;
  return data.telegram_user_id;
}

// ─────────────────────────────────────────────────────────────
// Completion + unlink — atomic SQL functions (see the migration for the
// transaction semantics; the wrappers only type the JSONB result).
// ─────────────────────────────────────────────────────────────

export type CompleteLinkResult =
  | { status: "invalid_code" }
  | { status: "already_linked" }
  | { status: "needs_relink_confirmation"; previous_safe_address: string }
  | { status: "relinked"; previous_safe_address: string; previous_chat_id: string }
  | {
      status: "linked";
      replaced_telegram_user_id: string | null;
      replaced_chat_id: string | null;
    }
  | { status: "conflict" };

export async function completeLink(
  code: string,
  safeAddress: string,
  confirmRelink: boolean
): Promise<CompleteLinkResult> {
  const { data, error } = await supabase.rpc("complete_telegram_link", {
    p_code_hash: hashLinkCode(code),
    p_safe_address: safeAddress.toLowerCase(),
    p_confirm_relink: confirmRelink,
  });
  if (error) throw error;
  return data as CompleteLinkResult;
}

export type UnlinkResult =
  | { status: "not_linked" }
  | {
      status: "unlinked";
      telegram_user_id: string;
      telegram_chat_id: string;
      telegram_username: string | null;
      telegram_name: string | null;
    };

export async function unlinkTelegram(safeAddress: string): Promise<UnlinkResult> {
  const { data, error } = await supabase.rpc("unlink_telegram", {
    p_safe_address: safeAddress.toLowerCase(),
  });
  if (error) throw error;
  return data as UnlinkResult;
}

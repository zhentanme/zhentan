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
import { hashLinkCode, type LinkCodeRow } from "./linking.js";

export type { TelegramLinkRow };

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

/**
 * Telegram profile enrichment (#134 follow-up) — username, display name and
 * profile photo straight from the Bot API, so identity display never depends
 * on what the agent gateway happened to pass along. getChat works for any
 * user who has messaged the bot, which the chat-initiated flow guarantees.
 *
 * Everything here is best-effort with short timeouts: enrichment failing must
 * never break issuance, linking, or a status read.
 */

const TG_TIMEOUT_MS = 4_000;

function tgApi(): string | null {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  return token ? `https://api.telegram.org/bot${token}` : null;
}

async function tgCall<T>(method: string, params: Record<string, unknown>): Promise<T | null> {
  const api = tgApi();
  if (!api) return null;
  try {
    const res = await fetch(`${api}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
      signal: AbortSignal.timeout(TG_TIMEOUT_MS),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { ok: boolean; result?: T };
    return data.ok ? (data.result ?? null) : null;
  } catch {
    return null;
  }
}

export interface TelegramProfile {
  username: string | null;
  name: string | null;
}

/** Username + display name for a user the bot shares a private chat with. */
export async function fetchTelegramProfile(telegramUserId: string): Promise<TelegramProfile | null> {
  const chat = await tgCall<{ username?: string; first_name?: string; last_name?: string }>(
    "getChat",
    { chat_id: telegramUserId }
  );
  if (!chat) return null;
  const name = [chat.first_name, chat.last_name].filter(Boolean).join(" ") || null;
  return { username: chat.username ?? null, name };
}

/**
 * The user's current profile photo, proxied as raw bytes. Telegram file URLs
 * embed the bot token, so they can never be handed to a browser — the server
 * fetches and re-serves them instead.
 */
export async function fetchTelegramPhoto(
  telegramUserId: string
): Promise<{ bytes: Buffer; contentType: string } | null> {
  const photos = await tgCall<{ total_count: number; photos: { file_id: string }[][] }>(
    "getUserProfilePhotos",
    { user_id: Number(telegramUserId), limit: 1 }
  );
  const sizes = photos?.photos?.[0];
  if (!sizes?.length) return null;
  // Sizes are ordered small→large; the last is the biggest (≤640px) — plenty
  // for an avatar and small enough to proxy.
  const file = await tgCall<{ file_path?: string }>("getFile", {
    file_id: sizes[sizes.length - 1].file_id,
  });
  const api = tgApi();
  if (!file?.file_path || !api) return null;
  try {
    const res = await fetch(
      `${api.replace("/bot", "/file/bot")}/${file.file_path}`,
      { signal: AbortSignal.timeout(TG_TIMEOUT_MS) }
    );
    if (!res.ok) return null;
    return {
      bytes: Buffer.from(await res.arrayBuffer()),
      contentType: res.headers.get("content-type") ?? "image/jpeg",
    };
  } catch {
    return null;
  }
}

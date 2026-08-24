const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

const TG_API = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;

interface ReplyButton {
  text: string;
}

// txId → Telegram messageId lives in the notification_messages table
// (D0.2): resolve_notification must survive restarts and process splits.
// Lazy import: the supabase client throws without env at module load, and
// notify.ts is reachable from env-free unit tests via sponsor.ts.
async function db() {
  return (await import("./lib/supabase/client.js")).supabase;
}

async function saveNotificationMessage(txId: string, chatId: string, messageId: number): Promise<void> {
  const { error } = await (await db()).from("notification_messages").upsert({
    tx_id: txId,
    channel: "telegram",
    chat_id: chatId,
    message_id: String(messageId),
  });
  if (error) console.error(`Failed to persist notification message for ${txId}:`, error.message);
}

async function takeNotificationMessage(txId: string): Promise<{ chatId: string; messageId: string } | null> {
  const { data, error } = await (await db())
    .from("notification_messages")
    .select("chat_id, message_id")
    .eq("tx_id", txId)
    .eq("channel", "telegram")
    .maybeSingle<{ chat_id: string; message_id: string }>();
  if (error) {
    console.error(`Notification message lookup failed for ${txId}:`, error.message);
    return null;
  }
  return data ? { chatId: data.chat_id, messageId: data.message_id } : null;
}

async function deleteNotificationMessage(txId: string): Promise<void> {
  const { error } = await (await db())
    .from("notification_messages")
    .delete()
    .eq("tx_id", txId)
    .eq("channel", "telegram");
  if (error) console.error(`Notification message cleanup failed for ${txId}:`, error.message);
}

/**
 * Per-USER Telegram send. Requires the user's resolved chat id — when the
 * account has no Telegram link the message is dropped silently (email/in-app
 * still fire via notify()). There is deliberately NO fallback to the admin
 * chat: a screen-job result applying just after an unlink must never deliver
 * that user's transaction details to the operator (#134 §7).
 */
export function notifyTelegram(
  message: string,
  buttons?: ReplyButton[][],
  txId?: string,
  chatId?: string
): void {
  const targetChatId = chatId;
  if (!targetChatId) {
    console.warn("No Telegram chat resolved for user notification — dropping:", message.slice(0, 120));
    return;
  }
  const body: Record<string, unknown> = {
    chat_id: targetChatId,
    text: message,
    parse_mode: "Markdown",
  };

  if (buttons) {
    body.reply_markup = {
      keyboard: buttons,
      one_time_keyboard: true,
      resize_keyboard: true,
    };
  }

  fetch(`${TG_API}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
    .then(async (res) => {
      if (!res.ok) {
        const text = await res.text();
        console.error("Telegram sendMessage failed:", res.status, text);
        return;
      }
      if (txId) {
        const data = await res.json();
        const messageId = data?.result?.message_id;
        if (messageId) {
          await saveNotificationMessage(txId, targetChatId, messageId);
        }
      }
    })
    .catch((err) => {
      console.error("Telegram notification error:", err);
    });
}

/**
 * OPERATIONAL alerts only (sponsor low-gas and the like) — goes to the admin
 * chat (TELEGRAM_CHAT_ID). Never route per-user content through this.
 */
export function notifyAdminTelegram(message: string): void {
  if (!TELEGRAM_CHAT_ID) {
    console.warn("TELEGRAM_CHAT_ID is unset — dropping operational alert:", message.slice(0, 120));
    return;
  }
  fetch(`${TG_API}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: message, parse_mode: "Markdown" }),
  })
    .then(async (res) => {
      if (!res.ok) console.error("Telegram admin sendMessage failed:", res.status, await res.text());
    })
    .catch((err) => console.error("Telegram admin notification error:", err));
}

export function editNotification(txId: string, newMessage: string, chatId?: string): void {
  void (async () => {
    const stored = await takeNotificationMessage(txId);
    if (!stored) {
      console.warn(`No notification message found for ${txId}`);
      return;
    }

    const res = await fetch(`${TG_API}/editMessageText`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId || stored.chatId,
        message_id: Number(stored.messageId),
        text: newMessage,
        parse_mode: "Markdown",
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      console.error("Telegram editMessageText failed:", res.status, text);
      return;
    }
    await deleteNotificationMessage(txId);
  })().catch((err) => {
    console.error("Telegram edit error:", err);
  });
}

/**
 * Unlink cleanup (#134 §7): live ✅/❌ messages in a chat that just lost its
 * binding would fail closed by accident — retire them EXPLICITLY so the chat
 * doesn't look actionable, and drop the tracking rows so nothing later tries
 * to edit into an unlinked chat. Best-effort per message; fire-and-forget.
 */
export function retireChatNotifications(chatId: string, newMessage: string): void {
  void (async () => {
    const { data, error } = await (await db())
      .from("notification_messages")
      .select("tx_id, message_id")
      .eq("chat_id", chatId)
      .eq("channel", "telegram")
      .returns<{ tx_id: string; message_id: string }[]>();
    if (error) {
      console.error(`Notification lookup for chat ${chatId} failed:`, error.message);
      return;
    }
    for (const row of data ?? []) {
      const res = await fetch(`${TG_API}/editMessageText`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          message_id: Number(row.message_id),
          text: newMessage,
          parse_mode: "Markdown",
        }),
      }).catch(() => null);
      if (res && !res.ok) {
        console.error(`Retiring message for ${row.tx_id} failed:`, res.status, await res.text());
      }
    }
    const { error: delError } = await (await db())
      .from("notification_messages")
      .delete()
      .eq("chat_id", chatId)
      .eq("channel", "telegram");
    if (delError) {
      console.error(`Notification cleanup for chat ${chatId} failed:`, delError.message);
    }
  })().catch((err) => console.error("Telegram chat retirement error:", err));
}

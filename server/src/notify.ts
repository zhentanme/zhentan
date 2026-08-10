const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || "593960240";

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

export async function getNotificationMessageId(txId: string): Promise<string | undefined> {
  return (await takeNotificationMessage(txId))?.messageId;
}

export function notifyTelegram(
  message: string,
  buttons?: ReplyButton[][],
  txId?: string,
  chatId?: string
): void {
  const targetChatId = chatId || TELEGRAM_CHAT_ID;
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

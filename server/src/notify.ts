const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID || "593960240";

const TG_API = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;

interface ReplyButton {
  text: string;
}

// In-memory map of txId → Telegram messageId for editing notifications later
const notificationMessages = new Map<string, number>();

export function getNotificationMessageId(txId: string): string | undefined {
  const id = notificationMessages.get(txId);
  return id != null ? String(id) : undefined;
}

export function notifyTelegram(
  message: string,
  buttons?: ReplyButton[][],
  txId?: string,
  chatId?: string
): void {
  const body: Record<string, unknown> = {
    chat_id: chatId || TELEGRAM_CHAT_ID,
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
          notificationMessages.set(txId, messageId);
        }
      }
    })
    .catch((err) => {
      console.error("Telegram notification error:", err);
    });
}

export function editNotification(txId: string, newMessage: string, chatId?: string): void {
  const messageId = notificationMessages.get(txId);
  if (messageId == null) {
    console.warn(`No notification message found for ${txId}`);
    return;
  }

  fetch(`${TG_API}/editMessageText`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId || TELEGRAM_CHAT_ID,
      message_id: messageId,
      text: newMessage,
      parse_mode: "Markdown",
    }),
  })
    .then(async (res) => {
      if (!res.ok) {
        const text = await res.text();
        console.error("Telegram editMessageText failed:", res.status, text);
        return;
      }
      notificationMessages.delete(txId);
    })
    .catch((err) => {
      console.error("Telegram edit error:", err);
    });
}

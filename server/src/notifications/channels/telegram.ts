import type { UserDetailsRow } from "../../lib/supabase/types.js";
import { getTelegramChatId } from "../../lib/supabase/index.js";
import type { Channel, TelegramMessage } from "../types.js";

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TG_API = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}`;

export const telegramChannel: Channel<TelegramMessage> = {
  id: "telegram",

  isConfigured() {
    return Boolean(TELEGRAM_BOT_TOKEN);
  },

  async send(user: UserDetailsRow, message: TelegramMessage): Promise<void> {
    // Delivery resolves through the telegram_links binding (#134). No link →
    // drop silently; the other channels (email/in-app) still fire, and there
    // is deliberately no admin-chat fallback for per-user content.
    const chatId = await getTelegramChatId(user.safe_address);
    if (!chatId) return;

    const res = await fetch(`${TG_API}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: message.text,
        parse_mode: message.parseMode ?? "Markdown",
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Telegram send failed: ${res.status} ${body}`);
    }
  },
};

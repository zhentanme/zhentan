import type { UserDetailsRow } from "../lib/supabase/types.js";

export type ChannelId = "telegram" | "email";

export interface TelegramMessage {
  text: string;
  parseMode?: "Markdown" | "HTML";
}

export interface EmailMessage {
  subject: string;
  // Option A: Resend dashboard template
  templateId?: string;
  variables?: Record<string, string | number | boolean>;
  // Option B: inline HTML (used when templateId is not set)
  html?: string;
  text?: string;
}

export interface Channel<M> {
  id: ChannelId;
  isConfigured(): boolean;
  send(user: UserDetailsRow, message: M): Promise<void>;
}

/**
 * An event describes *what* to send for each channel given a user and payload.
 * Adding a new event = add a new entry to the EVENTS registry in events.ts.
 */
export interface EventDefinition<Payload = void> {
  name: string;
  telegram?: (user: UserDetailsRow, payload: Payload) => TelegramMessage | null;
  email?: (user: UserDetailsRow, payload: Payload) => EmailMessage | null;
}

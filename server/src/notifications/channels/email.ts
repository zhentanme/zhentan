import type { UserDetailsRow } from "../../lib/supabase/types.js";
import type { Channel, EmailMessage } from "../types.js";

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL;
const RESEND_ENDPOINT = "https://api.resend.com/emails";

/**
 * We call the Resend REST API directly because the Node SDK (4.x) doesn't yet
 * recognize the `template` field for dashboard templates — it strips it from
 * the payload, causing the API to return "Missing html or text field".
 * See: https://resend.com/docs/dashboard/templates/introduction
 */
export const emailChannel: Channel<EmailMessage> = {
  id: "email",

  isConfigured() {
    return Boolean(RESEND_API_KEY && FROM_EMAIL);
  },

  async send(user: UserDetailsRow, message: EmailMessage): Promise<void> {
    if (!RESEND_API_KEY || !FROM_EMAIL) return;
    if (!user.email) return;

    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(
        message.templateId
          ? {
              from: FROM_EMAIL,
              to: [user.email],
              subject: message.subject,
              template: {
                id: message.templateId,
                variables: message.variables ?? {},
              },
            }
          : {
              from: FROM_EMAIL,
              to: [user.email],
              subject: message.subject,
              html: message.html,
              ...(message.text && { text: message.text }),
            }
      ),
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Resend send failed: ${res.status} ${body}`);
    }
  },
};

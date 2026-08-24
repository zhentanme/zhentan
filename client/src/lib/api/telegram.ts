import type { ApiFetchFn } from "./client";

/** Public identity of the Telegram bound (or about to be bound) to an account. */
export interface TelegramIdentity {
  userId: string;
  username: string | null;
  name: string | null;
  linkedAt?: string;
}

export interface TelegramLinkState {
  linked: boolean;
  telegram: TelegramIdentity | null;
}

export type LinkPreview =
  | { status: "invalid_code" }
  | {
      status: "valid";
      telegram: { userId: string; username: string | null; name: string | null };
      relation: "unlinked" | "already_linked" | "linked_elsewhere";
    };

export type LinkCompleteResult =
  | { status: "invalid_code" }
  | { status: "already_linked" }
  | { status: "needs_relink_confirmation"; previous_safe_address: string }
  | { status: "relinked" }
  | { status: "linked" }
  | { status: "conflict" };

export type UnlinkResult = { status: "not_linked" } | { status: "unlinked" };

export function telegramApi(req: ApiFetchFn) {
  return {
    /** Current binding for the caller's account. */
    async get(): Promise<TelegramLinkState> {
      const res = await req("/telegram");
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },

    /** Non-consuming code lookup for the /link consent page. */
    async previewLink(code: string): Promise<LinkPreview> {
      const res = await req("/telegram/link/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },

    /** Consume the code and write the binding (relink needs explicit consent). */
    async completeLink(code: string, confirmRelink = false): Promise<LinkCompleteResult> {
      const res = await req("/telegram/link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, confirmRelink }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok && !data?.status) throw new Error(data?.error ?? "Link failed");
      return data;
    },

    /** Atomic server-side unlink (binding + screening consequence together). */
    async unlink(): Promise<UnlinkResult> {
      const res = await req("/telegram/unlink", { method: "POST" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
  };
}

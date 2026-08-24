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

/** The two RFC 8628 entry paths: deep-link long code, or typed user code. */
export type LinkCredential = { code: string } | { userCode: string };

export type LinkPreview =
  | { status: "invalid_code" }
  | { status: "rate_limited"; retryAfter?: number }
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
    async previewLink(credential: LinkCredential): Promise<LinkPreview> {
      const res = await req("/telegram/link/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(credential),
      });
      if (res.status === 429) {
        const data = await res.json().catch(() => ({}));
        return { status: "rate_limited", retryAfter: data?.retry_after };
      }
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },

    /** Consume the code and write the binding (relink needs explicit consent). */
    async completeLink(
      credential: LinkCredential,
      confirmRelink = false
    ): Promise<LinkCompleteResult> {
      const res = await req("/telegram/link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...credential, confirmRelink }),
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

    /** Profile photo of the linked Telegram (server-proxied). Null = none. */
    async photo(): Promise<Blob | null> {
      const res = await req("/telegram/photo");
      return res.ok ? res.blob() : null;
    },

    /** Photo of the Telegram a link code would bind — for the consent page. */
    async linkPhoto(credential: LinkCredential): Promise<Blob | null> {
      const res = await req("/telegram/link/photo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(credential),
      });
      return res.ok ? res.blob() : null;
    },
  };
}

import { describe, expect, it } from "vitest";
import {
  AUTH_REQUIRED_ERROR,
  LINK_CODE_RATE_LIMIT,
  LINK_CODE_TTL_MS,
  buildAuthRequiredEnvelope,
  hashLinkCode,
  issueLinkCode,
  verificationUri,
  type LinkCodeRow,
  type LinkCodeStore,
} from "./linking.js";

function memoryStore(): LinkCodeStore & { rows: Map<string, LinkCodeRow> } {
  const rows = new Map<string, LinkCodeRow>();
  return {
    rows,
    async get(id) {
      return rows.get(id) ?? null;
    },
    async put(row) {
      rows.set(row.telegram_user_id, { ...(rows.get(row.telegram_user_id) ?? {}), ...row });
    },
  };
}

const T0 = new Date("2026-08-24T12:00:00Z");
const minutes = (n: number) => new Date(T0.getTime() + n * 60_000);

describe("issueLinkCode", () => {
  it("mints a high-entropy code with the full TTL", async () => {
    const store = memoryStore();
    const result = await issueLinkCode({ telegramUserId: "42" }, T0, store);
    if ("rateLimited" in result) throw new Error("unexpected rate limit");
    // 32 random bytes base64url — 43 chars, well past the 128-bit floor.
    expect(result.code).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(result.expiresAt.getTime()).toBe(T0.getTime() + LINK_CODE_TTL_MS);
    const row = store.rows.get("42")!;
    expect(row.code_hash).toBe(hashLinkCode(result.code));
    // Private-chat default: delivery chat is the user id itself.
    expect(row.telegram_chat_id).toBe("42");
  });

  it("re-issues the IDENTICAL code while it is active (idempotent repeat message)", async () => {
    const store = memoryStore();
    const first = await issueLinkCode({ telegramUserId: "42" }, T0, store);
    const second = await issueLinkCode({ telegramUserId: "42" }, minutes(5), store);
    if ("rateLimited" in first || "rateLimited" in second) throw new Error("rate limited");
    expect(second.code).toBe(first.code);
    // Remaining TTL, not a fresh one — RFC 8628 authorization_pending spirit.
    expect(second.expiresAt.getTime()).toBe(first.expiresAt.getTime());
  });

  it("enriches chat metadata on re-issue without rotating the code", async () => {
    const store = memoryStore();
    const first = await issueLinkCode({ telegramUserId: "42" }, T0, store);
    const second = await issueLinkCode(
      { telegramUserId: "42", username: "koshik", name: "Koshik" },
      minutes(1),
      store
    );
    if ("rateLimited" in first || "rateLimited" in second) throw new Error("rate limited");
    expect(second.code).toBe(first.code);
    const row = store.rows.get("42")!;
    expect(row.telegram_username).toBe("koshik");
    expect(row.telegram_name).toBe("Koshik");
  });

  it("rotates to a fresh code once the active one expires", async () => {
    const store = memoryStore();
    const first = await issueLinkCode({ telegramUserId: "42" }, T0, store);
    const later = await issueLinkCode({ telegramUserId: "42" }, minutes(16), store);
    if ("rateLimited" in first || "rateLimited" in later) throw new Error("rate limited");
    expect(later.code).not.toBe(first.code);
  });

  it("rotates to a fresh code after single-use consumption", async () => {
    const store = memoryStore();
    const first = await issueLinkCode({ telegramUserId: "42" }, T0, store);
    if ("rateLimited" in first) throw new Error("rate limited");
    store.rows.get("42")!.used_at = minutes(1).toISOString();
    const next = await issueLinkCode({ telegramUserId: "42" }, minutes(2), store);
    if ("rateLimited" in next) throw new Error("rate limited");
    expect(next.code).not.toBe(first.code);
  });

  it("rate-limits fresh generations per chat, and resets after the window", async () => {
    const store = memoryStore();
    // Burn through the window: each generation is forced fresh by consuming
    // the previous code.
    for (let i = 0; i < LINK_CODE_RATE_LIMIT.max; i++) {
      const r = await issueLinkCode({ telegramUserId: "42" }, minutes(i), store);
      expect("rateLimited" in r).toBe(false);
      store.rows.get("42")!.used_at = minutes(i).toISOString();
    }
    const refused = await issueLinkCode({ telegramUserId: "42" }, minutes(10), store);
    expect(refused).toMatchObject({ rateLimited: true });
    if ("rateLimited" in refused) {
      expect(refused.retryAfterSeconds).toBeGreaterThan(0);
    }
    // A different chat is unaffected.
    const other = await issueLinkCode({ telegramUserId: "43" }, minutes(10), store);
    expect("rateLimited" in other).toBe(false);
    // The window expires and issuance resumes.
    const afterWindow = await issueLinkCode(
      { telegramUserId: "42" },
      new Date(T0.getTime() + LINK_CODE_RATE_LIMIT.windowMs + 60_000),
      store
    );
    expect("rateLimited" in afterWindow).toBe(false);
  });
});

describe("auth_required envelope", () => {
  it("is credential-agnostic and carries the pinned relay verbatim", () => {
    const expiresAt = new Date(T0.getTime() + LINK_CODE_TTL_MS);
    const envelope = buildAuthRequiredEnvelope("some-code", expiresAt, T0);
    expect(envelope.error).toBe(AUTH_REQUIRED_ERROR);
    expect(envelope.verification_uri).toBe(verificationUri("some-code"));
    expect(envelope.expires_in).toBe(LINK_CODE_TTL_MS / 1000);
    // The relay text embeds the exact URI and the human-readable expiry.
    expect(envelope.relay).toContain(envelope.verification_uri);
    expect(envelope.relay).toContain("15 minutes");
    // Nothing Telegram-protocol-specific leaks into the field names.
    expect(Object.keys(envelope).sort()).toEqual([
      "error",
      "expires_in",
      "relay",
      "verification_uri",
    ]);
  });

  it("reports REMAINING lifetime for a re-issued code", () => {
    const expiresAt = new Date(T0.getTime() + LINK_CODE_TTL_MS);
    const fiveLater = new Date(T0.getTime() + 5 * 60_000);
    const envelope = buildAuthRequiredEnvelope("some-code", expiresAt, fiveLater);
    expect(envelope.expires_in).toBe(10 * 60);
  });
});

/**
 * #134 contract test: the linked caller's command path is unchanged —
 * "telegram:<id>" still resolves through getUserByTelegramId (now backed by
 * telegram_links) to exactly one Safe, and everything else resolves to null.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("./supabase/index.js", () => ({
  getUserByTelegramId: vi.fn(async (id: string) =>
    id === "593960240" ? { safe_address: "0xabc0000000000000000000000000000000000abc" } : null
  ),
}));

import { getSafeAddressFromCallerId } from "./caller.js";
import { getUserByTelegramId } from "./supabase/index.js";

describe("getSafeAddressFromCallerId", () => {
  it("resolves a linked telegram caller to their Safe", async () => {
    await expect(getSafeAddressFromCallerId("telegram:593960240")).resolves.toBe(
      "0xabc0000000000000000000000000000000000abc"
    );
    expect(getUserByTelegramId).toHaveBeenCalledWith("593960240");
  });

  it("resolves an unlinked telegram caller to null", async () => {
    await expect(getSafeAddressFromCallerId("telegram:222")).resolves.toBeNull();
  });

  it("resolves missing or unsupported callerIds to null without lookups", async () => {
    vi.mocked(getUserByTelegramId).mockClear();
    await expect(getSafeAddressFromCallerId(undefined)).resolves.toBeNull();
    await expect(getSafeAddressFromCallerId(null)).resolves.toBeNull();
    await expect(getSafeAddressFromCallerId("")).resolves.toBeNull();
    await expect(getSafeAddressFromCallerId("telegram:")).resolves.toBeNull();
    await expect(getSafeAddressFromCallerId("discord:123")).resolves.toBeNull();
    expect(getUserByTelegramId).not.toHaveBeenCalledWith("");
  });
});

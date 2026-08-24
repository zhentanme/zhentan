import { describe, expect, it } from "vitest";
import { classifyTelegramCaller, telegramMetaFromBody } from "./gate.js";

describe("classifyTelegramCaller", () => {
  it("treats missing / non-telegram principals as not ours to gate", () => {
    expect(classifyTelegramCaller(undefined)).toEqual({ kind: "none" });
    expect(classifyTelegramCaller("")).toEqual({ kind: "none" });
    expect(classifyTelegramCaller("privy:did:abc")).toEqual({ kind: "none" });
    expect(classifyTelegramCaller("discord:123")).toEqual({ kind: "none" });
  });

  it("classifies malformed telegram principals as invalid — never enrollment", () => {
    expect(classifyTelegramCaller("telegram:")).toEqual({ kind: "invalid" });
    expect(classifyTelegramCaller("telegram:abc")).toEqual({ kind: "invalid" });
    expect(classifyTelegramCaller("telegram:12a")).toEqual({ kind: "invalid" });
    expect(classifyTelegramCaller("telegram:-100123")).toEqual({ kind: "invalid" }); // group id
    expect(classifyTelegramCaller("telegram:12 3")).toEqual({ kind: "invalid" });
    expect(classifyTelegramCaller("telegram:" + "9".repeat(21))).toEqual({ kind: "invalid" });
  });

  it("accepts a numeric telegram user id", () => {
    expect(classifyTelegramCaller("telegram:593960240")).toEqual({
      kind: "valid",
      telegramUserId: "593960240",
    });
  });
});

describe("telegramMetaFromBody", () => {
  it("accepts a chatId only when it IS the caller's user id (private chats only)", () => {
    expect(telegramMetaFromBody({ chatId: "42" }, "42")).toEqual({ chatId: "42" });
    // A group chat id (negative, or simply someone else's) never becomes a
    // delivery destination.
    expect(telegramMetaFromBody({ chatId: "-100999" }, "42")).toEqual({});
    expect(telegramMetaFromBody({ chatId: "43" }, "42")).toEqual({});
  });

  it("passes display metadata through and tolerates junk bodies", () => {
    expect(
      telegramMetaFromBody({ telegramUsername: "koshik", telegramName: "Koshik" }, "42")
    ).toEqual({ username: "koshik", name: "Koshik" });
    expect(telegramMetaFromBody(undefined, "42")).toEqual({});
    expect(telegramMetaFromBody("nope", "42")).toEqual({});
    expect(telegramMetaFromBody({ telegramUsername: 7 }, "42")).toEqual({});
  });
});

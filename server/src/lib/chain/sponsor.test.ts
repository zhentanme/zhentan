import { describe, it, expect } from "vitest";
import { resolveSponsorPrivateKey } from "./sponsor.js";

const KEY_A = "0x" + "11".repeat(32);
const KEY_B = "0x" + "22".repeat(32);

describe("resolveSponsorPrivateKey", () => {
  it("returns SPONSOR_PRIVATE_KEY when it is the only key set", () => {
    expect(resolveSponsorPrivateKey({ SPONSOR_PRIVATE_KEY: KEY_A })).toBe(KEY_A);
  });

  it("falls back to AGENT_PRIVATE_KEY (the operational default)", () => {
    expect(resolveSponsorPrivateKey({ AGENT_PRIVATE_KEY: KEY_B })).toBe(KEY_B);
  });

  it("treats an empty SPONSOR_PRIVATE_KEY as unset", () => {
    expect(
      resolveSponsorPrivateKey({ SPONSOR_PRIVATE_KEY: "", AGENT_PRIVATE_KEY: KEY_B })
    ).toBe(KEY_B);
  });

  it("throws when neither key is configured", () => {
    expect(() => resolveSponsorPrivateKey({})).toThrow(/Missing SPONSOR_PRIVATE_KEY/);
  });

  it("accepts both keys set to the same key", () => {
    expect(
      resolveSponsorPrivateKey({ SPONSOR_PRIVATE_KEY: KEY_A, AGENT_PRIVATE_KEY: KEY_A })
    ).toBe(KEY_A);
  });

  // Distinct keys are supported since B2: every EOA send goes through the
  // sponsor wallet (execution, rejection, deploy).
  it("prefers a distinct SPONSOR_PRIVATE_KEY over the agent key", () => {
    expect(
      resolveSponsorPrivateKey({ SPONSOR_PRIVATE_KEY: KEY_A, AGENT_PRIVATE_KEY: KEY_B })
    ).toBe(KEY_A);
  });
});

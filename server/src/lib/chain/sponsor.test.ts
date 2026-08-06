import { describe, it, expect } from "vitest";
import { resolveSponsorPrivateKey } from "./sponsor.js";

const SPONSOR = "0x" + "11".repeat(32);
const AGENT = "0x" + "22".repeat(32);

describe("resolveSponsorPrivateKey", () => {
  it("prefers SPONSOR_PRIVATE_KEY when set", () => {
    expect(
      resolveSponsorPrivateKey({ SPONSOR_PRIVATE_KEY: SPONSOR, AGENT_PRIVATE_KEY: AGENT })
    ).toBe(SPONSOR);
  });

  it("falls back to AGENT_PRIVATE_KEY (the operational default)", () => {
    expect(resolveSponsorPrivateKey({ AGENT_PRIVATE_KEY: AGENT })).toBe(AGENT);
  });

  it("treats an empty SPONSOR_PRIVATE_KEY as unset", () => {
    expect(
      resolveSponsorPrivateKey({ SPONSOR_PRIVATE_KEY: "", AGENT_PRIVATE_KEY: AGENT })
    ).toBe(AGENT);
  });

  it("throws when neither key is configured", () => {
    expect(() => resolveSponsorPrivateKey({})).toThrow(/Missing SPONSOR_PRIVATE_KEY/);
  });
});

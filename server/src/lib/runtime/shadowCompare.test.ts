import { describe, it, expect } from "vitest";
import { compareScreenDecisions } from "./shadowCompare.js";
import { encodeWireValue, decodeWireValue } from "./jobsPolicy.js";

const INLINE = {
  riskScore: 40,
  riskVerdict: "REVIEW",
  riskReasons: ["Unknown recipient (first time seen) — policy: review"],
};
const SHADOW = {
  riskScore: 40,
  verdict: "REVIEW",
  reasons: ["Unknown recipient (first time seen) — policy: review"],
  triggeredRules: [],
};

describe("shadow divergence comparator", () => {
  it("identical decisions agree with no causes", () => {
    expect(compareScreenDecisions(INLINE, SHADOW)).toEqual({ agree: true, causes: [] });
  });

  it("a verdict difference is flagged with both sides named", () => {
    const c = compareScreenDecisions(INLINE, { ...SHADOW, verdict: "APPROVE" });
    expect(c.agree).toBe(false);
    expect(c.causes).toContain("verdict: inline=REVIEW shadow=APPROVE");
  });

  it("a score difference is flagged even when the verdict matches", () => {
    const c = compareScreenDecisions(INLINE, { ...SHADOW, riskScore: 45 });
    expect(c.agree).toBe(false);
    expect(c.causes).toContain("score: inline=40 shadow=45");
  });

  it("reason drift is flagged with position and both texts", () => {
    const c = compareScreenDecisions(INLINE, { ...SHADOW, reasons: ["Recipient is trusted"] });
    expect(c.agree).toBe(false);
    expect(c.causes[0]).toContain("reasons[0]");
    expect(c.causes[0]).toContain("Unknown recipient");
    expect(c.causes[0]).toContain("Recipient is trusted");
  });

  it("a missing inline decision (never screened) diverges on every axis", () => {
    const c = compareScreenDecisions(
      { riskScore: null, riskVerdict: null, riskReasons: null },
      SHADOW
    );
    expect(c.agree).toBe(false);
    expect(c.causes.length).toBeGreaterThanOrEqual(2);
  });
});

describe("wire codec (bigints across the job payload)", () => {
  it("round-trips bigints nested in decoded calldata shapes", () => {
    const decoded = {
      kind: "swap",
      router: "0xr",
      routerName: null,
      sellTokenAddress: "0xs",
      sellAmountWei: 123456789012345678901234567890n,
      approval: { tokenAddress: "0xt", spender: "0xp", amountWei: 2n ** 255n, infinite: true },
    };
    const wire = encodeWireValue(decoded);
    expect(JSON.parse(JSON.stringify(wire))).toEqual(wire); // JSON-safe
    expect(decodeWireValue(wire)).toEqual(decoded);
  });

  it("leaves plain values, nulls and arrays untouched", () => {
    const value = { a: [1, "x", null], b: { c: false }, d: null };
    expect(decodeWireValue(encodeWireValue(value))).toEqual(value);
  });

  it("does not mistake user data shaped like the marker with extra keys", () => {
    const value = { $bigint: "not-alone", other: 1 };
    expect(decodeWireValue(encodeWireValue(value))).toEqual(value);
  });
});

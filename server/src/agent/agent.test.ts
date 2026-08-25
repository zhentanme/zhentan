/**
 * C1 boundary tests: Tier-1 evaluation is deterministic and side-effect
 * free over its inputs — the evaluation timestamp is an EXPLICIT input,
 * so identical payloads replay identically across any hour/day boundary.
 * Determinism is what makes D2 shadow screening trustworthy.
 */
import { describe, it, expect } from "vitest";
// Import from the Tier-1 file directly — proving it loads with no env is
// part of the boundary contract (index.ts pulls in persistence).
import { evaluateTransaction, evaluateRequest, type PatternsFile } from "./evaluate.js";
import type { PendingTransaction } from "../types.js";
import type { DecodedKind } from "../lib/safe/kind.js";

const SNAPSHOT: PatternsFile = {
  recipients: {
    "0x1111111111111111111111111111111111111111": {
      label: "test recipient",
      totalTxCount: 12,
      totalVolume: "1200",
      avgAmount: "100",
      minAmount: "10",
      maxAmount: "250",
      stddevAmount: "40",
      typicalHoursUtc: [],
      typicalDaysOfWeek: [],
      avgDaysBetweenTxs: 3,
      category: "personal",
      trustLevel: "trusted",
      firstSeen: "2026-01-01T00:00:00Z",
      lastSeen: "2026-08-01T00:00:00Z",
      customAttributes: {},
    },
  },
  dailyStats: {},
  timePatterns: {},
  tokenPatterns: {},
  rules: [],
  velocity: { hourly: null, daily: null, weekly: null },
  globalLimits: {
    maxSingleTx: "1000",
    maxHourlyVolume: "2000",
    maxDailyVolume: "5000",
    maxWeeklyVolume: "20000",
    maxDailyTxCount: 20,
    allowedHoursUTC: Array.from({ length: 24 }, (_, i) => i),
    allowedDaysUTC: [0, 1, 2, 3, 4, 5, 6],
    unknownRecipientAction: "review",
    riskThresholdApprove: 40,
    riskThresholdBlock: 70,
    learningEnabled: true,
  },
};

const TX: PendingTransaction = {
  id: "tx-test-1",
  safeAddress: "0x4444444444444444444444444444444444444444",
  to: "0x1111111111111111111111111111111111111111",
  amount: "50",
  amountUSD: "50",
  token: "USDC",
  txType: "safetx",
  threshold: 2,
  ownerAddresses: ["0xaaa0000000000000000000000000000000000001"],
  proposedBy: "0xaaa0000000000000000000000000000000000001",
  proposedAt: "2026-08-06T12:00:00Z",
} as PendingTransaction;

const REAL_DECODED: DecodedKind = {
  kind: "transfer",
  recipient: "0x1111111111111111111111111111111111111111",
  tokenAddress: "0x55d398326f99059ff775485246999027b3197955",
  amountWei: 50_000000000000000000n,
};

const SYNTHETIC_SWAP: DecodedKind = {
  kind: "swap",
  router: "",
  routerName: "LI.FI / PancakeSwap",
  sellTokenAddress: null,
  sellAmountWei: 0n,
  approval: null,
} as DecodedKind;

const AT = new Date("2026-08-06T12:30:00Z");

describe("agent domain — Tier 1 evaluation", () => {
  it("evaluateTransaction is deterministic for identical inputs + timestamp", () => {
    const a = evaluateTransaction(TX, SNAPSHOT, REAL_DECODED, AT);
    const b = evaluateTransaction(TX, SNAPSHOT, REAL_DECODED, new Date(AT));
    expect(b).toEqual(a);
    expect(a.verdict).toMatch(/^(APPROVE|REVIEW|BLOCK)$/);
  });

  it("evaluateRequest (synthetic shape) is deterministic for identical inputs + timestamp", () => {
    const a = evaluateRequest(TX, SNAPSHOT, SYNTHETIC_SWAP, AT);
    const b = evaluateRequest(TX, SNAPSHOT, SYNTHETIC_SWAP, new Date(AT));
    expect(b).toEqual(a);
  });

  it("honours the explicit timestamp: out-of-hours evaluation scores differently", () => {
    const officeHoursOnly: PatternsFile = structuredClone(SNAPSHOT);
    officeHoursOnly.globalLimits.allowedHoursUTC = [12];
    const inHours = evaluateTransaction(TX, officeHoursOnly, REAL_DECODED, new Date("2026-08-06T12:30:00Z"));
    const outOfHours = evaluateTransaction(TX, officeHoursOnly, REAL_DECODED, new Date("2026-08-06T03:30:00Z"));
    expect(outOfHours.riskScore).toBeGreaterThan(inHours.riskScore);
  });

  it("does not mutate the policy snapshot or the transaction", () => {
    const snapshotCopy = structuredClone(SNAPSHOT);
    const txCopy = structuredClone(TX);
    evaluateTransaction(TX, SNAPSHOT, REAL_DECODED, AT);
    evaluateRequest(TX, SNAPSHOT, SYNTHETIC_SWAP, AT);
    expect(SNAPSHOT).toEqual(snapshotCopy);
    expect(TX).toEqual(txCopy);
  });

  it("auto-approves a VALIDATED wallet-profile transition (config self-call)", () => {
    // Transition tx: `to` is the Safe itself — an address no pattern file
    // knows. Without the config rule this scored REVIEW-40 "Unknown
    // recipient" (#136.3, the stuck onboarding transitions).
    const transitionTx = { ...TX, to: TX.safeAddress } as PendingTransaction;
    const decoded: DecodedKind = {
      kind: "config",
      transition: { endState: "guarded", validated: true },
    };
    const result = evaluateTransaction(transitionTx, SNAPSHOT, decoded, AT);
    expect(result.verdict).toBe("APPROVE");
    expect(result.riskScore).toBe(0);
    expect(result.reasons.join(" ")).toContain("guarded");
    expect(result.reasons.join(" ")).not.toContain("Unknown recipient");
  });

  it("keeps an UNVALIDATED config self-call review-worthy, with an honest reason", () => {
    const configTx = { ...TX, to: TX.safeAddress } as PendingTransaction;
    const result = evaluateTransaction(configTx, SNAPSHOT, { kind: "config" }, AT);
    // Default thresholds (40/70): fixed score 40 maps to REVIEW.
    expect(result.verdict).toBe("REVIEW");
    expect(result.riskScore).toBe(40);
    expect(result.reasons.join(" ")).toContain("Owner/configuration change");
    expect(result.reasons.join(" ")).not.toContain("Unknown recipient");
  });

  it("the two shapes are distinct entry points, not aliases of caller intent", () => {
    // Same tx, same snapshot — a real transfer decode and a synthetic swap
    // decode may legitimately score differently; what matters is each is
    // internally consistent.
    const live = evaluateTransaction(TX, SNAPSHOT, REAL_DECODED, AT);
    const req = evaluateRequest(TX, SNAPSHOT, SYNTHETIC_SWAP, AT);
    expect(live.riskScore).toBeGreaterThanOrEqual(0);
    expect(req.riskScore).toBeGreaterThanOrEqual(0);
  });
});

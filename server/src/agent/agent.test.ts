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

  it("a disabled day scores even when the hour is ALSO outside the window", () => {
    // The day check used to be the tail of an else-if chain behind the hour
    // check — a disabled Wednesday was silently swallowed whenever the hour
    // violated too: no reason, no score.
    const snapshot: PatternsFile = structuredClone(SNAPSHOT);
    snapshot.globalLimits.allowedHoursUTC = [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];
    snapshot.globalLimits.allowedDaysUTC = [1, 2, 4, 5]; // Wednesday (3) disabled

    // 2026-08-05 is a Wednesday. In-hours: only the day signal.
    const inHours = evaluateTransaction(TX, snapshot, REAL_DECODED, new Date("2026-08-05T12:30:00Z"));
    expect(inHours.reasons.join("\n")).toContain("today is Wed, allowed days are Mon–Tue, Thu–Fri");

    // Out-of-hours on the same Wednesday: BOTH signals, additive score.
    const outOfHours = evaluateTransaction(TX, snapshot, REAL_DECODED, new Date("2026-08-05T22:30:00Z"));
    const text = outOfHours.reasons.join("\n");
    expect(text).toContain("Outside your active hours");
    expect(text).toContain("today is Wed");
    expect(outOfHours.riskScore).toBe(inHours.riskScore + 20);
  });

  it("reasons speak in windows and formatted amounts, not raw lists (#144 UI)", () => {
    const snapshot: PatternsFile = structuredClone(SNAPSHOT);
    // Unsorted learned hours collapse into sorted contiguous windows.
    snapshot.recipients["0x1111111111111111111111111111111111111111"].typicalHoursUtc =
      [11, 7, 6, 8, 14, 13, 15, 16, 17, 4, 3, 5, 18, 9, 12, 19];
    snapshot.globalLimits.allowedHoursUTC = [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];
    // Weekly window already spent before this tx adds anything.
    snapshot.velocity.weekly = { txCount: 3, totalVolume: "100252.61" };
    snapshot.globalLimits.maxWeeklyVolume = "100000";

    const result = evaluateTransaction(TX, snapshot, REAL_DECODED, new Date("2026-08-06T22:30:00Z"));
    const text = result.reasons.join("\n");
    // The screenshot's unsorted list omits hour 10 — two windows, not one.
    expect(text).toContain("payments usually go out 3:00–9:00, 11:00–19:00 UTC, not at 22:00");
    expect(text).toContain("allowed window is 6:00–20:00 UTC");
    expect(text).toContain("This week's volume is already over the limit — $100,252.61 sent against $100,000");
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

// ─────────────────────────────────────────────────────────────
// #144 verdict floors — outcomes user-writable policy can NEVER
// relax. Thresholds and rule deltas are attacker-reachable through
// the settings plane; these tests pin the invariants that survive
// any policy the settings plane can produce.
// ─────────────────────────────────────────────────────────────

describe("verdict floors (#144)", () => {
  const BLOCKED_RECIPIENT = "0x2222222222222222222222222222222222222222";

  function snapshotWithBlockedRecipient(): PatternsFile {
    const snapshot = structuredClone(SNAPSHOT);
    snapshot.recipients[BLOCKED_RECIPIENT] = {
      ...snapshot.recipients["0x1111111111111111111111111111111111111111"],
      label: "blocked recipient",
      trustLevel: "blocked",
    };
    return snapshot;
  }

  const txToBlocked = { ...TX, to: BLOCKED_RECIPIENT } as PendingTransaction;
  const decodedToBlocked: DecodedKind = {
    kind: "transfer",
    recipient: BLOCKED_RECIPIENT,
    tokenAddress: "0x55d398326f99059ff775485246999027b3197955",
    amountWei: 50_000000000000000000n,
  };

  it("blocked recipient BLOCKs even at thresholds 100/100", () => {
    const snapshot = snapshotWithBlockedRecipient();
    snapshot.globalLimits.riskThresholdApprove = 100;
    snapshot.globalLimits.riskThresholdBlock = 100;
    const result = evaluateTransaction(txToBlocked, snapshot, decodedToBlocked, AT);
    expect(result.verdict).toBe("BLOCK");
  });

  it("blocked recipient BLOCKs even when a whitelist rule drags the score to 0", () => {
    // The laundering vector: a recipient_whitelist rule with a −100 delta
    // cancels the +100 blocked-trust penalty in score arithmetic. The floor
    // acts on the VERDICT, after all arithmetic, so it survives.
    const snapshot = snapshotWithBlockedRecipient();
    snapshot.rules = [
      {
        id: "rule-whitelist-launder",
        name: "whitelist the blocked address",
        ruleType: "recipient_whitelist",
        conditions: { address: BLOCKED_RECIPIENT },
        action: "approve",
        riskScoreDelta: -100,
        priority: 1,
      },
    ];
    const result = evaluateTransaction(txToBlocked, snapshot, decodedToBlocked, AT);
    expect(result.riskScore).toBe(0); // arithmetic was laundered…
    expect(result.verdict).toBe("BLOCK"); // …the verdict was not
  });

  it("unvalidated config self-call never APPROVEs, at any threshold pair", () => {
    const configTx = { ...TX, to: TX.safeAddress } as PendingTransaction;
    for (const [approve, block] of [[100, 100], [41, 70], [100, 41]] as const) {
      const snapshot = structuredClone(SNAPSHOT);
      snapshot.globalLimits.riskThresholdApprove = approve;
      snapshot.globalLimits.riskThresholdBlock = block;
      const result = evaluateTransaction(configTx, snapshot, { kind: "config" }, AT);
      expect(result.verdict).not.toBe("APPROVE");
    }
  });

  it("VALIDATED transitions still auto-approve — the floor is for unvalidated config only", () => {
    const transitionTx = { ...TX, to: TX.safeAddress } as PendingTransaction;
    const decoded: DecodedKind = {
      kind: "config",
      transition: { endState: "protected", validated: true },
    };
    const result = evaluateTransaction(transitionTx, SNAPSHOT, decoded, AT);
    expect(result.verdict).toBe("APPROVE");
  });
});

// ─────────────────────────────────────────────────────────────
// Unknown USD value (#144 follow-up) — token units must never be
// screened as dollars, and an unpriced transfer never auto-approves.
// ─────────────────────────────────────────────────────────────

describe("unknown USD value", () => {
  const unpricedTx = { ...TX, amount: "0.5", amountUSD: undefined } as PendingTransaction;

  it("an unpriced transfer never auto-approves — even to a TRUSTED recipient", () => {
    // The old `amountUSD ?? amount` fallback screened 0.5 BNB as "$0.50":
    // under every limit, trusted recipient −15 → APPROVE → auto-signed.
    // Now: +40 signal, dollar checks skipped, and a verdict floor that the
    // trusted −15 (or a negative rule delta) cannot launder away.
    const result = evaluateTransaction(unpricedTx, SNAPSHOT, REAL_DECODED, AT);
    expect(result.verdict).not.toBe("APPROVE");
    expect(result.reasons.join("\n")).toContain("Transfer value unknown");
  });

  it("dollar-denominated checks stay silent instead of comparing token units", () => {
    // Tight limits + spent velocity: a token-unit fallback would trip them
    // all with nonsense numbers; unknown value must trip NONE.
    const snapshot: PatternsFile = structuredClone(SNAPSHOT);
    snapshot.globalLimits.maxSingleTx = "0.1";
    snapshot.velocity.daily = { txCount: 1, totalVolume: "999999" };
    const result = evaluateTransaction(unpricedTx, snapshot, REAL_DECODED, AT);
    const text = result.reasons.join("\n");
    expect(text).not.toContain("single-transaction limit");
    expect(text).not.toContain("volume limit");
    expect(text).not.toContain("already over");
    expect(text).not.toContain("NaN");
  });

  it("a priced transaction is unaffected", () => {
    const result = evaluateTransaction(TX, SNAPSHOT, REAL_DECODED, AT);
    expect(result.reasons.join("\n")).not.toContain("Transfer value unknown");
  });
});

/**
 * #144 — shared limits validation: per-field shape rules and cross-field
 * rules on the MERGED candidate state. These are the checks that replace the
 * old blind String()/Number()/Boolean() coercions in PATCH /status.
 */
import { describe, it, expect } from "vitest";
import {
  parseLimitsPatch,
  validateMergedLimits,
  describeLimitsChanges,
  RISK_THRESHOLD_APPROVE_CAP,
} from "./limits.js";

function expectError(body: Record<string, unknown>, fragment: string) {
  const result = parseLimitsPatch(body);
  expect("error" in result, `expected an error for ${JSON.stringify(body)}`).toBe(true);
  if ("error" in result) expect(result.error).toContain(fragment);
}

describe("parseLimitsPatch — field shape", () => {
  it("accepts a full valid patch and normalizes to row columns", () => {
    const result = parseLimitsPatch({
      maxSingleTx: "2500",
      maxHourlyVolume: 5000,
      maxDailyTxCount: 10,
      allowedHoursUTC: [9, 10, 11],
      allowedDaysUTC: [1, 2, 3],
      unknownRecipientAction: "block",
      riskThresholdApprove: 30,
      riskThresholdBlock: 60,
      learningEnabled: false,
    });
    expect(result).toEqual({
      patch: {
        max_single_tx: "2500",
        max_hourly_volume: "5000",
        max_daily_tx_count: 10,
        allowed_hours_utc: [9, 10, 11],
        allowed_days_utc: [1, 2, 3],
        unknown_recipient_action: "block",
        risk_threshold_approve: 30,
        risk_threshold_block: 60,
        learning_enabled: false,
      },
    });
  });

  it("fields absent from the body are absent from the patch", () => {
    const result = parseLimitsPatch({ somethingElse: 1 });
    expect(result).toEqual({ patch: {} });
  });

  it("rejects unparseable monetary strings — the silent-dead-limit bug", () => {
    // Old behavior: String("abc") stored "abc"; every parseFloat comparison
    // went false and the limit silently stopped existing.
    expectError({ maxSingleTx: "abc" }, "maxSingleTx");
    expectError({ maxDailyVolume: NaN }, "maxDailyVolume");
    expectError({ maxWeeklyVolume: Infinity }, "maxWeeklyVolume");
    expectError({ maxSingleTx: 0 }, "maxSingleTx");
    expectError({ maxHourlyVolume: -5 }, "maxHourlyVolume");
    expectError({ maxSingleTx: { evil: true } }, "maxSingleTx");
  });

  it("rejects non-integer / out-of-range tx counts", () => {
    expectError({ maxDailyTxCount: 0 }, "maxDailyTxCount");
    expectError({ maxDailyTxCount: 2.5 }, "maxDailyTxCount");
    expectError({ maxDailyTxCount: -1 }, "maxDailyTxCount");
    expectError({ maxDailyTxCount: "many" }, "maxDailyTxCount");
  });

  it("rejects out-of-range hour/day arrays — [25] used to penalize every tx", () => {
    expectError({ allowedHoursUTC: [25] }, "allowedHoursUTC");
    expectError({ allowedHoursUTC: [1.5] }, "allowedHoursUTC");
    expectError({ allowedHoursUTC: "9-17" }, "allowedHoursUTC");
    expectError({ allowedDaysUTC: [7] }, "allowedDaysUTC");
    expect(parseLimitsPatch({ allowedHoursUTC: [] })).toEqual({
      patch: { allowed_hours_utc: [] },
    });
  });

  it("rejects string booleans — Boolean('false') === true was the old behavior", () => {
    expectError({ learningEnabled: "false" }, "learningEnabled");
    expectError({ learningEnabled: 0 }, "learningEnabled");
  });

  it("caps riskThresholdApprove at the floor-preserving ceiling", () => {
    expectError({ riskThresholdApprove: RISK_THRESHOLD_APPROVE_CAP + 1 }, "riskThresholdApprove");
    const atCap = parseLimitsPatch({ riskThresholdApprove: RISK_THRESHOLD_APPROVE_CAP });
    expect(atCap).toEqual({ patch: { risk_threshold_approve: RISK_THRESHOLD_APPROVE_CAP } });
  });

  it("rejects invalid unknownRecipientAction", () => {
    expectError({ unknownRecipientAction: "allow" }, "unknownRecipientAction");
  });
});

describe("validateMergedLimits — cross-field on the merged state", () => {
  const stored = { risk_threshold_approve: 40, risk_threshold_block: 70 };

  it("accepts a patch that is consistent with the stored row", () => {
    expect(validateMergedLimits(stored, { risk_threshold_block: 50 })).toBeNull();
    expect(validateMergedLimits(stored, {})).toBeNull();
  });

  it("rejects patching ONLY the block threshold below the stored approve", () => {
    // The partial-update trap: the patch alone looks fine; the merged state
    // (approve=40, block=30) silently disables the block band.
    const error = validateMergedLimits(stored, { risk_threshold_block: 30 });
    expect(error).toContain("riskThresholdApprove");
  });

  it("rejects a misordered pair inside one patch", () => {
    const error = validateMergedLimits(stored, {
      risk_threshold_approve: 40,
      risk_threshold_block: 39,
    });
    expect(error).not.toBeNull();
  });

  it("approve equal to block is allowed (empty REVIEW band is a valid choice)", () => {
    expect(
      validateMergedLimits(stored, { risk_threshold_approve: 40, risk_threshold_block: 40 })
    ).toBeNull();
  });
});

describe("describeLimitsChanges — the Telegram confirmation diff", () => {
  const current = {
    max_single_tx: "5000",
    max_hourly_volume: "10000",
    max_daily_volume: "20000",
    max_weekly_volume: "100000",
    max_daily_tx_count: 50,
    allowed_hours_utc: [9, 10],
    allowed_days_utc: [1, 2],
    unknown_recipient_action: "review" as const,
    risk_threshold_approve: 40,
    risk_threshold_block: 70,
    learning_enabled: true,
  };

  it("renders one old → new line per changed field, skipping no-ops", () => {
    const lines = describeLimitsChanges(current, {
      max_single_tx: "2500",
      max_daily_volume: "20000", // unchanged — must be skipped
      learning_enabled: false,
    });
    expect(lines).toEqual([
      "Single-tx limit: $5000 → $2500",
      "Learning: on → off",
    ]);
  });

  it("formats arrays and empty-array 'any'", () => {
    const lines = describeLimitsChanges(current, { allowed_hours_utc: [] });
    expect(lines).toEqual(["Allowed hours (UTC): 9, 10 → any"]);
  });

  it("returns [] for an all-no-op patch — creation rejects those", () => {
    expect(describeLimitsChanges(current, { risk_threshold_block: 70 })).toEqual([]);
  });
});

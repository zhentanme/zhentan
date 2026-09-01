/**
 * Shared validation for global-limits writes (#144). Every path that mutates
 * `global_limits` — the agent PATCH /status today, proposal creation and
 * proposal apply in Phase 1 — runs the same two steps:
 *
 *   1. `parseLimitsPatch` — per-field shape validation of the request body,
 *      producing a row-shaped patch. Rejects what the old blind
 *      String()/Number()/Boolean() coercions let through: unparseable
 *      monetary strings (which made every parseFloat comparison false and
 *      silently KILLED the limit), NaN/float/negative counts, and
 *      Boolean("false") === true.
 *   2. `validateMergedLimits` — cross-field rules on the COMPLETE candidate
 *      state (stored row + patch merged). Updates are partial, so checking
 *      only the fields present would let a patch of one threshold conflict
 *      with the stored other.
 */
import type { GlobalLimitsRow } from "../supabase/types.js";

export type LimitsPatch = Partial<Omit<GlobalLimitsRow, "safe_address" | "updated_at">>;

/**
 * Ceiling on the auto-approve threshold. The cap defines what can NEVER
 * auto-approve, no matter how the user (or an attacker holding the session)
 * tunes policy: at 40, unlimited approvals (+40), unvalidated config (40),
 * an unknown recipient under `review` policy (+40) and an unrecognized
 * router (+50) are all guaranteed to land in at least REVIEW.
 */
export const RISK_THRESHOLD_APPROVE_CAP = 40;

/** Monetary limit: number or numeric string, finite, strictly positive. */
function parseMoney(value: unknown, field: string): { value: string } | { error: string } {
  if (typeof value !== "number" && typeof value !== "string") {
    return { error: `${field} must be a positive number` };
  }
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) {
    return { error: `${field} must be a positive number` };
  }
  return { value: String(n) };
}

function parseIntInRange(
  value: unknown,
  field: string,
  min: number,
  max: number
): { value: number } | { error: string } {
  const n = typeof value === "number" || typeof value === "string" ? Number(value) : NaN;
  if (!Number.isInteger(n) || n < min || n > max) {
    return { error: `${field} must be an integer between ${min} and ${max}` };
  }
  return { value: n };
}

function parseIntArray(
  value: unknown,
  field: string,
  min: number,
  max: number
): { value: number[] } | { error: string } {
  if (
    !Array.isArray(value) ||
    !value.every((v) => Number.isInteger(v) && v >= min && v <= max)
  ) {
    return { error: `${field} must be an array of integers between ${min} and ${max}` };
  }
  return { value: value as number[] };
}

const UNKNOWN_RECIPIENT_ACTIONS = ["approve", "review", "block"] as const;

/** Every limits field the API accepts — the routes gate on presence of these. */
export const LIMITS_API_FIELDS = [
  "maxSingleTx",
  "maxHourlyVolume",
  "maxDailyVolume",
  "maxWeeklyVolume",
  "maxDailyTxCount",
  "allowedHoursUTC",
  "allowedDaysUTC",
  "unknownRecipientAction",
  "riskThresholdApprove",
  "riskThresholdBlock",
  "learningEnabled",
] as const;

/**
 * Parses the camelCase API body into a row-shaped patch. Fields absent from
 * the body are absent from the patch. Returns the first validation error.
 */
export function parseLimitsPatch(
  body: Record<string, unknown>
): { patch: LimitsPatch } | { error: string } {
  const patch: LimitsPatch = {};

  const money: Array<[string, keyof LimitsPatch]> = [
    ["maxSingleTx", "max_single_tx"],
    ["maxHourlyVolume", "max_hourly_volume"],
    ["maxDailyVolume", "max_daily_volume"],
    ["maxWeeklyVolume", "max_weekly_volume"],
  ];
  for (const [apiField, column] of money) {
    if (body[apiField] === undefined) continue;
    const parsed = parseMoney(body[apiField], apiField);
    if ("error" in parsed) return parsed;
    (patch as Record<string, unknown>)[column] = parsed.value;
  }

  if (body.maxDailyTxCount !== undefined) {
    const parsed = parseIntInRange(body.maxDailyTxCount, "maxDailyTxCount", 1, 100000);
    if ("error" in parsed) return parsed;
    patch.max_daily_tx_count = parsed.value;
  }

  if (body.allowedHoursUTC !== undefined) {
    const parsed = parseIntArray(body.allowedHoursUTC, "allowedHoursUTC", 0, 23);
    if ("error" in parsed) return parsed;
    patch.allowed_hours_utc = parsed.value;
  }
  if (body.allowedDaysUTC !== undefined) {
    const parsed = parseIntArray(body.allowedDaysUTC, "allowedDaysUTC", 0, 6);
    if ("error" in parsed) return parsed;
    patch.allowed_days_utc = parsed.value;
  }

  if (body.unknownRecipientAction !== undefined) {
    const action = body.unknownRecipientAction;
    if (!UNKNOWN_RECIPIENT_ACTIONS.includes(action as never)) {
      return { error: "unknownRecipientAction must be 'approve', 'review', or 'block'" };
    }
    patch.unknown_recipient_action = action as (typeof UNKNOWN_RECIPIENT_ACTIONS)[number];
  }

  if (body.riskThresholdApprove !== undefined) {
    const parsed = parseIntInRange(body.riskThresholdApprove, "riskThresholdApprove", 0, 100);
    if ("error" in parsed) return parsed;
    if (parsed.value > RISK_THRESHOLD_APPROVE_CAP) {
      return {
        error: `riskThresholdApprove must be at most ${RISK_THRESHOLD_APPROVE_CAP} — higher values would let flagged transactions auto-approve`,
      };
    }
    patch.risk_threshold_approve = parsed.value;
  }
  if (body.riskThresholdBlock !== undefined) {
    const parsed = parseIntInRange(body.riskThresholdBlock, "riskThresholdBlock", 0, 100);
    if ("error" in parsed) return parsed;
    patch.risk_threshold_block = parsed.value;
  }

  if (body.learningEnabled !== undefined) {
    if (typeof body.learningEnabled !== "boolean") {
      return { error: "learningEnabled must be a boolean" };
    }
    patch.learning_enabled = body.learningEnabled;
  }

  return { patch };
}

/**
 * Cross-field rules on the merged candidate state. `current` is the stored
 * row (or defaults for a Safe with no row); the patch wins field-by-field.
 * Returns an error message, or null when the merged state is valid.
 */
export function validateMergedLimits(
  current: Pick<GlobalLimitsRow, "risk_threshold_approve" | "risk_threshold_block">,
  patch: LimitsPatch
): string | null {
  const approve = patch.risk_threshold_approve ?? current.risk_threshold_approve;
  const block = patch.risk_threshold_block ?? current.risk_threshold_block;
  if (approve > block) {
    return `riskThresholdApprove (${approve}) must not exceed riskThresholdBlock (${block}) — the verdict checks the approve threshold first, so a misordered pair silently disables blocking`;
  }
  return null;
}

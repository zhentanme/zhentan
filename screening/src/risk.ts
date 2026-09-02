import type { PendingTransaction } from "./types.js";
import type { DecodedKind } from "./decoded.js";

// ─────────────────────────────────────────────────────────────
// PatternsFile — assembled by getPatternsForSafe() in db.ts
// and passed directly into analyzeRisk().
// ─────────────────────────────────────────────────────────────

export interface RecipientProfile {
  label: string | null;
  totalTxCount: number;
  totalVolume: string;
  avgAmount: string;
  minAmount: string;
  maxAmount: string;
  stddevAmount: string;
  typicalHoursUtc: number[];
  typicalDaysOfWeek: number[];
  avgDaysBetweenTxs: number | null;
  category: string;
  trustLevel: "trusted" | "neutral" | "suspicious" | "blocked";
  firstSeen: string | null;
  lastSeen: string | null;
  customAttributes: Record<string, unknown>;
}

export interface DailyStatEntry {
  txCount: number;
  approvedCount: number;
  reviewedCount: number;
  rejectedCount: number;
  totalVolume: string;
  approvedVolume: string;
}

export interface TimePatternEntry {
  hourUtc: number;
  dayOfWeek: number;
  txCount: number;
  totalVolume: string;
  isAllowed: boolean | null; // null = learned default
}

export interface TokenPatternEntry {
  symbol: string | null;
  totalTxCount: number;
  totalVolume: string;
  avgAmount: string;
  maxAmount: string;
  isFamiliar: boolean;
  firstSeen: string | null;
  lastUsed: string | null;
}

export interface UserRule {
  id: string;
  name: string;
  ruleType:
    | "amount_limit"
    | "recipient_block"
    | "recipient_whitelist"
    | "time_restriction"
    | "velocity_limit"
    | "token_restriction"
    | "custom";
  conditions: Record<string, unknown>;
  action: "approve" | "review" | "block";
  riskScoreDelta: number;
  priority: number;
}

export interface VelocitySnapshot {
  txCount: number;
  totalVolume: string;
}

export interface GlobalLimits {
  maxSingleTx: string;
  maxHourlyVolume: string;
  maxDailyVolume: string;
  maxWeeklyVolume: string;
  maxDailyTxCount: number;
  allowedHoursUTC: number[];
  allowedDaysUTC: number[];
  unknownRecipientAction: "approve" | "review" | "block";
  riskThresholdApprove: number;
  riskThresholdBlock: number;
  learningEnabled: boolean;
}

export interface PatternsFile {
  // Per-recipient learned profile keyed by lowercase address
  recipients: Record<string, RecipientProfile>;

  // Daily aggregates (last 30 days) keyed by "YYYY-MM-DD"
  dailyStats: Record<string, DailyStatEntry>;

  // 24×7 time grid keyed by "hour:dayOfWeek"
  timePatterns: Record<string, TimePatternEntry>;

  // Per-token stats keyed by lowercase token address
  tokenPatterns: Record<string, TokenPatternEntry>;

  // Active custom rules, pre-sorted by priority
  rules: UserRule[];

  // Current rolling window totals
  velocity: {
    hourly: VelocitySnapshot | null;
    daily: VelocitySnapshot | null;
    weekly: VelocitySnapshot | null;
  };

  // Per-user configurable limits and thresholds
  globalLimits: GlobalLimits;
}

export interface RiskResult {
  riskScore: number;
  verdict: "APPROVE" | "REVIEW" | "BLOCK";
  reasons: string[];
  /** IDs of user_rules that fired */
  triggeredRules: string[];
}

// ─────────────────────────────────────────────────────────────
// Reason formatting — reasons surface verbatim in the app and in
// Telegram, so they speak the UI's language: hour/day WINDOWS
// ("6:00–20:00 UTC", "Mon–Fri") instead of raw unsorted lists, and
// thousands-separated amounts. Hand-rolled (no toLocaleString) so
// identical inputs replay to byte-identical reasons on any runtime.
// ─────────────────────────────────────────────────────────────

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** "$100,252.61" / "$100,000" — trailing ".00" dropped. */
function fmtUsd(n: number): string {
  const [int, frac] = Math.abs(n).toFixed(2).split(".");
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${n < 0 ? "-" : ""}$${grouped}${frac === "00" ? "" : `.${frac}`}`;
}

/** Collapse sorted-deduped values into contiguous runs: [[6,20],[23,23]]. */
function runsOf(values: number[]): Array<[number, number]> {
  const sorted = [...new Set(values)].sort((a, b) => a - b);
  const runs: Array<[number, number]> = [];
  for (const v of sorted) {
    const last = runs[runs.length - 1];
    if (last && v === last[1] + 1) last[1] = v;
    else runs.push([v, v]);
  }
  return runs;
}

/** [11,7,6,8,…] → "3:00–9:00, 11:00–19:00". */
function fmtHourWindows(hours: number[]): string {
  return runsOf(hours)
    .map(([a, b]) => (a === b ? `${a}:00` : `${a}:00–${b}:00`))
    .join(", ");
}

/** [1,2,3,4,5] → "Mon–Fri"; [0,6] → "Sun, Sat". */
function fmtDayWindows(days: number[]): string {
  return runsOf(days)
    .map(([a, b]) => (a === b ? DAY_NAMES[a] : `${DAY_NAMES[a]}–${DAY_NAMES[b]}`))
    .join(", ");
}

// ─────────────────────────────────────────────────────────────
// analyzeRisk — stateless, pure function
// Evaluates all pattern dimensions and returns a scored verdict.
// ─────────────────────────────────────────────────────────────

export function analyzeRisk(
  tx: PendingTransaction,
  patterns: PatternsFile,
  decoded?: DecodedKind,
  evaluatedAt: Date = new Date()
): RiskResult {
  let riskScore = 0;
  const reasons: string[] = [];
  const triggeredRules: string[] = [];

  const amount = parseFloat(tx.amountUSD ?? tx.amount);
  const limits = patterns.globalLimits;
  const now = evaluatedAt;
  const hourUtc = now.getUTCHours();
  const dayOfWeek = now.getUTCDay(); // 0=Sun
  const today = now.toISOString().split("T")[0];

  // ── 0. Kind-specific scoring ──────────────────────────────
  // Owner/config management targets the Safe ITSELF — recipient trust,
  // amount limits, velocity and time-of-day are all meaningless for it
  // (scoring them made every profile transition a REVIEW-40 "unknown
  // recipient"). A transition the backend VALIDATED (whitelisted calls,
  // managed end state) auto-approves deterministically; any other config
  // self-call scores a fixed 40 and NEVER auto-approves — thresholds are
  // user-writable policy, and an unvalidated owner change is the one
  // transaction that permanently rewrites who controls the Safe (#144).
  if (decoded?.kind === "config") {
    if (decoded.transition?.validated) {
      return {
        riskScore: 0,
        verdict: "APPROVE",
        reasons: [
          `Wallet-profile transition (→ ${decoded.transition.endState}) — validated owner management on this Safe`,
        ],
        triggeredRules: [],
      };
    }
    const configScore = 40;
    return {
      riskScore: configScore,
      verdict: configScore < limits.riskThresholdBlock ? "REVIEW" : "BLOCK",
      reasons: ["Owner/configuration change on this Safe — not a recognized profile transition"],
      triggeredRules: [],
    };
  }

  // Swaps and standalone approvals have no payment recipient: `tx.to` is a
  // DEX router or token contract, so recipient trust/history is skipped for
  // them (it would score the router as an "unknown recipient" and pollute
  // the verdict). Amount limits, velocity and time checks below still apply.
  const isSwap = decoded?.kind === "swap";
  const isApproval = decoded?.kind === "approval";

  if (decoded?.kind === "swap") {
    if (decoded.routerName === null) {
      riskScore += 50;
      reasons.push(`Swap routed through an unrecognized router (${decoded.router})`);
    } else {
      reasons.push(`Swap via ${decoded.routerName}`);
    }
    if (decoded.approval) {
      if (decoded.approval.infinite) {
        riskScore += 30;
        reasons.push("Swap grants an UNLIMITED token approval to the router");
      } else if (decoded.approval.amountWei > decoded.sellAmountWei) {
        riskScore += 15;
        reasons.push("Swap approves more than the sell amount");
      }
    }
  }

  if (decoded?.kind === "approval") {
    if (decoded.infinite) {
      riskScore += 40;
      reasons.push(`UNLIMITED approval granted to ${decoded.spender}`);
    } else {
      riskScore += 15;
      reasons.push(`Token approval granted to ${decoded.spender}`);
    }
  }

  const recipient =
    isSwap || isApproval ? undefined : patterns.recipients[tx.to.toLowerCase()];

  // ── 1. Recipient trust level ──────────────────────────────
  if (isSwap || isApproval) {
    // No payment recipient — scored by kind above.
  } else if (!recipient) {
    // First-time recipient — apply the user's configured action
    const action = limits.unknownRecipientAction;
    if (action === "block") {
      riskScore += 70;
    } else if (action === "review") {
      riskScore += 40;
    }
    // "approve" = no extra score
    reasons.push(`Unknown recipient — first payment to this address (your policy: ${action})`);
  } else {
    if (recipient.trustLevel === "blocked") {
      riskScore += 100;
      reasons.push("Recipient is explicitly blocked");
    } else if (recipient.trustLevel === "suspicious") {
      riskScore += 30;
      reasons.push("Recipient is flagged as suspicious");
    } else if (recipient.trustLevel === "trusted") {
      riskScore = Math.max(0, riskScore - 15);
      reasons.push("Recipient is trusted");
    }

    // Amount anomaly: more than 3 standard deviations above average
    const avg = parseFloat(recipient.avgAmount || "0");
    const stddev = parseFloat(recipient.stddevAmount || "0");
    if (avg > 0 && amount > avg + stddev * 3) {
      riskScore += 25;
      reasons.push(
        `Amount ${fmtUsd(amount)} is far above the usual range for this recipient (average ${fmtUsd(avg)})`
      );
    } else if (avg > 0 && amount > avg * 3) {
      riskScore += 15;
      reasons.push(
        `Amount ${fmtUsd(amount)} is ${(amount / avg).toFixed(1)}× this recipient's average of ${fmtUsd(avg)}`
      );
    }

    // Unusual time for this recipient
    if (recipient.typicalHoursUtc.length > 0 && !recipient.typicalHoursUtc.includes(hourUtc)) {
      riskScore += 10;
      reasons.push(
        `Unusual time for this recipient — payments usually go out ${fmtHourWindows(recipient.typicalHoursUtc)} UTC, not at ${hourUtc}:00`
      );
    }
  }

  // ── 2. Time-of-day / day-of-week ─────────────────────────
  const timeKey = `${hourUtc}:${dayOfWeek}`;
  const timeSlot = patterns.timePatterns[timeKey];

  // Time-of-day: an explicitly blocked slot overrides the generic hour check.
  if (timeSlot?.isAllowed === false) {
    riskScore += 30;
    reasons.push(`${DAY_NAMES[dayOfWeek]} ${hourUtc}:00 UTC is a blocked time slot in your schedule`);
  } else if (limits.allowedHoursUTC.length > 0 && !limits.allowedHoursUTC.includes(hourUtc)) {
    riskScore += 20;
    reasons.push(
      `Outside your active hours — it's ${hourUtc}:00 UTC, allowed window is ${fmtHourWindows(limits.allowedHoursUTC)} UTC`
    );
  }

  // Day-of-week: INDEPENDENT of the hour check. This used to be the tail of
  // the else-if chain, so a disabled day was silently swallowed whenever the
  // hour was also outside the window — no reason, no score.
  if (limits.allowedDaysUTC.length > 0 && !limits.allowedDaysUTC.includes(dayOfWeek)) {
    riskScore += 20;
    reasons.push(
      `Outside your active days — today is ${DAY_NAMES[dayOfWeek]}, allowed days are ${fmtDayWindows(limits.allowedDaysUTC)}`
    );
  }

  // ── 3. Single-tx amount limit ─────────────────────────────
  const maxSingleTx = parseFloat(limits.maxSingleTx);
  if (amount > maxSingleTx) {
    riskScore += 30;
    reasons.push(
      `Amount ${fmtUsd(amount)} is over your ${fmtUsd(maxSingleTx)} single-transaction limit`
    );
  }

  // Velocity limits: "already over" reads honestly when the window is spent
  // before this transaction adds anything (the +$0.00 case).
  const velocityReason = (window: string, used: number, limit: number): string =>
    used >= limit
      ? `${window} volume is already over the limit — ${fmtUsd(used)} sent against ${fmtUsd(limit)}`
      : `Would exceed the ${window.toLowerCase()} volume limit — ${fmtUsd(used)} already sent, this adds ${fmtUsd(amount)} (limit ${fmtUsd(limit)})`;

  // ── 4. Velocity: daily volume ─────────────────────────────
  const dailyVolumeUsed = parseFloat(patterns.velocity.daily?.totalVolume ?? "0");
  const maxDailyVolume = parseFloat(limits.maxDailyVolume);
  if (dailyVolumeUsed + amount > maxDailyVolume) {
    riskScore += 20;
    reasons.push(velocityReason("Today's", dailyVolumeUsed, maxDailyVolume));
  }

  // ── 5. Velocity: hourly volume ────────────────────────────
  const hourlyVolumeUsed = parseFloat(patterns.velocity.hourly?.totalVolume ?? "0");
  const maxHourlyVolume = parseFloat(limits.maxHourlyVolume);
  if (hourlyVolumeUsed + amount > maxHourlyVolume) {
    riskScore += 15;
    reasons.push(velocityReason("This hour's", hourlyVolumeUsed, maxHourlyVolume));
  }

  // ── 6. Velocity: weekly volume ────────────────────────────
  const weeklyVolumeUsed = parseFloat(patterns.velocity.weekly?.totalVolume ?? "0");
  const maxWeeklyVolume = parseFloat(limits.maxWeeklyVolume);
  if (weeklyVolumeUsed + amount > maxWeeklyVolume) {
    riskScore += 10;
    reasons.push(velocityReason("This week's", weeklyVolumeUsed, maxWeeklyVolume));
  }

  // ── 7. Daily tx count limit ───────────────────────────────
  const dailyTxCount = patterns.velocity.daily?.txCount ?? 0;
  if (dailyTxCount >= limits.maxDailyTxCount) {
    riskScore += 15;
    reasons.push(
      `Daily transaction limit reached — ${dailyTxCount} of ${limits.maxDailyTxCount} today`
    );
  }

  // ── 8. Token familiarity ──────────────────────────────────
  const tokenKey = (tx.tokenAddress ?? "").toLowerCase();
  if (tokenKey) {
    const tokenPattern = patterns.tokenPatterns[tokenKey];
    if (!tokenPattern || !tokenPattern.isFamiliar) {
      riskScore += 10;
      reasons.push(`Token ${tx.token || tokenKey} has not been used before`);
    }
  }

  // ── 9. Daily rejection rate ───────────────────────────────
  const todayStats = patterns.dailyStats[today];
  if (todayStats && todayStats.txCount > 0) {
    const rejectionRate = todayStats.rejectedCount / todayStats.txCount;
    if (rejectionRate > 0.5 && todayStats.txCount >= 3) {
      riskScore += 10;
      reasons.push(
        `High rejection rate today (${todayStats.rejectedCount}/${todayStats.txCount} transactions rejected)`
      );
    }
  }

  // ── 10. Custom user rules ─────────────────────────────────
  for (const rule of patterns.rules) {
    const fired = evaluateRule(rule, tx, { amount, hourUtc, dayOfWeek });
    if (fired) {
      riskScore += rule.riskScoreDelta;
      triggeredRules.push(rule.id);
      reasons.push(`Rule "${rule.name}" triggered`);
    }
  }

  riskScore = Math.max(0, Math.min(riskScore, 100));

  if (reasons.length === 0) {
    reasons.push("Known recipient, normal amount, within allowed hours — no anomalies detected");
  }

  let verdict: RiskResult["verdict"] =
    riskScore < limits.riskThresholdApprove
      ? "APPROVE"
      : riskScore < limits.riskThresholdBlock
      ? "REVIEW"
      : "BLOCK";

  // ── Floors — verdicts user-writable policy can never relax (#144) ──
  // Applied AFTER all score arithmetic: thresholds and negative rule deltas
  // (recipient_whitelist) are attacker-reachable through the settings plane,
  // so an explicitly blocked recipient must block on the verdict, not by
  // hoping +100 survives the math.
  if (recipient?.trustLevel === "blocked") {
    verdict = "BLOCK";
  }

  return { riskScore, verdict, reasons, triggeredRules };
}

// ─────────────────────────────────────────────────────────────
// Rule evaluation
// ─────────────────────────────────────────────────────────────

function evaluateRule(
  rule: UserRule,
  tx: PendingTransaction,
  ctx: { amount: number; hourUtc: number; dayOfWeek: number }
): boolean {
  const c = rule.conditions;

  switch (rule.ruleType) {
    case "amount_limit": {
      const max = parseFloat((c.max as string) ?? "0");
      const token = (c.token as string | undefined)?.toLowerCase();
      if (token && tx.token?.toLowerCase() !== token) return false;
      return ctx.amount > max;
    }

    case "recipient_block":
      return tx.to.toLowerCase() === (c.address as string)?.toLowerCase();

    case "recipient_whitelist":
      // Whitelist rules apply a negative delta — no special boolean needed
      return tx.to.toLowerCase() === (c.address as string)?.toLowerCase();

    case "time_restriction": {
      const hours = (c.hours as number[] | undefined) ?? [];
      const days = (c.days as number[] | undefined) ?? [];
      const hourMatch = hours.length === 0 || hours.includes(ctx.hourUtc);
      const dayMatch = days.length === 0 || days.includes(ctx.dayOfWeek);
      return hourMatch && dayMatch;
    }

    case "velocity_limit":
      // Velocity checks are handled in the main body above via the limits table;
      // custom velocity rules let users set tighter limits per-rule.
      return false;

    case "token_restriction": {
      const targetToken = (c.token as string)?.toLowerCase();
      return !!(targetToken && tx.tokenAddress?.toLowerCase() === targetToken);
    }

    case "custom":
      // Custom rules are evaluated by the agent via metadata;
      // returning false here so they don't double-score.
      return false;

    default:
      return false;
  }
}

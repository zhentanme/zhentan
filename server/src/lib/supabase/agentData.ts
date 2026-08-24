/**
 * AGENT-DOMAIN data access (C2): screening settings, limits, rules, learned
 * patterns, velocity, daily stats, behavioral events, and outcome learning.
 *
 * Deliberately NOT re-exported from lib/supabase/index.ts — the ONLY
 * sanctioned consumer is server/src/agent/ (enforced by lint:layering).
 * At E3 these tables move behind policy snapshots / evidence push; this
 * file is the seam they move along.
 */
import { supabase } from "./client.js";
import { decodeTxKind } from "../safe/kind.js";
import type {
  UserSettingsRow,
  GlobalLimitsRow,
  RecipientProfileRow,
  TimePatternRow,
  VelocityWindowRow,
  TokenPatternRow,
  UserRuleRow,
  DailyStatsRow,
  BehavioralEventRow,
} from "./types.js";
import type { PendingTransaction } from "../../types.js";
import type { PatternsFile } from "zhentan-screening/risk";

const DEFAULT_USER_SETTINGS: Omit<UserSettingsRow, "safe_address" | "updated_at"> = {
  screening_mode: false,
  last_check: null,
  decisions: [],
};

const DEFAULT_LIMITS: Omit<GlobalLimitsRow, "safe_address" | "updated_at"> = {
  max_single_tx: "5000",
  max_hourly_volume: "10000",
  max_daily_volume: "20000",
  max_weekly_volume: "100000",
  max_daily_tx_count: 50,
  allowed_hours_utc: [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20],
  allowed_days_utc: [1, 2, 3, 4, 5],
  unknown_recipient_action: "review",
  risk_threshold_approve: 40,
  risk_threshold_block: 70,
  learning_enabled: true,
};

export type TxOutcomeType =
  | "auto_approved"
  | "manually_approved"
  | "auto_blocked"
  | "sent_for_review"
  | "manually_rejected";


export async function getUserSettings(safeAddress: string): Promise<UserSettingsRow> {
  const { data, error } = await supabase
    .from("user_settings")
    .select("*")
    .eq("safe_address", safeAddress.toLowerCase())
    .single<UserSettingsRow>();

  if (error) {
    if (error.code === "PGRST116") {
      return {
        safe_address: safeAddress.toLowerCase(),
        updated_at: new Date().toISOString(),
        ...DEFAULT_USER_SETTINGS,
      };
    }
    throw error;
  }
  return data!;
}

export async function upsertUserSettings(
  safeAddress: string,
  patch: Partial<Omit<UserSettingsRow, "safe_address" | "updated_at">>
): Promise<UserSettingsRow> {
  const { data, error } = await supabase
    .from("user_settings")
    .upsert({ safe_address: safeAddress.toLowerCase(), ...patch }, { onConflict: "safe_address" })
    .select()
    .single<UserSettingsRow>();

  if (error) throw error;
  return data!;
}

export async function getGlobalLimits(safeAddress: string): Promise<GlobalLimitsRow> {
  const { data, error } = await supabase
    .from("global_limits")
    .select("*")
    .eq("safe_address", safeAddress.toLowerCase())
    .single<GlobalLimitsRow>();

  if (error) {
    if (error.code === "PGRST116") {
      return {
        safe_address: safeAddress.toLowerCase(),
        updated_at: new Date().toISOString(),
        ...DEFAULT_LIMITS,
      };
    }
    throw error;
  }
  return data!;
}

export async function upsertGlobalLimits(
  safeAddress: string,
  patch: Partial<Omit<GlobalLimitsRow, "safe_address" | "updated_at">>
): Promise<GlobalLimitsRow> {
  const { data, error } = await supabase
    .from("global_limits")
    .upsert({ safe_address: safeAddress.toLowerCase(), ...patch }, { onConflict: "safe_address" })
    .select()
    .single<GlobalLimitsRow>();

  if (error) throw error;
  return data!;
}

// ─────────────────────────────────────────────────────────────
// Recipient profiles
// ─────────────────────────────────────────────────────────────

export async function getRecipientProfile(
  address: string,
  safeAddress: string
): Promise<RecipientProfileRow | null> {
  const { data, error } = await supabase
    .from("recipient_profiles")
    .select("*")
    .eq("address", address.toLowerCase())
    .eq("safe_address", safeAddress.toLowerCase())
    .single<RecipientProfileRow>();

  if (error) {
    if (error.code === "PGRST116") return null;
    throw error;
  }
  return data;
}

export async function upsertRecipientProfile(
  address: string,
  safeAddress: string,
  patch: Partial<Omit<RecipientProfileRow, "address" | "safe_address" | "updated_at">>
): Promise<void> {
  const { error } = await supabase
    .from("recipient_profiles")
    .upsert(
      { address: address.toLowerCase(), safe_address: safeAddress.toLowerCase(), ...patch },
      { onConflict: "address,safe_address" }
    );
  if (error) throw error;
}

export async function getRecipientProfiles(
  safeAddress: string
): Promise<RecipientProfileRow[]> {
  const { data, error } = await supabase
    .from("recipient_profiles")
    .select("*")
    .eq("safe_address", safeAddress.toLowerCase())
    .returns<RecipientProfileRow[]>();

  if (error) throw error;
  return data ?? [];
}

// ─────────────────────────────────────────────────────────────
// Time patterns
// ─────────────────────────────────────────────────────────────

export async function getTimePatterns(safeAddress: string): Promise<TimePatternRow[]> {
  const { data, error } = await supabase
    .from("time_patterns")
    .select("*")
    .eq("safe_address", safeAddress.toLowerCase())
    .returns<TimePatternRow[]>();

  if (error) throw error;
  return data ?? [];
}

export async function upsertTimePattern(
  safeAddress: string,
  hourUtc: number,
  dayOfWeek: number,
  patch: Partial<Pick<TimePatternRow, "tx_count" | "total_volume" | "is_allowed">>
): Promise<void> {
  const { error } = await supabase
    .from("time_patterns")
    .upsert(
      { safe_address: safeAddress.toLowerCase(), hour_utc: hourUtc, day_of_week: dayOfWeek, ...patch },
      { onConflict: "safe_address,hour_utc,day_of_week" }
    );
  if (error) throw error;
}

// ─────────────────────────────────────────────────────────────
// Velocity windows
// ─────────────────────────────────────────────────────────────

/** Truncate a date to the start of the given window type (UTC). */
function windowStart(type: VelocityWindowRow["window_type"], at = new Date()): string {
  const d = new Date(at);
  if (type === "hourly") {
    d.setUTCMinutes(0, 0, 0);
  } else if (type === "daily") {
    d.setUTCHours(0, 0, 0, 0);
  } else if (type === "weekly") {
    const day = d.getUTCDay(); // 0=Sun
    d.setUTCDate(d.getUTCDate() - day);
    d.setUTCHours(0, 0, 0, 0);
  } else {
    // monthly
    d.setUTCDate(1);
    d.setUTCHours(0, 0, 0, 0);
  }
  return d.toISOString();
}

export async function getCurrentVelocity(
  safeAddress: string,
  type: VelocityWindowRow["window_type"]
): Promise<VelocityWindowRow | null> {
  const start = windowStart(type);
  const { data, error } = await supabase
    .from("velocity_windows")
    .select("*")
    .eq("safe_address", safeAddress.toLowerCase())
    .eq("window_type", type)
    .eq("window_start", start)
    .single<VelocityWindowRow>();

  if (error) {
    if (error.code === "PGRST116") return null;
    throw error;
  }
  return data;
}

export async function incrementVelocityWindow(
  safeAddress: string,
  type: VelocityWindowRow["window_type"],
  amount: number
): Promise<void> {
  const start = windowStart(type);
  const existing = await getCurrentVelocity(safeAddress, type);

  const { error } = await supabase
    .from("velocity_windows")
    .upsert(
      {
        safe_address: safeAddress.toLowerCase(),
        window_type: type,
        window_start: start,
        tx_count: (existing?.tx_count ?? 0) + 1,
        total_volume: String(parseFloat(existing?.total_volume ?? "0") + amount),
      },
      { onConflict: "safe_address,window_type,window_start" }
    );
  if (error) throw error;
}

// ─────────────────────────────────────────────────────────────
// Token patterns
// ─────────────────────────────────────────────────────────────

export async function getTokenPattern(
  safeAddress: string,
  tokenAddress: string
): Promise<TokenPatternRow | null> {
  const { data, error } = await supabase
    .from("token_patterns")
    .select("*")
    .eq("safe_address", safeAddress.toLowerCase())
    .eq("token_address", tokenAddress.toLowerCase())
    .single<TokenPatternRow>();

  if (error) {
    if (error.code === "PGRST116") return null;
    throw error;
  }
  return data;
}

export async function getTokenPatterns(safeAddress: string): Promise<TokenPatternRow[]> {
  const { data, error } = await supabase
    .from("token_patterns")
    .select("*")
    .eq("safe_address", safeAddress.toLowerCase())
    .returns<TokenPatternRow[]>();

  if (error) throw error;
  return data ?? [];
}

export async function upsertTokenPattern(
  safeAddress: string,
  tokenAddress: string,
  patch: Partial<Omit<TokenPatternRow, "safe_address" | "token_address" | "updated_at">>
): Promise<void> {
  const { error } = await supabase
    .from("token_patterns")
    .upsert(
      {
        safe_address: safeAddress.toLowerCase(),
        token_address: tokenAddress.toLowerCase(),
        ...patch,
      },
      { onConflict: "safe_address,token_address" }
    );
  if (error) throw error;
}

// ─────────────────────────────────────────────────────────────
// User rules
// ─────────────────────────────────────────────────────────────

export async function getUserRules(safeAddress: string): Promise<UserRuleRow[]> {
  const { data, error } = await supabase
    .from("user_rules")
    .select("*")
    .eq("safe_address", safeAddress.toLowerCase())
    .eq("is_active", true)
    .order("priority", { ascending: true })
    .returns<UserRuleRow[]>();

  if (error) throw error;
  return data ?? [];
}

/**
 * Fetches a single rule by id regardless of `is_active` — used for ownership
 * checks, where a soft-deleted rule must still resolve to its owner so it can
 * be re-activated by (and only by) that owner.
 */
export async function getUserRule(id: string): Promise<UserRuleRow | null> {
  const { data, error } = await supabase
    .from("user_rules")
    .select("*")
    .eq("id", id)
    .maybeSingle<UserRuleRow>();

  if (error) throw error;
  return data ?? null;
}

export async function createUserRule(
  safeAddress: string,
  rule: Omit<UserRuleRow, "id" | "safe_address" | "created_at" | "updated_at">
): Promise<UserRuleRow> {
  const { data, error } = await supabase
    .from("user_rules")
    .insert({ safe_address: safeAddress.toLowerCase(), ...rule })
    .select()
    .single<UserRuleRow>();

  if (error) throw error;
  return data!;
}

export async function updateUserRule(
  id: string,
  patch: Partial<Omit<UserRuleRow, "id" | "safe_address" | "created_at" | "updated_at">>
): Promise<void> {
  const { error } = await supabase.from("user_rules").update(patch).eq("id", id);
  if (error) throw error;
}

export async function deleteUserRule(id: string): Promise<void> {
  const { error } = await supabase.from("user_rules").update({ is_active: false }).eq("id", id);
  if (error) throw error;
}

// ─────────────────────────────────────────────────────────────
// Daily stats
// ─────────────────────────────────────────────────────────────

export async function getDailyStats(
  safeAddress: string,
  date: string
): Promise<DailyStatsRow | null> {
  const { data, error } = await supabase
    .from("daily_stats")
    .select("*")
    .eq("safe_address", safeAddress.toLowerCase())
    .eq("date", date)
    .single<DailyStatsRow>();

  if (error) {
    if (error.code === "PGRST116") return null;
    throw error;
  }
  return data;
}

export async function upsertDailyStats(
  safeAddress: string,
  date: string,
  patch: Partial<Omit<DailyStatsRow, "safe_address" | "date">>
): Promise<void> {
  const { error } = await supabase
    .from("daily_stats")
    .upsert(
      { safe_address: safeAddress.toLowerCase(), date, ...patch },
      { onConflict: "date,safe_address" }
    );
  if (error) throw error;
}

// ─────────────────────────────────────────────────────────────
// Behavioral events
// ─────────────────────────────────────────────────────────────

export async function recordBehavioralEvent(
  event: Omit<BehavioralEventRow, "id" | "created_at">
): Promise<void> {
  const { error } = await supabase.from("behavioral_events").insert(event);
  if (error) throw error;
}

export async function getBehavioralEvents(
  safeAddress: string,
  limit = 100
): Promise<BehavioralEventRow[]> {
  const { data, error } = await supabase
    .from("behavioral_events")
    .select("*")
    .eq("safe_address", safeAddress.toLowerCase())
    .order("created_at", { ascending: false })
    .limit(limit)
    .returns<BehavioralEventRow[]>();

  if (error) throw error;
  return data ?? [];
}

// ─────────────────────────────────────────────────────────────
// getPatternsForSafe — assembles PatternsFile for analyzeRisk()
// Fetches all pattern dimensions in parallel for efficiency.
// ─────────────────────────────────────────────────────────────

export async function getPatternsForSafe(safeAddress: string): Promise<PatternsFile> {
  const safe = safeAddress.toLowerCase();

  const [
    recipientsData,
    timeData,
    velocityHourly,
    velocityDaily,
    velocityWeekly,
    tokenData,
    rulesData,
    dailyStatsData,
    limits,
  ] = await Promise.all([
    getRecipientProfiles(safe),
    getTimePatterns(safe),
    getCurrentVelocity(safe, "hourly"),
    getCurrentVelocity(safe, "daily"),
    getCurrentVelocity(safe, "weekly"),
    getTokenPatterns(safe),
    getUserRules(safe),
    // Last 30 days of stats for the risk engine
    supabase
      .from("daily_stats")
      .select("*")
      .eq("safe_address", safe)
      .order("date", { ascending: false })
      .limit(30)
      .returns<DailyStatsRow[]>()
      .then(({ data }) => data ?? []),
    getGlobalLimits(safe),
  ]);

  // Shape recipients into the PatternsFile format
  const recipients: PatternsFile["recipients"] = {};
  for (const r of recipientsData) {
    recipients[r.address] = {
      label: r.label,
      totalTxCount: r.total_tx_count,
      totalVolume: r.total_volume,
      avgAmount: r.avg_amount,
      minAmount: r.min_amount,
      maxAmount: r.max_amount,
      stddevAmount: r.stddev_amount,
      typicalHoursUtc: r.typical_hours_utc ?? [],
      typicalDaysOfWeek: r.typical_days_of_week ?? [],
      avgDaysBetweenTxs: r.avg_days_between_txs ? parseFloat(r.avg_days_between_txs) : null,
      category: r.category,
      trustLevel: r.trust_level,
      firstSeen: r.first_seen,
      lastSeen: r.last_seen,
      customAttributes: r.custom_attributes,
    };
  }

  // Shape daily stats into the PatternsFile format
  const dailyStats: PatternsFile["dailyStats"] = {};
  for (const d of dailyStatsData) {
    dailyStats[d.date] = {
      txCount: d.tx_count,
      approvedCount: d.approved_count,
      reviewedCount: d.reviewed_count,
      rejectedCount: d.rejected_count,
      totalVolume: d.total_volume,
      approvedVolume: d.approved_volume,
    };
  }

  // Shape time patterns into a lookup map: { "hour:day": TimePatternRow }
  const timePatterns: PatternsFile["timePatterns"] = {};
  for (const t of timeData) {
    timePatterns[`${t.hour_utc}:${t.day_of_week}`] = {
      hourUtc: t.hour_utc,
      dayOfWeek: t.day_of_week,
      txCount: t.tx_count,
      totalVolume: t.total_volume,
      isAllowed: t.is_allowed,
    };
  }

  // Shape token patterns
  const tokenPatterns: PatternsFile["tokenPatterns"] = {};
  for (const t of tokenData) {
    tokenPatterns[t.token_address] = {
      symbol: t.token_symbol,
      totalTxCount: t.total_tx_count,
      totalVolume: t.total_volume,
      avgAmount: t.avg_amount,
      maxAmount: t.max_amount,
      isFamiliar: t.is_familiar,
      firstSeen: t.first_seen,
      lastUsed: t.last_used,
    };
  }

  return {
    recipients,
    dailyStats,
    timePatterns,
    tokenPatterns,
    rules: rulesData.map((r) => ({
      id: r.id,
      name: r.name,
      ruleType: r.rule_type,
      conditions: r.conditions,
      action: r.action,
      riskScoreDelta: r.risk_score_delta,
      priority: r.priority,
    })),
    velocity: {
      hourly: velocityHourly
        ? { txCount: velocityHourly.tx_count, totalVolume: velocityHourly.total_volume }
        : null,
      daily: velocityDaily
        ? { txCount: velocityDaily.tx_count, totalVolume: velocityDaily.total_volume }
        : null,
      weekly: velocityWeekly
        ? { txCount: velocityWeekly.tx_count, totalVolume: velocityWeekly.total_volume }
        : null,
    },
    globalLimits: {
      maxSingleTx: limits.max_single_tx,
      maxHourlyVolume: limits.max_hourly_volume,
      maxDailyVolume: limits.max_daily_volume,
      maxWeeklyVolume: limits.max_weekly_volume,
      maxDailyTxCount: limits.max_daily_tx_count,
      allowedHoursUTC: limits.allowed_hours_utc,
      allowedDaysUTC: limits.allowed_days_utc,
      unknownRecipientAction: limits.unknown_recipient_action,
      riskThresholdApprove: limits.risk_threshold_approve,
      riskThresholdBlock: limits.risk_threshold_block,
      learningEnabled: limits.learning_enabled,
    },
  };
}

// ─────────────────────────────────────────────────────────────
// Requests (invoices & general transfer instructions)
// ─────────────────────────────────────────────────────────────

export async function recordTxOutcome(
  tx: PendingTransaction,
  outcome: TxOutcomeType,
  opts?: {
    riskScore?: number;
    riskVerdict?: string;
    riskReasons?: string[];
    triggeredRules?: string[];
    metadata?: Record<string, unknown>;
  }
): Promise<void> {
  const event: Omit<BehavioralEventRow, "id" | "created_at"> = {
    safe_address: tx.safeAddress.toLowerCase(),
    tx_id: tx.id,
    event_type: outcome,
    recipient_address: tx.to.toLowerCase(),
    amount: tx.amountUSD ?? tx.amount,
    token_address: tx.tokenAddress?.toLowerCase() ?? null,
    token_symbol: tx.token ?? null,
    risk_score: opts?.riskScore ?? tx.riskScore ?? null,
    risk_verdict: opts?.riskVerdict ?? tx.riskVerdict ?? null,
    risk_reasons: opts?.riskReasons ?? tx.riskReasons ?? null,
    triggered_rules: opts?.triggeredRules ?? null,
    metadata: opts?.metadata ?? {},
  };
  await recordBehavioralEvent(event);
}

/**
 * Updates all pattern tables after a transaction is successfully executed.
 * This is the "learning" step — call it once per confirmed execution.
 *
 * Updates: recipient_profiles, time_patterns, token_patterns,
 *          velocity_windows (hourly/daily/weekly/monthly), daily_stats.
 */
export async function updatePatternsAfterExecution(
  tx: PendingTransaction
): Promise<void> {
  const safe = tx.safeAddress.toLowerCase();
  const amount = parseFloat(tx.amountUSD ?? tx.amount);
  const now = new Date();
  const hourUtc = now.getUTCHours();
  const dayOfWeek = now.getUTCDay();
  const today = now.toISOString().split("T")[0];

  // Swaps and approvals have no payment recipient — `tx.to` is a router or
  // token contract, and learning it as a recipient would corrupt the trust
  // profile the risk engine scores real payments against. Token, time,
  // velocity and daily patterns still learn from every kind.
  const decoded = decodeTxKind(tx);
  const hasRecipient = decoded.kind !== "swap" && decoded.kind !== "approval";

  await Promise.all([
    ...(hasRecipient
      ? [_updateRecipientProfile(safe, tx.to.toLowerCase(), amount, hourUtc, dayOfWeek, now)]
      : []),
    _updateTimePattern(safe, hourUtc, dayOfWeek, amount),
    _updateTokenPattern(safe, tx),
    incrementVelocityWindow(safe, "hourly", amount),
    incrementVelocityWindow(safe, "daily", amount),
    incrementVelocityWindow(safe, "weekly", amount),
    incrementVelocityWindow(safe, "monthly", amount),
    _updateDailyStatsForApproval(safe, today, amount),
  ]);
}

async function _updateRecipientProfile(
  safe: string,
  address: string,
  amount: number,
  hourUtc: number,
  dayOfWeek: number,
  now: Date
): Promise<void> {
  const existing = await getRecipientProfile(address, safe);

  const n = existing?.total_tx_count ?? 0;
  const oldAvg = parseFloat(existing?.avg_amount ?? "0");
  const oldStddev = parseFloat(existing?.stddev_amount ?? "0");
  const newN = n + 1;

  // Online mean update
  const newAvg = (oldAvg * n + amount) / newN;

  // Online variance update (population stddev approximation)
  const newVariance =
    newN <= 1
      ? 0
      : (oldStddev ** 2 * n + (amount - newAvg) ** 2) / newN;
  const newStddev = Math.sqrt(newVariance);

  // Merge this hour/day into typical arrays (keep unique, max 24 entries)
  const typicalHours = Array.from(
    new Set([...(existing?.typical_hours_utc ?? []), hourUtc])
  ).slice(0, 24);
  const typicalDays = Array.from(
    new Set([...(existing?.typical_days_of_week ?? []), dayOfWeek])
  );

  // Average days between transactions
  let avgDaysBetween: string | null = existing?.avg_days_between_txs ?? null;
  if (existing?.last_seen) {
    const daysSinceLast =
      (now.getTime() - new Date(existing.last_seen).getTime()) / 86_400_000;
    avgDaysBetween =
      avgDaysBetween === null
        ? String(daysSinceLast.toFixed(2))
        : String(((parseFloat(avgDaysBetween) * (n - 1) + daysSinceLast) / n).toFixed(2));
  }

  await upsertRecipientProfile(address, safe, {
    total_tx_count: newN,
    total_volume: String((parseFloat(existing?.total_volume ?? "0") + amount).toFixed(2)),
    avg_amount: String(newAvg.toFixed(2)),
    min_amount: String(Math.min(parseFloat(existing?.min_amount ?? String(amount)), amount).toFixed(2)),
    max_amount: String(Math.max(parseFloat(existing?.max_amount ?? "0"), amount).toFixed(2)),
    stddev_amount: String(newStddev.toFixed(4)),
    typical_hours_utc: typicalHours,
    typical_days_of_week: typicalDays,
    avg_days_between_txs: avgDaysBetween,
    first_seen: existing?.first_seen ?? now.toISOString(),
    last_seen: now.toISOString(),
  });
}

async function _updateTimePattern(
  safe: string,
  hourUtc: number,
  dayOfWeek: number,
  amount: number
): Promise<void> {
  const { data } = await supabase
    .from("time_patterns")
    .select("tx_count, total_volume")
    .eq("safe_address", safe)
    .eq("hour_utc", hourUtc)
    .eq("day_of_week", dayOfWeek)
    .single<{ tx_count: number; total_volume: string }>();

  await upsertTimePattern(safe, hourUtc, dayOfWeek, {
    tx_count: (data?.tx_count ?? 0) + 1,
    total_volume: String(
      (parseFloat(data?.total_volume ?? "0") + amount).toFixed(2)
    ),
  });
}

async function _updateTokenPattern(
  safe: string,
  tx: PendingTransaction
): Promise<void> {
  if (!tx.tokenAddress) return;
  const tokenAddress = tx.tokenAddress.toLowerCase();
  const amount = parseFloat(tx.amountUSD ?? tx.amount);
  const existing = await getTokenPattern(safe, tokenAddress);
  const n = existing?.total_tx_count ?? 0;
  const newN = n + 1;
  const oldAvg = parseFloat(existing?.avg_amount ?? "0");
  const newAvg = (oldAvg * n + amount) / newN;

  await upsertTokenPattern(safe, tokenAddress, {
    token_symbol: tx.token ?? existing?.token_symbol ?? null,
    total_tx_count: newN,
    total_volume: String((parseFloat(existing?.total_volume ?? "0") + amount).toFixed(2)),
    avg_amount: String(newAvg.toFixed(2)),
    max_amount: String(Math.max(parseFloat(existing?.max_amount ?? "0"), amount).toFixed(2)),
    // Familiar after 3+ transactions
    is_familiar: newN >= 3,
    first_seen: existing?.first_seen ?? new Date().toISOString(),
    last_used: new Date().toISOString(),
  });
}

async function _updateDailyStatsForApproval(
  safe: string,
  date: string,
  amount: number
): Promise<void> {
  const existing = await getDailyStats(safe, date);
  await upsertDailyStats(safe, date, {
    tx_count: (existing?.tx_count ?? 0) + 1,
    approved_count: (existing?.approved_count ?? 0) + 1,
    reviewed_count: existing?.reviewed_count ?? 0,
    rejected_count: existing?.rejected_count ?? 0,
    total_volume: String((parseFloat(existing?.total_volume ?? "0") + amount).toFixed(2)),
    approved_volume: String((parseFloat(existing?.approved_volume ?? "0") + amount).toFixed(2)),
  });
}

/**
 * Increments daily_stats for a REVIEW outcome (tx sent for human review).
 */
export async function incrementDailyStatsReview(
  safeAddress: string
): Promise<void> {
  const safe = safeAddress.toLowerCase();
  const date = new Date().toISOString().split("T")[0];
  const existing = await getDailyStats(safe, date);
  await upsertDailyStats(safe, date, {
    tx_count: (existing?.tx_count ?? 0) + 1,
    approved_count: existing?.approved_count ?? 0,
    reviewed_count: (existing?.reviewed_count ?? 0) + 1,
    rejected_count: existing?.rejected_count ?? 0,
    total_volume: existing?.total_volume ?? "0",
    approved_volume: existing?.approved_volume ?? "0",
  });
}


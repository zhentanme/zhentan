/**
 * All database access for Zhentan.
 * Replaces the readFileSync / writeFileSync pattern across all routes.
 */
import { supabase } from "./client.js";
import type {
  TransactionRow,
  UserDetailsRow,
  UserSettingsRow,
  InvoiceRow,
  GlobalLimitsRow,
  RecipientProfileRow,
  TimePatternRow,
  VelocityWindowRow,
  TokenPatternRow,
  UserRuleRow,
  DailyStatsRow,
  BehavioralEventRow,
  CampaignRow,
  CampaignClaimRow,
} from "./types.js";
import type { PendingTransaction, QueuedInvoice } from "../../types.js";
import type { PatternsFile } from "../../risk.js";

// ─────────────────────────────────────────────────────────────
// Mappers: DB row ↔ app type
// ─────────────────────────────────────────────────────────────

function rowToTx(row: TransactionRow): PendingTransaction {
  return {
    id: row.id,
    to: row.to_address,
    amount: row.amount,
    token: row.token ?? "",
    direction: (row.direction as PendingTransaction["direction"]) ?? undefined,
    tokenAddress: row.token_address ?? "",
    tokenIconUrl: row.token_icon_url ?? null,
    proposedBy: row.proposed_by ?? "",
    signatures: [],
    ownerAddresses: row.owner_addresses ?? [],
    threshold: row.threshold ?? 2,
    safeAddress: row.safe_address,
    userOp: row.user_op ?? {},
    partialSignatures: row.partial_signatures ?? "",
    proposedAt: row.proposed_at,
    executedAt: row.executed_at ?? undefined,
    executedBy: row.executed_by ?? undefined,
    txHash: row.tx_hash ?? undefined,
    success: row.success ?? undefined,
    inReview: row.in_review,
    reviewReason: row.review_reason ?? undefined,
    reviewedAt: row.reviewed_at ?? undefined,
    rejected: row.rejected,
    rejectedAt: row.rejected_at ?? undefined,
    rejectReason: row.reject_reason ?? undefined,
    riskScore: row.risk_score ?? undefined,
    riskVerdict: row.risk_verdict ?? undefined,
    riskReasons: row.risk_reasons ?? undefined,
    screeningDisabled: row.screening_disabled,
  };
}

function txToRow(tx: PendingTransaction): TransactionRow {
  return {
    id: tx.id,
    safe_address: tx.safeAddress.toLowerCase(),
    to_address: tx.to,
    amount: tx.amount,
    token: tx.token ?? null,
    direction: tx.direction ?? null,
    token_address: tx.tokenAddress ?? null,
    token_icon_url: tx.tokenIconUrl ?? null,
    proposed_by: tx.proposedBy ?? null,
    owner_addresses: tx.ownerAddresses ?? null,
    threshold: tx.threshold ?? null,
    user_op: tx.userOp ?? null,
    partial_signatures: tx.partialSignatures ?? null,
    proposed_at: tx.proposedAt,
    risk_score: tx.riskScore ?? null,
    risk_verdict: tx.riskVerdict ?? null,
    risk_reasons: tx.riskReasons ?? null,
    in_review: tx.inReview ?? false,
    review_reason: tx.reviewReason ?? null,
    reviewed_at: tx.reviewedAt ?? null,
    rejected: tx.rejected ?? false,
    rejected_at: tx.rejectedAt ?? null,
    reject_reason: tx.rejectReason ?? null,
    executed_at: tx.executedAt ?? null,
    executed_by: tx.executedBy ?? null,
    tx_hash: tx.txHash ?? null,
    success: tx.success ?? null,
    screening_disabled: tx.screeningDisabled ?? false,
  };
}

function rowToInvoice(row: InvoiceRow): QueuedInvoice {
  return {
    id: row.id,
    to: row.to_address ?? "",
    amount: row.amount ?? "",
    token: row.token ?? "",
    invoiceNumber: row.invoice_number ?? undefined,
    issueDate: row.issue_date ?? undefined,
    dueDate: row.due_date ?? undefined,
    billedFrom: (row.billed_from as unknown as QueuedInvoice["billedFrom"]) ?? undefined,
    billedTo: (row.billed_to as unknown as QueuedInvoice["billedTo"]) ?? undefined,
    services: (row.services as QueuedInvoice["services"]) ?? undefined,
    riskScore: row.risk_score ?? undefined,
    riskNotes: row.risk_notes ?? undefined,
    sourceChannel: row.source_channel ?? "",
    queuedAt: row.queued_at,
    status: row.status,
    txId: row.tx_id ?? undefined,
    executedAt: row.executed_at ?? undefined,
    txHash: row.tx_hash ?? undefined,
    rejectedAt: row.rejected_at ?? undefined,
    rejectReason: row.reject_reason ?? undefined,
  };
}

function invoiceToRow(inv: QueuedInvoice): InvoiceRow {
  return {
    id: inv.id,
    to_address: inv.to ?? null,
    amount: inv.amount ?? null,
    token: inv.token ?? null,
    invoice_number: inv.invoiceNumber ?? null,
    issue_date: inv.issueDate ?? null,
    due_date: inv.dueDate ?? null,
    billed_from: (inv.billedFrom as unknown as Record<string, unknown>) ?? null,
    billed_to: (inv.billedTo as unknown as Record<string, unknown>) ?? null,
    services: inv.services ?? null,
    risk_score: inv.riskScore ?? null,
    risk_notes: inv.riskNotes ?? null,
    source_channel: inv.sourceChannel ?? null,
    queued_at: inv.queuedAt,
    status: inv.status,
    tx_id: inv.txId ?? null,
    executed_at: inv.executedAt ?? null,
    tx_hash: inv.txHash ?? null,
    rejected_at: inv.rejectedAt ?? null,
    reject_reason: inv.rejectReason ?? null,
  };
}

// ─────────────────────────────────────────────────────────────
// Transactions
// ─────────────────────────────────────────────────────────────

export async function getTransaction(id: string): Promise<PendingTransaction | null> {
  const { data, error } = await supabase
    .from("transactions")
    .select("*")
    .eq("id", id)
    .single<TransactionRow>();

  if (error) {
    if (error.code === "PGRST116") return null;
    throw error;
  }
  return data ? rowToTx(data) : null;
}

export async function createTransaction(tx: PendingTransaction): Promise<void> {
  const { error } = await supabase.from("transactions").insert(txToRow(tx));
  if (error) throw error;
}

export async function updateTransaction(
  id: string,
  patch: Partial<PendingTransaction>
): Promise<void> {
  const keyMap: Partial<Record<keyof PendingTransaction, keyof TransactionRow>> = {
    to: "to_address",
    amount: "amount",
    token: "token",
    direction: "direction",
    tokenAddress: "token_address",
    tokenIconUrl: "token_icon_url",
    proposedBy: "proposed_by",
    ownerAddresses: "owner_addresses",
    threshold: "threshold",
    safeAddress: "safe_address",
    userOp: "user_op",
    partialSignatures: "partial_signatures",
    proposedAt: "proposed_at",
    executedAt: "executed_at",
    executedBy: "executed_by",
    txHash: "tx_hash",
    success: "success",
    inReview: "in_review",
    reviewReason: "review_reason",
    reviewedAt: "reviewed_at",
    rejected: "rejected",
    rejectedAt: "rejected_at",
    rejectReason: "reject_reason",
    riskScore: "risk_score",
    riskVerdict: "risk_verdict",
    riskReasons: "risk_reasons",
    screeningDisabled: "screening_disabled",
  };

  const row: Partial<TransactionRow> = {};
  for (const [appKey, val] of Object.entries(patch)) {
    const dbKey = keyMap[appKey as keyof PendingTransaction];
    if (dbKey) (row as Record<string, unknown>)[dbKey] = val;
  }

  const { error } = await supabase.from("transactions").update(row).eq("id", id);
  if (error) throw error;
}

export async function getTransactionsByAddress(
  safeAddress: string
): Promise<PendingTransaction[]> {
  const { data, error } = await supabase
    .from("transactions")
    .select("*")
    .eq("safe_address", safeAddress.toLowerCase())
    .order("proposed_at", { ascending: false })
    .returns<TransactionRow[]>();

  if (error) throw error;
  return (data ?? []).map(rowToTx);
}

// ─────────────────────────────────────────────────────────────
// User settings
// ─────────────────────────────────────────────────────────────

const DEFAULT_USER_SETTINGS: Omit<UserSettingsRow, "safe_address" | "updated_at"> = {
  screening_mode: false,
  last_check: null,
  telegram_chat_id: null,
  decisions: [],
};

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

export async function getTelegramChatId(safeAddress: string): Promise<string | undefined> {
  const settings = await getUserSettings(safeAddress);
  return settings.telegram_chat_id ?? undefined;
}

// ─────────────────────────────────────────────────────────────
// Global limits
// ─────────────────────────────────────────────────────────────

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
// Invoices
// ─────────────────────────────────────────────────────────────

export async function getInvoices(): Promise<QueuedInvoice[]> {
  const { data, error } = await supabase
    .from("invoices")
    .select("*")
    .order("queued_at", { ascending: false })
    .returns<InvoiceRow[]>();

  if (error) throw error;
  return (data ?? []).map(rowToInvoice);
}

export async function getInvoice(id: string): Promise<QueuedInvoice | null> {
  const { data, error } = await supabase
    .from("invoices")
    .select("*")
    .eq("id", id)
    .single<InvoiceRow>();

  if (error) {
    if (error.code === "PGRST116") return null;
    throw error;
  }
  return data ? rowToInvoice(data) : null;
}

export async function createInvoice(invoice: QueuedInvoice): Promise<void> {
  const { error } = await supabase.from("invoices").insert(invoiceToRow(invoice));
  if (error) throw error;
}

export async function updateInvoice(
  id: string,
  patch: Partial<QueuedInvoice>
): Promise<QueuedInvoice> {
  const rowPatch: Partial<InvoiceRow> = {};
  if (patch.status !== undefined)       rowPatch.status        = patch.status;
  if (patch.txId !== undefined)         rowPatch.tx_id         = patch.txId;
  if (patch.txHash !== undefined)       rowPatch.tx_hash       = patch.txHash;
  if (patch.executedAt !== undefined)   rowPatch.executed_at   = patch.executedAt;
  if (patch.rejectedAt !== undefined)   rowPatch.rejected_at   = patch.rejectedAt;
  if (patch.rejectReason !== undefined) rowPatch.reject_reason = patch.rejectReason;

  const { data, error } = await supabase
    .from("invoices")
    .update(rowPatch)
    .eq("id", id)
    .select()
    .single<InvoiceRow>();

  if (error) throw error;
  return rowToInvoice(data!);
}

// ─────────────────────────────────────────────────────────────
// Pattern learning — called after a transaction outcome is known
// ─────────────────────────────────────────────────────────────

export type TxOutcomeType =
  | "auto_approved"
  | "manually_approved"
  | "auto_blocked"
  | "sent_for_review"
  | "manually_rejected";

/**
 * Inserts a row into behavioral_events.
 * Call this on every transaction outcome (approve, block, review, reject).
 */
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
    amount: tx.amount,
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
  const amount = parseFloat(tx.amount);
  const now = new Date();
  const hourUtc = now.getUTCHours();
  const dayOfWeek = now.getUTCDay();
  const today = now.toISOString().split("T")[0];

  await Promise.all([
    _updateRecipientProfile(safe, tx.to.toLowerCase(), amount, hourUtc, dayOfWeek, now),
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
  const amount = parseFloat(tx.amount);
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

// ─────────────────────────────────────────────────────────────
// Campaigns
// ─────────────────────────────────────────────────────────────

export async function getCampaign(id: string): Promise<CampaignRow | null> {
  const { data } = await supabase
    .from("campaigns")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  return data ?? null;
}

export async function getCampaigns(): Promise<CampaignRow[]> {
  const { data } = await supabase
    .from("campaigns")
    .select("*")
    .order("created_at", { ascending: false });
  return data ?? [];
}

export async function getCampaignClaimCount(campaignId: string): Promise<number> {
  const { count } = await supabase
    .from("campaign_claims")
    .select("*", { count: "exact", head: true })
    .eq("campaign_id", campaignId);
  return count ?? 0;
}

export async function getCampaignClaim(
  campaignId: string,
  safeAddress: string
): Promise<CampaignClaimRow | null> {
  const { data } = await supabase
    .from("campaign_claims")
    .select("*")
    .eq("campaign_id", campaignId)
    .eq("safe_address", safeAddress.toLowerCase())
    .maybeSingle();
  return data ?? null;
}

export async function createCampaignClaim(
  campaignId: string,
  safeAddress: string,
  tokenAmount: string
): Promise<CampaignClaimRow> {
  const { data, error } = await supabase
    .from("campaign_claims")
    .insert({
      campaign_id: campaignId,
      safe_address: safeAddress.toLowerCase(),
      token_amount: tokenAmount,
      status: "pending",
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function updateCampaignClaim(
  campaignId: string,
  safeAddress: string,
  patch: Partial<Pick<CampaignClaimRow, "status" | "tx_hash" | "paid_at">>
): Promise<void> {
  await supabase
    .from("campaign_claims")
    .update(patch)
    .eq("campaign_id", campaignId)
    .eq("safe_address", safeAddress.toLowerCase());
}

// ─────────────────────────────────────────────────────────────
// User details
// ─────────────────────────────────────────────────────────────

export async function getUserByUsername(username: string): Promise<UserDetailsRow | null> {
  const { data } = await supabase
    .from("user_details")
    .select("*")
    .eq("username", username.toLowerCase())
    .maybeSingle();
  return data ?? null;
}

export async function getUserDetails(safeAddress: string): Promise<UserDetailsRow | null> {
  const { data } = await supabase
    .from("user_details")
    .select("*")
    .eq("safe_address", safeAddress.toLowerCase())
    .maybeSingle();
  return data ?? null;
}

export async function upsertUserDetails(
  safeAddress: string,
  patch: Partial<Omit<UserDetailsRow, "safe_address" | "created_at" | "updated_at">>
): Promise<void> {
  await supabase
    .from("user_details")
    .upsert(
      { safe_address: safeAddress.toLowerCase(), ...patch, updated_at: new Date().toISOString() },
      { onConflict: "safe_address" }
    );
}

/**
 * Increments daily_stats for a REJECT outcome.
 */
export async function incrementDailyStatsReject(
  safeAddress: string
): Promise<void> {
  const safe = safeAddress.toLowerCase();
  const date = new Date().toISOString().split("T")[0];
  const existing = await getDailyStats(safe, date);
  await upsertDailyStats(safe, date, {
    tx_count: (existing?.tx_count ?? 0) + 1,
    approved_count: existing?.approved_count ?? 0,
    reviewed_count: existing?.reviewed_count ?? 0,
    rejected_count: (existing?.rejected_count ?? 0) + 1,
    total_volume: existing?.total_volume ?? "0",
    approved_volume: existing?.approved_volume ?? "0",
  });
}

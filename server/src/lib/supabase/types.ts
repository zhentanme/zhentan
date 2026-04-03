/**
 * DB row types (snake_case) — mirror schema.sql column names exactly.
 * App types (camelCase) live in src/types.ts; mappers in db.ts bridge the two.
 */

// ─────────────────────────────────────────────────────────────
// Core operational tables
// ─────────────────────────────────────────────────────────────

export interface TransactionRow {
  id: string;
  safe_address: string;
  to_address: string;
  amount: string;
  token: string | null;
  direction: string | null;
  token_address: string | null;
  token_icon_url: string | null;
  proposed_by: string | null;
  owner_addresses: string[] | null;
  threshold: number | null;
  user_op: Record<string, unknown> | null;
  partial_signatures: string | null;
  proposed_at: string;
  risk_score: number | null;
  risk_verdict: "APPROVE" | "REVIEW" | "BLOCK" | null;
  risk_reasons: string[] | null;
  in_review: boolean;
  review_reason: string | null;
  reviewed_at: string | null;
  rejected: boolean;
  rejected_at: string | null;
  reject_reason: string | null;
  executed_at: string | null;
  executed_by: string | null;
  tx_hash: string | null;
  success: boolean | null;
  screening_disabled: boolean;
}

export interface UserDetailsRow {
  safe_address: string;
  email: string | null;
  telegram_id: string | null;
  name: string | null;
  username: string | null;
  signer_address: string | null;
  onboarding_completed: boolean | null;
  created_at: string;
  updated_at: string;
}

export interface UserSettingsRow {
  safe_address: string;
  screening_mode: boolean;
  last_check: string | null;
  telegram_chat_id: string | null;
  decisions: unknown[];
  updated_at: string;
}

export interface InvoiceRow {
  id: string;
  to_address: string | null;
  amount: string | null;
  token: string | null;
  invoice_number: string | null;
  issue_date: string | null;
  due_date: string | null;
  billed_from: Record<string, unknown> | null;
  billed_to: Record<string, unknown> | null;
  services: unknown[] | null;
  risk_score: number | null;
  risk_notes: string | null;
  source_channel: string | null;
  queued_at: string;
  status: "queued" | "approved" | "executed" | "rejected";
  tx_id: string | null;
  executed_at: string | null;
  tx_hash: string | null;
  rejected_at: string | null;
  reject_reason: string | null;
}

// ─────────────────────────────────────────────────────────────
// Pattern / behavioral profile tables
// ─────────────────────────────────────────────────────────────

export interface GlobalLimitsRow {
  safe_address: string;
  max_single_tx: string;
  max_hourly_volume: string;
  max_daily_volume: string;
  max_weekly_volume: string;
  max_daily_tx_count: number;
  allowed_hours_utc: number[];
  allowed_days_utc: number[];
  unknown_recipient_action: "approve" | "review" | "block";
  risk_threshold_approve: number;
  risk_threshold_block: number;
  learning_enabled: boolean;
  updated_at: string;
}

export interface RecipientProfileRow {
  address: string;
  safe_address: string;
  label: string | null;
  category: string;
  trust_level: "trusted" | "neutral" | "suspicious" | "blocked";
  total_tx_count: number;
  total_volume: string;
  avg_amount: string;
  min_amount: string;
  max_amount: string;
  stddev_amount: string;
  typical_hours_utc: number[] | null;
  typical_days_of_week: number[] | null;
  avg_days_between_txs: string | null;
  first_seen: string | null;
  last_seen: string | null;
  custom_attributes: Record<string, unknown>;
  notes: string | null;
  updated_at: string;
}

export interface TimePatternRow {
  safe_address: string;
  hour_utc: number;           // 0–23
  day_of_week: number;        // 0=Sun … 6=Sat
  tx_count: number;
  total_volume: string;
  is_allowed: boolean | null; // null = use learned default
}

export interface VelocityWindowRow {
  safe_address: string;
  window_type: "hourly" | "daily" | "weekly" | "monthly";
  window_start: string;       // ISO timestamptz, truncated to window boundary
  tx_count: number;
  total_volume: string;
  updated_at: string;
}

export interface TokenPatternRow {
  safe_address: string;
  token_address: string;
  token_symbol: string | null;
  total_tx_count: number;
  total_volume: string;
  avg_amount: string;
  max_amount: string;
  is_familiar: boolean;
  first_seen: string | null;
  last_used: string | null;
  updated_at: string;
}

export interface CampaignRow {
  id: string;
  name: string;
  description: string | null;
  token_amount: string;
  max_claims: number;
  requirements: Record<string, unknown>;
  starts_at: string;
  ends_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CampaignClaimRow {
  campaign_id: string;
  safe_address: string;
  claimed_at: string;
  token_amount: string;
  status: "pending" | "paid" | "failed";
  tx_hash: string | null;
  paid_at: string | null;
}

export interface UserRuleRow {
  id: string;
  safe_address: string;
  name: string;
  description: string | null;
  rule_type:
    | "amount_limit"
    | "recipient_block"
    | "recipient_whitelist"
    | "time_restriction"
    | "velocity_limit"
    | "token_restriction"
    | "custom";
  conditions: Record<string, unknown>;
  action: "approve" | "review" | "block";
  risk_score_delta: number;
  is_active: boolean;
  priority: number;
  created_at: string;
  updated_at: string;
}

export interface DailyStatsRow {
  date: string;
  safe_address: string;
  tx_count: number;
  approved_count: number;
  reviewed_count: number;
  rejected_count: number;
  total_volume: string;
  approved_volume: string;
}

export interface BehavioralEventRow {
  id: string;
  safe_address: string;
  tx_id: string | null;
  event_type: string;
  recipient_address: string | null;
  amount: string | null;
  token_address: string | null;
  token_symbol: string | null;
  risk_score: number | null;
  risk_verdict: string | null;
  risk_reasons: string[] | null;
  triggered_rules: string[] | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

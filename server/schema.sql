-- Zhentan Supabase Schema
-- Run this in your Supabase SQL editor to set up all tables.
-- All pattern tables are keyed by safe_address so every Safe wallet
-- has its own fully isolated, learned behavioral profile.

-- ─────────────────────────────────────────────────────────────
-- Helper: auto-update updated_at on any table
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ─────────────────────────────────────────────────────────────
-- transactions  (replaces pending-queue.json)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS transactions (
  id                  TEXT PRIMARY KEY,
  safe_address        TEXT NOT NULL,
  to_address          TEXT NOT NULL,
  amount              TEXT NOT NULL,
  token               TEXT,
  direction           TEXT,
  token_address       TEXT,
  token_icon_url      TEXT,
  proposed_by         TEXT,
  owner_addresses     TEXT[],
  threshold           INT,
  -- BigInts serialised as "bigint:N" strings inside the JSONB object
  user_op             JSONB,
  partial_signatures  TEXT,
  proposed_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- risk scoring
  risk_score          INT,
  risk_verdict        TEXT CHECK (risk_verdict IN ('APPROVE', 'REVIEW', 'BLOCK')),
  risk_reasons        TEXT[],
  -- review / block lifecycle
  in_review           BOOLEAN NOT NULL DEFAULT false,
  review_reason       TEXT,
  reviewed_at         TIMESTAMPTZ,
  -- rejection
  rejected            BOOLEAN NOT NULL DEFAULT false,
  rejected_at         TIMESTAMPTZ,
  reject_reason       TEXT,
  -- execution result
  executed_at         TIMESTAMPTZ,
  executed_by         TEXT,
  tx_hash             TEXT,
  success             BOOLEAN,
  screening_disabled  BOOLEAN NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_transactions_safe_address ON transactions (safe_address);
CREATE INDEX IF NOT EXISTS idx_transactions_proposed_at  ON transactions (proposed_at DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_status       ON transactions (safe_address, executed_at, rejected, in_review);

ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────────────────────────
-- user_details  — identity info synced from Privy on first login
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_details (
  safe_address          TEXT        PRIMARY KEY,
  email                 TEXT,
  telegram_id           TEXT,
  name                  TEXT,
  username              TEXT UNIQUE,
  signer_address        TEXT,
  onboarding_completed  BOOLEAN,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE TRIGGER trg_user_details_updated_at
  BEFORE UPDATE ON user_details
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE user_details ENABLE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────────────────────────
-- user_settings  (replaces state.json)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_settings (
  safe_address      TEXT PRIMARY KEY,
  screening_mode    BOOLEAN NOT NULL DEFAULT false,
  last_check        TIMESTAMPTZ,
  telegram_chat_id  TEXT,
  decisions         JSONB NOT NULL DEFAULT '[]',
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE TRIGGER trg_user_settings_updated_at
  BEFORE UPDATE ON user_settings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────────────────────────
-- invoices  (replaces invoice-queue.json)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS invoices (
  id              TEXT PRIMARY KEY,
  to_address      TEXT,
  amount          TEXT,
  token           TEXT,
  invoice_number  TEXT,
  issue_date      DATE,
  due_date        DATE,
  billed_from     JSONB,
  billed_to       JSONB,
  services        JSONB,
  risk_score      INT,
  risk_notes      TEXT,
  source_channel  TEXT,
  queued_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  status          TEXT NOT NULL DEFAULT 'queued'
                    CHECK (status IN ('queued', 'approved', 'executed', 'rejected')),
  tx_id           TEXT,
  executed_at     TIMESTAMPTZ,
  tx_hash         TEXT,
  rejected_at     TIMESTAMPTZ,
  reject_reason   TEXT
);

CREATE INDEX IF NOT EXISTS idx_invoices_queued_at ON invoices (queued_at DESC);
CREATE INDEX IF NOT EXISTS idx_invoices_status    ON invoices (status);

ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

-- ═════════════════════════════════════════════════════════════
-- PATTERN TABLES — fully per-safe_address
-- Each Safe wallet has its own isolated behavioral profile.
-- ═════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────────────────────
-- global_limits  — per-user configurable transaction limits
-- Replaces patterns.json → globalLimits, with more dimensions.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS global_limits (
  safe_address            TEXT PRIMARY KEY,

  -- Amount limits
  max_single_tx           NUMERIC(20, 2) NOT NULL DEFAULT 5000,
  max_hourly_volume       NUMERIC(20, 2) NOT NULL DEFAULT 10000,
  max_daily_volume        NUMERIC(20, 2) NOT NULL DEFAULT 20000,
  max_weekly_volume       NUMERIC(20, 2) NOT NULL DEFAULT 100000,
  max_daily_tx_count      INT           NOT NULL DEFAULT 50,

  -- Time restrictions
  -- Array of allowed UTC hours (0–23). Empty array = no restriction.
  allowed_hours_utc       INT[]         NOT NULL DEFAULT ARRAY[6,7,8,9,10,11,12,13,14,15,16,17,18,19,20],
  -- Array of allowed UTC day-of-week (0=Sun … 6=Sat). Empty = no restriction.
  allowed_days_utc        INT[]         NOT NULL DEFAULT ARRAY[1,2,3,4,5],

  -- Default action for unknown (first-time) recipients
  -- 'approve' | 'review' | 'block'
  unknown_recipient_action TEXT         NOT NULL DEFAULT 'review'
                            CHECK (unknown_recipient_action IN ('approve', 'review', 'block')),

  -- Per-user risk thresholds (override the hardcoded defaults in risk.ts)
  risk_threshold_approve  INT           NOT NULL DEFAULT 40,
  risk_threshold_block    INT           NOT NULL DEFAULT 70,

  -- If true, the agent learns from approved/rejected txs and updates patterns
  learning_enabled        BOOLEAN       NOT NULL DEFAULT true,

  updated_at              TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE OR REPLACE TRIGGER trg_global_limits_updated_at
  BEFORE UPDATE ON global_limits
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE global_limits ENABLE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────────────────────────
-- recipient_profiles  — per-recipient behavioral data per safe
-- Replaces patterns.json → recipients with much more detail.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS recipient_profiles (
  -- Identity
  address               TEXT          NOT NULL,
  safe_address          TEXT          NOT NULL,
  label                 TEXT,
  -- payroll | vendor | personal | exchange | defi | unknown
  category              TEXT          NOT NULL DEFAULT 'unknown',
  -- trusted | neutral | suspicious | blocked
  trust_level           TEXT          NOT NULL DEFAULT 'neutral'
                          CHECK (trust_level IN ('trusted', 'neutral', 'suspicious', 'blocked')),

  -- Volume statistics (learned from history)
  total_tx_count        INT           NOT NULL DEFAULT 0,
  total_volume          NUMERIC(20, 2) NOT NULL DEFAULT 0,
  avg_amount            NUMERIC(20, 2) NOT NULL DEFAULT 0,
  min_amount            NUMERIC(20, 2) NOT NULL DEFAULT 0,
  max_amount            NUMERIC(20, 2) NOT NULL DEFAULT 0,
  -- Standard deviation for anomaly detection
  stddev_amount         NUMERIC(20, 4) NOT NULL DEFAULT 0,

  -- Time patterns (learned)
  typical_hours_utc     INT[],        -- UTC hours this recipient is typically paid
  typical_days_of_week  INT[],        -- 0=Sun … 6=Sat
  avg_days_between_txs  NUMERIC(10, 2), -- average cadence in days

  -- Lifecycle
  first_seen            TIMESTAMPTZ,
  last_seen             TIMESTAMPTZ,

  -- Arbitrary per-recipient metadata the agent or user can set
  -- e.g. { "contract": true, "payment_terms": "net30", "notes": "..." }
  custom_attributes     JSONB         NOT NULL DEFAULT '{}',

  notes                 TEXT,

  updated_at            TIMESTAMPTZ   NOT NULL DEFAULT now(),

  PRIMARY KEY (address, safe_address)
);

CREATE INDEX IF NOT EXISTS idx_recipient_profiles_safe ON recipient_profiles (safe_address);
CREATE INDEX IF NOT EXISTS idx_recipient_profiles_trust ON recipient_profiles (safe_address, trust_level);

CREATE OR REPLACE TRIGGER trg_recipient_profiles_updated_at
  BEFORE UPDATE ON recipient_profiles
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE recipient_profiles ENABLE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────────────────────────
-- time_patterns  — 24×7 activity grid per safe
-- Rows are created on demand as activity is observed.
-- Lets the risk engine check "is this hour/day unusual for this user?"
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS time_patterns (
  safe_address    TEXT  NOT NULL,
  hour_utc        INT   NOT NULL CHECK (hour_utc    BETWEEN 0 AND 23),
  day_of_week     INT   NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),  -- 0=Sun

  -- Observed activity in this slot
  tx_count        INT           NOT NULL DEFAULT 0,
  total_volume    NUMERIC(20, 2) NOT NULL DEFAULT 0,

  -- Explicit override: NULL = learned default, true = always allow, false = always block
  is_allowed      BOOLEAN,

  PRIMARY KEY (safe_address, hour_utc, day_of_week)
);

CREATE INDEX IF NOT EXISTS idx_time_patterns_safe ON time_patterns (safe_address);

ALTER TABLE time_patterns ENABLE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────────────────────────
-- velocity_windows  — rolling spend windows per safe
-- Tracks cumulative volume across time buckets so the risk engine
-- can detect unusual spend spikes within any window.
-- window_type: 'hourly' | 'daily' | 'weekly' | 'monthly'
-- window_start: truncated to the start of the window period
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS velocity_windows (
  safe_address    TEXT        NOT NULL,
  window_type     TEXT        NOT NULL CHECK (window_type IN ('hourly', 'daily', 'weekly', 'monthly')),
  window_start    TIMESTAMPTZ NOT NULL,

  tx_count        INT           NOT NULL DEFAULT 0,
  total_volume    NUMERIC(20, 2) NOT NULL DEFAULT 0,

  -- Updated whenever a tx is processed in this window
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),

  PRIMARY KEY (safe_address, window_type, window_start)
);

CREATE INDEX IF NOT EXISTS idx_velocity_windows_safe ON velocity_windows (safe_address, window_type, window_start DESC);

CREATE OR REPLACE TRIGGER trg_velocity_windows_updated_at
  BEFORE UPDATE ON velocity_windows
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE velocity_windows ENABLE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────────────────────────
-- token_patterns  — per-token behavioral stats per safe
-- Tracks which tokens are "normal" for this user.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS token_patterns (
  safe_address      TEXT          NOT NULL,
  token_address     TEXT          NOT NULL,
  token_symbol      TEXT,

  total_tx_count    INT           NOT NULL DEFAULT 0,
  total_volume      NUMERIC(20, 2) NOT NULL DEFAULT 0,
  avg_amount        NUMERIC(20, 2) NOT NULL DEFAULT 0,
  max_amount        NUMERIC(20, 2) NOT NULL DEFAULT 0,

  -- true = user regularly uses this token; false = first time seen
  is_familiar       BOOLEAN       NOT NULL DEFAULT false,
  first_seen        TIMESTAMPTZ,
  last_used         TIMESTAMPTZ,

  updated_at        TIMESTAMPTZ   NOT NULL DEFAULT now(),

  PRIMARY KEY (safe_address, token_address)
);

CREATE INDEX IF NOT EXISTS idx_token_patterns_safe ON token_patterns (safe_address);

CREATE OR REPLACE TRIGGER trg_token_patterns_updated_at
  BEFORE UPDATE ON token_patterns
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE token_patterns ENABLE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────────────────────────
-- user_rules  — custom per-user screening rules
-- Each rule defines a condition and an action.  The risk engine
-- evaluates all active rules and applies their risk_score_delta.
--
-- rule_type examples and their conditions shape:
--   'amount_limit'       → { "max": "500", "token": "USDC" }
--   'recipient_block'    → { "address": "0x..." }
--   'recipient_whitelist'→ { "address": "0x..." }
--   'time_restriction'   → { "hours": [0,1,2,3], "days": [6,0] }
--   'velocity_limit'     → { "window": "hourly", "max_volume": "1000" }
--   'token_restriction'  → { "token": "0x...", "action": "block" }
--   'custom'             → any JSONB the agent or user defines
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_rules (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  safe_address    TEXT          NOT NULL,
  name            TEXT          NOT NULL,
  description     TEXT,

  rule_type       TEXT          NOT NULL
                    CHECK (rule_type IN (
                      'amount_limit', 'recipient_block', 'recipient_whitelist',
                      'time_restriction', 'velocity_limit', 'token_restriction', 'custom'
                    )),

  -- Flexible condition payload; shape depends on rule_type (see above).
  conditions      JSONB         NOT NULL DEFAULT '{}',

  -- What to do when this rule triggers (can be overridden by risk thresholds)
  action          TEXT          NOT NULL DEFAULT 'review'
                    CHECK (action IN ('approve', 'review', 'block')),

  -- Added to (positive) or subtracted from (negative) the risk score
  risk_score_delta INT          NOT NULL DEFAULT 0,

  is_active       BOOLEAN       NOT NULL DEFAULT true,

  -- Lower number = evaluated first; useful for whitelist rules that should short-circuit
  priority        INT           NOT NULL DEFAULT 100,

  created_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_rules_safe     ON user_rules (safe_address, is_active, priority);

CREATE OR REPLACE TRIGGER trg_user_rules_updated_at
  BEFORE UPDATE ON user_rules
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE user_rules ENABLE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────────────────────────
-- daily_stats  — per-safe daily aggregates
-- Enhanced with outcome breakdown so patterns can learn from
-- what was approved vs. rejected.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS daily_stats (
  date                DATE          NOT NULL,
  safe_address        TEXT          NOT NULL,

  tx_count            INT           NOT NULL DEFAULT 0,
  approved_count      INT           NOT NULL DEFAULT 0,
  reviewed_count      INT           NOT NULL DEFAULT 0,
  rejected_count      INT           NOT NULL DEFAULT 0,

  total_volume        NUMERIC(20, 2) NOT NULL DEFAULT 0,
  approved_volume     NUMERIC(20, 2) NOT NULL DEFAULT 0,

  PRIMARY KEY (date, safe_address)
);

CREATE INDEX IF NOT EXISTS idx_daily_stats_safe ON daily_stats (safe_address, date DESC);

ALTER TABLE daily_stats ENABLE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────────────────────────
-- behavioral_events  — event log for pattern learning
-- Every transaction outcome is recorded here so the agent can
-- replay history to rebuild or adjust patterns at any time.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS behavioral_events (
  id                UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  safe_address      TEXT          NOT NULL,

  -- Foreign key to transactions (nullable: events can exist without a tx)
  tx_id             TEXT          REFERENCES transactions (id) ON DELETE SET NULL,

  -- 'tx_proposed' | 'auto_approved' | 'auto_blocked' | 'sent_for_review'
  -- | 'manually_approved' | 'manually_rejected' | 'pattern_updated' | 'rule_triggered'
  event_type        TEXT          NOT NULL,

  recipient_address TEXT,
  amount            NUMERIC(20, 2),
  token_address     TEXT,
  token_symbol      TEXT,

  risk_score        INT,
  risk_verdict      TEXT,
  risk_reasons      TEXT[],

  -- UUIDs of user_rules that triggered for this event
  triggered_rules   UUID[],

  -- Any extra context the agent wants to store (e.g. anomaly details)
  metadata          JSONB         NOT NULL DEFAULT '{}',

  created_at        TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_behavioral_events_safe    ON behavioral_events (safe_address, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_behavioral_events_tx      ON behavioral_events (tx_id);
CREATE INDEX IF NOT EXISTS idx_behavioral_events_type    ON behavioral_events (safe_address, event_type);
CREATE INDEX IF NOT EXISTS idx_behavioral_events_recipient ON behavioral_events (safe_address, recipient_address);

ALTER TABLE behavioral_events ENABLE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────────────────────────
-- campaigns  — token giveaway / reward campaigns
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS campaigns (
  id              TEXT        PRIMARY KEY,  -- e.g. "genesis-100"
  name            TEXT        NOT NULL,
  description     TEXT,
  token_amount    NUMERIC(20, 2) NOT NULL,
  max_claims      INT         NOT NULL,
  requirements    JSONB       NOT NULL DEFAULT '{}',
  -- e.g. {"tg_connected": true, "username_claimed": true}
  starts_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  ends_at         TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE TRIGGER trg_campaigns_updated_at
  BEFORE UPDATE ON campaigns
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────────────────────────
-- campaign_claims  — per-user claim per campaign
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS campaign_claims (
  campaign_id     TEXT        NOT NULL REFERENCES campaigns (id) ON DELETE CASCADE,
  safe_address    TEXT        NOT NULL,
  claimed_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  token_amount    NUMERIC(20, 2) NOT NULL,  -- locked at claim time
  status          TEXT        NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'paid', 'failed')),
  tx_hash         TEXT,
  paid_at         TIMESTAMPTZ,
  PRIMARY KEY (campaign_id, safe_address)
);

CREATE INDEX IF NOT EXISTS idx_campaign_claims_safe     ON campaign_claims (safe_address);
CREATE INDEX IF NOT EXISTS idx_campaign_claims_campaign ON campaign_claims (campaign_id, status);

ALTER TABLE campaign_claims ENABLE ROW LEVEL SECURITY;

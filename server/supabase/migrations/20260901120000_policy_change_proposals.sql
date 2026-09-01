-- ─────────────────────────────────────────────────────────────
-- policy_change_proposals (#144 Phase 1)
--
-- The policy plane is agent-only; the client may only PROPOSE a
-- limits/thresholds change. A proposal is applied exclusively by the
-- agent (confirm_policy_change) after the user confirms on Telegram —
-- the independent channel the compromised-web-session threat model
-- requires. No email fallback, no time-delay auto-confirm: a proposal
-- that nobody positively confirms expires.
--
-- Concurrency: resolution is an atomic conditional transition
-- (status = 'pending' in the UPDATE's WHERE), so a concurrent
-- confirm + reject can never both act. One pending proposal per Safe
-- (partial unique index) keeps the Telegram conversation unambiguous.
-- ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS policy_change_proposals (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  safe_address  TEXT        NOT NULL,

  -- Row-shaped global_limits patch (snake_case columns), already validated
  -- at creation; re-validated against the live row at apply.
  patch         JSONB       NOT NULL,

  proposed_via  TEXT        NOT NULL CHECK (proposed_via IN ('client', 'agent')),
  status        TEXT        NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending', 'confirmed', 'rejected', 'expired')),

  expires_at    TIMESTAMPTZ NOT NULL,
  confirmed_via TEXT,
  reject_reason TEXT,

  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at   TIMESTAMPTZ
);

-- One ACTIVE proposal per Safe — creation is 409 while one is pending.
CREATE UNIQUE INDEX IF NOT EXISTS policy_change_proposals_one_pending
  ON policy_change_proposals (safe_address)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_policy_change_proposals_safe
  ON policy_change_proposals (safe_address, created_at DESC);

-- B4: durable rejection state machine (issue #88).
-- `rejected` becomes "confirmed on-chain only"; the in-flight lifecycle is
-- tracked explicitly so a failed cancel is retried instead of silently
-- parking the Safe nonce.
--   rejection_status: requested | cancel_signing | cancel_submitted
--                   | rejected_confirmed | failed_retryable | superseded
alter table transactions
  add column if not exists rejection_status text,
  add column if not exists cancel_safe_tx_hash text,
  add column if not exists cancel_tx_hash text,
  add column if not exists cancel_attempts integer not null default 0,
  add column if not exists cancel_last_error text,
  add column if not exists cancel_next_retry_at timestamptz;

-- Backfill: rows already rejected under the old semantics are terminal.
update transactions
  set rejection_status = 'rejected_confirmed'
  where rejected = true and rejection_status is null;

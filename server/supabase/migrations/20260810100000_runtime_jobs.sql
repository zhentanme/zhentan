-- D0.2: durable job protocol (issue #93).
-- The work model the runtime (D1) will pull from, landed while still
-- single-process: runtime_jobs + per-transaction version (a domain rule,
-- not a generic updated_at) + the txId→Telegram-messageId map moved out
-- of process memory.

-- ────────────────────────────────────────────────────────────
-- transactions.version — screening decisions and signatures are valid
-- only against the transaction version they were computed for.
-- ────────────────────────────────────────────────────────────
alter table transactions
  add column if not exists version integer not null default 1;

-- The version-increment DOMAIN RULE, enforced at the data layer so every
-- write path obeys it atomically. Bumping columns: payload/hash change,
-- nonce assignment, user signatures, user approval/rejection lifecycle,
-- decision-invalidating screening change, owner/threshold change,
-- supersession (via rejection_status). Metadata-only writes (display
-- fields, risk output, cancel bookkeeping, execution terminals, leases,
-- notification ids) deliberately do NOT bump.
create or replace function bump_transaction_version()
returns trigger
language plpgsql
as $$
begin
  if new.to_address        is distinct from old.to_address
  or new.amount            is distinct from old.amount
  or new.token             is distinct from old.token
  or new.token_address     is distinct from old.token_address
  or new.to_token_address  is distinct from old.to_token_address
  or new.user_op           is distinct from old.user_op
  or new.partial_signatures is distinct from old.partial_signatures
  or new.safe_tx           is distinct from old.safe_tx
  or new.safe_tx_hash      is distinct from old.safe_tx_hash
  or new.safe_nonce        is distinct from old.safe_nonce
  or new.user_signature    is distinct from old.user_signature
  or new.user_signatures   is distinct from old.user_signatures
  or new.rejection_signature is distinct from old.rejection_signature
  or new.rejected          is distinct from old.rejected
  or new.rejection_status  is distinct from old.rejection_status
  or new.in_review         is distinct from old.in_review
  or new.screening_disabled is distinct from old.screening_disabled
  or new.owner_addresses   is distinct from old.owner_addresses
  or new.threshold         is distinct from old.threshold
  then
    new.version := old.version + 1;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_transactions_bump_version on transactions;
create trigger trg_transactions_bump_version
  before update on transactions
  for each row
  execute function bump_transaction_version();

-- ────────────────────────────────────────────────────────────
-- runtime_jobs — pull-model work queue. Identity-shaped from day one
-- (agent_instance_id / safe_address scope / credential_version) so D0.3
-- and P7/F1 change no contracts.
-- ────────────────────────────────────────────────────────────
create table if not exists runtime_jobs (
  id uuid primary key default gen_random_uuid(),
  schema_version integer not null default 1,
  kind text not null check (kind in ('screen', 'sign')),
  -- Required on sign jobs: the signing authority applies different
  -- authorization rules per purpose.
  purpose text check (purpose in ('execution', 'rejection', 'draft_finalization')),
  safe_address text not null,
  tx_id text not null,
  tx_version integer not null,
  payload jsonb not null default '{}',
  -- Hash of the canonical payload, computed at enqueue; results must echo it.
  input_hash text not null,
  credential_version integer not null default 1,
  status text not null default 'pending'
    check (status in ('pending', 'leased', 'succeeded', 'failed', 'dead_letter', 'void')),
  agent_instance_id text,
  lease_token text,
  lease_expires_at timestamptz,
  attempt_count integer not null default 0,
  next_retry_at timestamptz,
  -- Result (idempotent + verifiable)
  result jsonb,
  result_input_hash text,
  result_policy_version text,
  result_agent_instance_id text,
  result_lease_token text,
  result_submitted_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint sign_requires_purpose check (kind <> 'sign' or purpose is not null),
  constraint screen_has_no_purpose check (kind <> 'screen' or purpose is null)
);

create index if not exists idx_runtime_jobs_pull
  on runtime_jobs (status, safe_address, next_retry_at)
  where status in ('pending', 'leased');
create index if not exists idx_runtime_jobs_tx on runtime_jobs (tx_id);

-- One ACTIVE job per (tx, kind, purpose) — enqueue is idempotent.
create unique index if not exists uq_runtime_jobs_active
  on runtime_jobs (tx_id, kind, coalesce(purpose, ''))
  where status in ('pending', 'leased');

-- ────────────────────────────────────────────────────────────
-- notification_messages — txId→Telegram messageId, formerly an in-memory
-- Map (server/src/notify.ts). resolve_notification must survive restarts
-- and the D1 process split.
-- ────────────────────────────────────────────────────────────
create table if not exists notification_messages (
  tx_id text not null,
  channel text not null default 'telegram',
  chat_id text not null,
  message_id text not null,
  created_at timestamptz not null default now(),
  primary key (tx_id, channel)
);

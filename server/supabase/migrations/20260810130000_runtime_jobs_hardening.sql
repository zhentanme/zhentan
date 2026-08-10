-- D0.2 hardening (PR #120 review):
--  1. submit_runtime_job_result — version validation and result persistence
--     as ONE atomic operation (locks the job row and the transaction row,
--     so a concurrent domain-event bump can no longer land a stale result).
--  2. void_stale_runtime_jobs — active jobs whose transaction moved on are
--     voided in one statement (sweep + enqueue-replacement path).
--  3. Decision-invalidating POLICY changes (user rules, limits, screening
--     mode) propagate into affected transaction versions, riding the same
--     single invalidation mechanism as every other domain event. Learned
--     pattern updates (recipient/time/token/velocity) are continuous
--     background learning, not policy edits, and deliberately do not bump.

-- ────────────────────────────────────────────────────────────
-- 1. Atomic result submission
-- ────────────────────────────────────────────────────────────
create or replace function submit_runtime_job_result(
  p_job_id uuid,
  p_lease_token text,
  p_target_status text,
  p_result jsonb,
  p_input_hash text,
  p_policy_version text,
  p_agent_instance_id text,
  p_error text default null,
  p_next_retry_at timestamptz default null
) returns text
language plpgsql
as $$
declare
  v_job runtime_jobs%rowtype;
  v_tx_version integer;
  v_now timestamptz := now();
begin
  if p_target_status not in ('succeeded', 'failed', 'pending', 'dead_letter') then
    return 'invalid_target_status';
  end if;

  select * into v_job from runtime_jobs where id = p_job_id for update;
  if not found then
    return 'wrong_job';
  end if;
  if v_job.status in ('succeeded', 'failed') and v_job.result_lease_token = p_lease_token then
    return 'duplicate_noop';
  end if;
  if v_job.status <> 'leased' or v_job.lease_token is distinct from p_lease_token then
    return 'lease_mismatch';
  end if;
  if v_job.lease_expires_at is null or v_job.lease_expires_at <= v_now then
    return 'lease_expired';
  end if;

  -- Lock the transaction row: a concurrent domain-event UPDATE (which would
  -- bump version) blocks until we commit, making check+write atomic.
  select version into v_tx_version from transactions where id = v_job.tx_id for update;
  if v_tx_version is not null and v_tx_version <> v_job.tx_version then
    update runtime_jobs set
      status = 'void',
      result = p_result,
      result_input_hash = p_input_hash,
      result_policy_version = p_policy_version,
      result_agent_instance_id = p_agent_instance_id,
      result_lease_token = p_lease_token,
      result_submitted_at = v_now,
      last_error = coalesce(p_error, 'transaction version moved on'),
      updated_at = v_now
    where id = p_job_id;
    return 'void';
  end if;

  update runtime_jobs set
    status = p_target_status,
    result = p_result,
    result_input_hash = p_input_hash,
    result_policy_version = p_policy_version,
    result_agent_instance_id = p_agent_instance_id,
    result_lease_token = p_lease_token,
    result_submitted_at = v_now,
    last_error = p_error,
    next_retry_at = p_next_retry_at,
    lease_token = case when p_target_status = 'pending' then null else lease_token end,
    lease_expires_at = case when p_target_status = 'pending' then null else lease_expires_at end,
    updated_at = v_now
  where id = p_job_id;
  return 'accept';
end;
$$;

-- ────────────────────────────────────────────────────────────
-- 2. Void active jobs whose transaction moved on
-- ────────────────────────────────────────────────────────────
create or replace function void_stale_runtime_jobs() returns integer
language plpgsql
as $$
declare
  v_count integer;
begin
  update runtime_jobs j set
    status = 'void',
    last_error = 'transaction version moved on',
    updated_at = now()
  from transactions t
  where j.tx_id = t.id
    and j.status in ('pending', 'leased')
    and j.tx_version <> t.version;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ────────────────────────────────────────────────────────────
-- 3. Policy changes bump affected transaction versions
-- ────────────────────────────────────────────────────────────
create or replace function bump_pending_tx_versions(p_safe_address text) returns void
language plpgsql
as $$
begin
  -- Direct version writes pass through bump_transaction_version untouched
  -- (no bump column changes), so this composes with the domain trigger.
  update transactions
  set version = version + 1
  where safe_address = lower(p_safe_address)
    and executed_at is null;
end;
$$;

create or replace function policy_change_bump_tx_versions() returns trigger
language plpgsql
as $$
declare
  v_safe text;
begin
  v_safe := coalesce(new.safe_address, old.safe_address);
  -- No-op writes (same values) must not churn versions.
  if tg_op = 'UPDATE' and row(new.*) is not distinct from row(old.*) then
    return coalesce(new, old);
  end if;
  perform bump_pending_tx_versions(v_safe);
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_user_rules_policy_bump on user_rules;
create trigger trg_user_rules_policy_bump
  after insert or update or delete on user_rules
  for each row execute function policy_change_bump_tx_versions();

drop trigger if exists trg_global_limits_policy_bump on global_limits;
create trigger trg_global_limits_policy_bump
  after insert or update or delete on global_limits
  for each row execute function policy_change_bump_tx_versions();

-- user_settings: only the screening mode is decision-invalidating —
-- last_check/decisions/telegram fields churn constantly.
create or replace function screening_mode_bump_tx_versions() returns trigger
language plpgsql
as $$
begin
  if new.screening_mode is distinct from old.screening_mode then
    perform bump_pending_tx_versions(new.safe_address);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_user_settings_policy_bump on user_settings;
create trigger trg_user_settings_policy_bump
  after update on user_settings
  for each row execute function screening_mode_bump_tx_versions();

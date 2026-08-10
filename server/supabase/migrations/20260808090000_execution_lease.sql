-- D0: DB execution lease (issue #91).
-- Replaces the per-process in-memory `inFlight` Set: correctness no longer
-- rests on PM2 `instances: 1` for the execute path. A claim is one atomic
-- conditional UPDATE; an expired lease is reclaimable.
alter table transactions
  add column if not exists execution_lease_owner text,
  add column if not exists execution_lease_expires_at timestamptz;

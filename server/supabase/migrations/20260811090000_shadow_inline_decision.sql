-- D2 review (#123): preserve the COMPLETE inline decision on the shadow job
-- at enqueue — including triggered_rules, which transactions does not store.
-- The comparator reads this instead of re-querying the transaction, so the
-- comparison is against the decision as computed at enqueue time (immune to
-- later mutations) and covers every RiskResult field.
alter table runtime_jobs
  add column if not exists inline_decision jsonb;

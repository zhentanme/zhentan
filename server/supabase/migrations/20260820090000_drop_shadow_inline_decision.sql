-- D2 shadow screening was retired after its gate passed (divergence 0) —
-- screen jobs are authoritative since D3. No producer writes inline_decision
-- and no reader consumes it; drop the column with the comparator.
alter table runtime_jobs
  drop column if exists inline_decision;

-- #142/#143: structured risk on requests — same shape transactions carry.
-- The engine's verdict + signal list were previously flattened into the
-- free-text risk_notes ("REVIEW: reason1; reason2"), which the client cannot
-- reliably unflatten; persisting them structurally lets request surfaces
-- render the same screening panel as transactions. risk_notes stays for
-- back-compat and the agent-note suffix.
ALTER TABLE requests
  ADD COLUMN IF NOT EXISTS risk_verdict TEXT,
  ADD COLUMN IF NOT EXISTS risk_reasons TEXT[];

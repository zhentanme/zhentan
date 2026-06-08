-- Scope invoices to a single owner Safe.
-- Before this, the invoices table had no owner column, so GET /invoices
-- returned every user's invoices. Add safe_address + index; rows left NULL
-- are unowned and are never returned by the scoped getInvoices() query.

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS safe_address TEXT;

CREATE INDEX IF NOT EXISTS idx_invoices_safe_address ON invoices (safe_address);

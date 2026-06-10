-- Generalize invoices into "requests".
-- A request is any incoming payment ask routed through the agent: a parsed
-- invoice OR a general transfer instruction ("send 50 USDC to 0x...").
-- Invoice-specific columns (invoice_number, billed_from, services, ...) stay
-- and are simply NULL for non-invoice requests.

ALTER TABLE IF EXISTS invoices RENAME TO requests;

-- 'invoice' = parsed invoice document; 'transfer' = general transaction instruction
ALTER TABLE requests ADD COLUMN IF NOT EXISTS request_type TEXT NOT NULL DEFAULT 'invoice';

-- Free-text instruction/summary from the agent (e.g. the user's original ask)
ALTER TABLE requests ADD COLUMN IF NOT EXISTS description TEXT;

ALTER INDEX IF EXISTS idx_invoices_queued_at    RENAME TO idx_requests_queued_at;
ALTER INDEX IF EXISTS idx_invoices_status       RENAME TO idx_requests_status;
ALTER INDEX IF EXISTS idx_invoices_safe_address RENAME TO idx_requests_safe_address;

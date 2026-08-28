-- #142/#143: explicit token icon URLs stamped at build/queue time, so every
-- surface resolves icons uniformly (explicit URL first, symbol table second).
-- transactions.token_icon_url (sell side) already exists — stamped by the
-- client propose flow; agent drafts start stamping it too. The buy side of a
-- swap had NO icon field anywhere, which is why the trade dialog's second
-- icon only rendered for tokens in the client's static fallback table.
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS to_token_icon_url TEXT;
ALTER TABLE requests
  ADD COLUMN IF NOT EXISTS token_icon_url TEXT,
  ADD COLUMN IF NOT EXISTS to_token_icon_url TEXT;

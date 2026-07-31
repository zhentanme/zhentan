-- Kind-based transaction pipeline (issue #69).
--
-- transactions.to_token_address: swaps store the token being BOUGHT so deep
-- analysis can scan the actual risk surface (the sell token is already the
-- user's). NULL for every other kind.
--
-- requests.kind: how a request SETTLES on-chain ('transfer' | 'swap'),
-- orthogonal to request_type (presentation — an invoice is a transfer with
-- billing metadata). Swap requests carry their pair + slippage.
--
-- Note: draft rows (agent-proposed, nonce deferred to user-sign time) need
-- NO column — a draft is exactly tx_type='safetx' AND safe_tx_hash IS NULL,
-- derived at read time so it can never drift from the row's actual state.

ALTER TABLE transactions ADD COLUMN IF NOT EXISTS to_token_address TEXT;

ALTER TABLE requests ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'transfer';
ALTER TABLE requests ADD COLUMN IF NOT EXISTS from_token TEXT;
ALTER TABLE requests ADD COLUMN IF NOT EXISTS to_token TEXT;
ALTER TABLE requests ADD COLUMN IF NOT EXISTS slippage NUMERIC;

-- 2-of-3 Safe + Safe Transaction Service support.
--
-- Transactions gain a tx_type discriminator:
--   '4337'   — legacy ERC-4337 userOp flow (Pimlico bundler, gasless)
--   'safetx' — standard SafeTx (EIP-712) proposed to the Safe Transaction
--              Service; agent confirms + relays execTransaction.
--
-- user_details gains the 2-of-3 owner model: the user's second key
-- (external wallet), the canonical owner set, deployment state, and the
-- per-user execution mode toggle ("Safe app compatibility" in settings).

alter table transactions
  add column if not exists tx_type text not null default '4337',
  add column if not exists safe_tx_hash text,
  add column if not exists safe_tx jsonb,
  add column if not exists safe_nonce bigint,
  add column if not exists user_signature text,
  add column if not exists rejection_signature text,
  add column if not exists confirmations jsonb;

create index if not exists transactions_safe_tx_hash_idx
  on transactions (safe_tx_hash)
  where safe_tx_hash is not null;

alter table user_details
  add column if not exists external_wallet_address text,
  add column if not exists safe_owners text[],
  add column if not exists safe_threshold int,
  add column if not exists safe_deployed boolean not null default false,
  add column if not exists safe_deploy_tx_hash text,
  add column if not exists execution_mode text not null default 'safetx';

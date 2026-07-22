-- Wallet profiles + immutable creation snapshot.
--
-- creation_* columns are the account's birth certificate: the exact inputs
-- that derived safe_address. Written once at creation (or by the verified
-- backfill), then frozen by trigger — safe_owners/safe_threshold keep
-- mirroring the LIVE (chain) state, so after upgrades the snapshot is the
-- only way to re-derive and audit the address.
--
-- transactions.user_signatures carries additional user co-signatures
-- (beyond user_signature) for relay-only execution: when the user's own
-- keys meet the threshold, the agent relays without signing.

alter table user_details
  add column if not exists creation_owners text[],
  add column if not exists creation_threshold int,
  add column if not exists creation_salt_nonce text not null default '0';

alter table transactions
  add column if not exists user_signatures jsonb;

-- Freeze the birth certificate: once set, creation_* and derivation_version
-- can never change.
create or replace function protect_creation_snapshot()
returns trigger
language plpgsql
as $$
begin
  if old.creation_owners is not null
     and new.creation_owners is distinct from old.creation_owners then
    raise exception 'creation_owners is immutable once set';
  end if;
  if old.creation_threshold is not null
     and new.creation_threshold is distinct from old.creation_threshold then
    raise exception 'creation_threshold is immutable once set';
  end if;
  if old.creation_owners is not null
     and new.creation_salt_nonce is distinct from old.creation_salt_nonce then
    raise exception 'creation_salt_nonce is immutable once the snapshot is set';
  end if;
  if old.derivation_version is not null
     and new.derivation_version is distinct from old.derivation_version then
    raise exception 'derivation_version is immutable once set';
  end if;
  return new;
end;
$$;

drop trigger if exists protect_creation_snapshot on user_details;
create trigger protect_creation_snapshot
  before update on user_details
  for each row
  execute function protect_creation_snapshot();

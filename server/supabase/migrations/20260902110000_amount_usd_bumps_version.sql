-- #144 follow-up: amount_usd is now a SCREENED INPUT, not display metadata.
-- The engine scores dollars (server-priced at intake) and refuses to guess
-- when the value is unknown — so a change to amount_usd changes the decision
-- and must invalidate in-flight screen/sign work exactly like a payload
-- change. Recreates bump_transaction_version with amount_usd in the bump
-- list; everything else is byte-identical to 20260810100000.
create or replace function bump_transaction_version()
returns trigger
language plpgsql
as $$
begin
  if new.to_address        is distinct from old.to_address
  or new.amount            is distinct from old.amount
  or new.amount_usd        is distinct from old.amount_usd
  or new.token             is distinct from old.token
  or new.token_address     is distinct from old.token_address
  or new.to_token_address  is distinct from old.to_token_address
  or new.user_op           is distinct from old.user_op
  or new.partial_signatures is distinct from old.partial_signatures
  or new.safe_tx           is distinct from old.safe_tx
  or new.safe_tx_hash      is distinct from old.safe_tx_hash
  or new.safe_nonce        is distinct from old.safe_nonce
  or new.user_signature    is distinct from old.user_signature
  or new.user_signatures   is distinct from old.user_signatures
  or new.rejection_signature is distinct from old.rejection_signature
  or new.rejected          is distinct from old.rejected
  or new.rejection_status  is distinct from old.rejection_status
  or new.in_review         is distinct from old.in_review
  or new.screening_disabled is distinct from old.screening_disabled
  or new.owner_addresses   is distinct from old.owner_addresses
  or new.threshold         is distinct from old.threshold
  then
    new.version := old.version + 1;
  end if;
  return new;
end;
$$;

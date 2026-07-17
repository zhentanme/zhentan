-- Versioned Safe address derivation.
--
--   1 = legacy permissionless initializer (Safe4337Module enabled) — every
--       account created before the SafeTx-only refactor.
--   2 = vanilla stock Safe (protocol-kit initializer, CompatibilityFallbackHandler,
--       no modules) — default for new accounts (server config SAFE_DERIVATION_VERSION).
--
-- The stored safe_address is always cross-checked against re-derivation with
-- this version before deploys. v1 can be retired once no active users remain on it.

alter table user_details
  add column if not exists derivation_version int;

-- All pre-existing accounts were derived with the v1 (4337-module) initializer.
update user_details
  set derivation_version = 1
  where derivation_version is null;

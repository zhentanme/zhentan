-- RFC 8628 user codes for Telegram linking (#134 follow-up).
--
-- The deep link (verification_uri_complete) stays the same-device path; the
-- user code is the standard cross-device one: a short, human-transcribable
-- code typed at the stable /link page inside an authenticated session.
-- It rides the SAME telegram_link_codes row as the long code — same TTL,
-- same idempotent re-issue, and single-use consumption kills both at once
-- (complete_telegram_link marks the row used either way).
--
-- Low entropy is safe only because entry is authenticated and attempt-
-- limited (RFC 8628 §5.1): lookups go through the hash, and the server
-- rate-limits verification attempts per account.

ALTER TABLE telegram_link_codes ADD COLUMN IF NOT EXISTS user_code TEXT;
ALTER TABLE telegram_link_codes ADD COLUMN IF NOT EXISTS user_code_hash TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS telegram_link_codes_user_code_hash_key
  ON telegram_link_codes (user_code_hash);

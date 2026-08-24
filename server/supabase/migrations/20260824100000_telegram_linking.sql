-- Telegram chat-initiated linking (#134).
--
-- Replaces the Privy-link + bot-start two-step with a device-grant-style code
-- flow: the chat proves possession of the Telegram side, the Privy-authed
-- completion proves the account side, and the binding is their intersection.
--
-- This migration OWNS the destination identity/binding schema (#101's E2
-- settings split defers its Telegram columns to it):
--
--   telegram_links       — the binding. Trusted Telegram USER identity
--                          (from.id) and the private CHAT id for delivery are
--                          distinct columns: they coincide in a DM but diverge
--                          in groups, and only private chats are bindable.
--                          UNIQUE(telegram_user_id) enforces strictly one
--                          account per Telegram at the DB level, not in route
--                          logic; UNIQUE(safe_address) keeps the mapping 1:1.
--   telegram_link_codes  — one active enrollment code per Telegram user
--                          (structural: the user id IS the primary key), with
--                          single-use consumption and a per-chat issuance
--                          rate-limit window.
--
-- The legacy columns (user_details.telegram_id, user_settings.telegram_chat_id,
-- user_settings.bot_connected) are backfilled FROM here and no longer read or
-- written by the server; they are dropped in a follow-up migration once the
-- deploy that stops writing them is live everywhere.

-- ─────────────────────────────────────────────────────────────
-- telegram_links — the binding
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS telegram_links (
  telegram_user_id   TEXT PRIMARY KEY,        -- Telegram from.id (identity)
  safe_address       TEXT NOT NULL UNIQUE,    -- lowercase; 1:1 with the Telegram user
  telegram_chat_id   TEXT NOT NULL,           -- private-chat id (delivery destination)
  telegram_username  TEXT,
  telegram_name      TEXT,
  linked_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE telegram_links ENABLE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────────────────────────
-- telegram_link_codes — enrollment codes (device-grant shape)
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS telegram_link_codes (
  telegram_user_id   TEXT PRIMARY KEY,        -- one active code per Telegram user
  -- The code is returned verbatim on repeat issuance calls (idempotent
  -- re-issue → the bot repeats the identical message); consumption looks the
  -- row up by hash so the attacker-controllable input path never does an
  -- indexed comparison against the secret itself.
  code               TEXT NOT NULL,
  code_hash          TEXT NOT NULL UNIQUE,    -- sha256 hex of code
  telegram_chat_id   TEXT NOT NULL,
  telegram_username  TEXT,
  telegram_name      TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at         TIMESTAMPTZ NOT NULL,
  used_at            TIMESTAMPTZ,
  -- Issuance rate limit: fresh code GENERATIONS per window (idempotent
  -- re-reads of an active code are free).
  window_started_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  window_count       INT NOT NULL DEFAULT 1
);

ALTER TABLE telegram_link_codes ENABLE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────────────────────────
-- Backfill from the legacy columns.
-- Duplicate telegram_id values can exist (the same Telegram linked to two
-- accounts via Privy at different times): the most recently updated link wins —
-- the newest Privy link was the last human action. The legacy flow only ever
-- linked private chats, where chat id == user id, hence the COALESCE fallback.
-- ─────────────────────────────────────────────────────────────
INSERT INTO telegram_links (telegram_user_id, safe_address, telegram_chat_id, linked_at)
SELECT DISTINCT ON (ud.telegram_id)
  ud.telegram_id,
  lower(ud.safe_address),
  COALESCE(us.telegram_chat_id, ud.telegram_id),
  ud.updated_at
FROM user_details ud
LEFT JOIN user_settings us ON us.safe_address = ud.safe_address
WHERE ud.telegram_id IS NOT NULL AND ud.telegram_id <> ''
ORDER BY ud.telegram_id, ud.updated_at DESC
ON CONFLICT DO NOTHING;

-- ─────────────────────────────────────────────────────────────
-- complete_telegram_link — atomic completion (link / relink / no-op).
--
-- Single-use consumption and the relink re-point happen in ONE transaction:
-- the UNIQUE constraints hold throughout, so under concurrent completions
-- exactly one writer wins. The losing account's screening consequence
-- (screening_mode := false) rides the same transaction — the
-- propagate-policy-edit trigger bumps its pending transactions' versions, so
-- a mid-flight runtime decision can never land stale across the re-point.
--
-- p_confirm_relink guards the ONE branch that degrades another account: a
-- relink away from a different Safe is refused (code left unconsumed) until
-- the completion page re-submits with explicit, non-defaulted consent.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION complete_telegram_link(
  p_code_hash TEXT,
  p_safe_address TEXT,
  p_confirm_relink BOOLEAN DEFAULT FALSE
) RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_safe TEXT := lower(p_safe_address);
  v_code telegram_link_codes%ROWTYPE;
  v_old_tg telegram_links%ROWTYPE;    -- existing binding of this Telegram user
  v_old_safe telegram_links%ROWTYPE;  -- existing binding of the target account
BEGIN
  -- Lock the code row: concurrent completions of the same code serialize here,
  -- and the loser re-reads it as consumed.
  SELECT * INTO v_code
  FROM telegram_link_codes
  WHERE code_hash = p_code_hash AND used_at IS NULL AND expires_at > now()
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'invalid_code');
  END IF;

  SELECT * INTO v_old_tg FROM telegram_links
    WHERE telegram_user_id = v_code.telegram_user_id FOR UPDATE;
  SELECT * INTO v_old_safe FROM telegram_links
    WHERE safe_address = v_safe FOR UPDATE;

  -- Already linked to THIS account: idempotent no-op (consume the code,
  -- refresh delivery metadata — the chat id or handle may have changed).
  IF v_old_tg.telegram_user_id IS NOT NULL AND v_old_tg.safe_address = v_safe THEN
    UPDATE telegram_link_codes SET used_at = now()
      WHERE telegram_user_id = v_code.telegram_user_id;
    UPDATE telegram_links SET
      telegram_chat_id = v_code.telegram_chat_id,
      telegram_username = COALESCE(v_code.telegram_username, telegram_username),
      telegram_name = COALESCE(v_code.telegram_name, telegram_name)
      WHERE telegram_user_id = v_code.telegram_user_id;
    RETURN jsonb_build_object('status', 'already_linked');
  END IF;

  -- Linked to ANOTHER account: refuse without explicit consent, leaving the
  -- code unconsumed so the confirmed re-submit can use it.
  IF v_old_tg.telegram_user_id IS NOT NULL AND NOT p_confirm_relink THEN
    RETURN jsonb_build_object(
      'status', 'needs_relink_confirmation',
      'previous_safe_address', v_old_tg.safe_address
    );
  END IF;

  -- Consume + re-point in one shot.
  UPDATE telegram_link_codes SET used_at = now()
    WHERE telegram_user_id = v_code.telegram_user_id;
  DELETE FROM telegram_links
    WHERE telegram_user_id = v_code.telegram_user_id OR safe_address = v_safe;
  INSERT INTO telegram_links
    (telegram_user_id, safe_address, telegram_chat_id, telegram_username, telegram_name)
  VALUES
    (v_code.telegram_user_id, v_safe, v_code.telegram_chat_id,
     v_code.telegram_username, v_code.telegram_name);

  -- Losing account (relink): full unlink semantics — it needs a human channel
  -- for REVIEW resolution it no longer has, so screening drops to manual.
  IF v_old_tg.telegram_user_id IS NOT NULL THEN
    UPDATE user_settings SET screening_mode = FALSE
      WHERE safe_address = v_old_tg.safe_address AND screening_mode = TRUE;
    RETURN jsonb_build_object(
      'status', 'relinked',
      'previous_safe_address', v_old_tg.safe_address,
      'previous_chat_id', v_old_tg.telegram_chat_id
    );
  END IF;

  RETURN jsonb_build_object(
    'status', 'linked',
    -- Set when the ACCOUNT previously had a different Telegram (it re-pointed
    -- itself; the completer owns both sides, so no consent gate applies).
    'replaced_telegram_user_id', v_old_safe.telegram_user_id,
    'replaced_chat_id', v_old_safe.telegram_chat_id
  );
EXCEPTION WHEN unique_violation THEN
  -- A concurrent completion won the race for this Telegram user or account.
  -- The transaction rolls back (code unconsumed); the caller retries and sees
  -- the relink path.
  RETURN jsonb_build_object('status', 'conflict');
END;
$$;

-- ─────────────────────────────────────────────────────────────
-- unlink_telegram — atomic server-side unlink: binding cleared ⇔ screening
-- consequence applied, in one transaction (no more three-way client-side
-- best-effort writes). Returns the removed binding so the caller can clean up
-- stale chat messages and notify the unlinked account, post-commit.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION unlink_telegram(p_safe_address TEXT)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  v_safe TEXT := lower(p_safe_address);
  v_link telegram_links%ROWTYPE;
BEGIN
  DELETE FROM telegram_links WHERE safe_address = v_safe
    RETURNING * INTO v_link;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'not_linked');
  END IF;

  UPDATE user_settings SET screening_mode = FALSE
    WHERE safe_address = v_safe AND screening_mode = TRUE;

  RETURN jsonb_build_object(
    'status', 'unlinked',
    'telegram_user_id', v_link.telegram_user_id,
    'telegram_chat_id', v_link.telegram_chat_id,
    'telegram_username', v_link.telegram_username,
    'telegram_name', v_link.telegram_name
  );
END;
$$;

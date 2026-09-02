-- ─────────────────────────────────────────────────────────────
-- apply_policy_change_proposal (#144, PR #145 review)
--
-- Claim + apply + audit in ONE transaction. The previous server-side
-- sequence (claim, then upsert, then fire-and-forget audit) had two
-- failure holes: a transient upsert failure left the proposal terminally
-- 'confirmed' with its change never applied, and a lost audit insert let
-- an applied change go unrecorded in behavioral_events. Here any failure
-- rolls back the claim too — the proposal stays pending and the agent
-- simply retries.
--
-- The defaults row is materialized by INSERT .. ON CONFLICT DO NOTHING:
-- global_limits column defaults mirror DEFAULT_LIMITS, so no default
-- values are duplicated in this function.
--
-- Cross-field validation is re-checked here against the LIVE row (the
-- row may have changed between proposal creation and apply); a violation
-- resolves the proposal to 'rejected' (same transaction) and applies
-- nothing.
-- ─────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION apply_policy_change_proposal(p_id UUID, p_safe TEXT)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  prop     policy_change_proposals%ROWTYPE;
  cur      global_limits%ROWTYPE;
  new_row  global_limits%ROWTYPE;
  v_approve INT;
  v_block   INT;
  v_reason  TEXT;
BEGIN
  -- Atomic claim: only a live pending proposal for this Safe transitions.
  UPDATE policy_change_proposals
     SET status = 'confirmed', resolved_at = now(), confirmed_via = 'telegram'
   WHERE id = p_id
     AND safe_address = p_safe
     AND status = 'pending'
     AND expires_at > now()
  RETURNING * INTO prop;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_pending');
  END IF;

  -- Materialize the defaults row so a Safe that never customized has a
  -- real row to patch (column defaults ARE the app defaults).
  INSERT INTO global_limits (safe_address) VALUES (p_safe)
  ON CONFLICT (safe_address) DO NOTHING;

  SELECT * INTO cur FROM global_limits WHERE safe_address = p_safe FOR UPDATE;

  -- Merged-state re-validation against the LIVE row.
  v_approve := COALESCE((prop.patch->>'risk_threshold_approve')::INT, cur.risk_threshold_approve);
  v_block   := COALESCE((prop.patch->>'risk_threshold_block')::INT,  cur.risk_threshold_block);
  IF v_approve > v_block THEN
    v_reason := format(
      'approve threshold (%s) would exceed block threshold (%s) on the current settings',
      v_approve, v_block
    );
    UPDATE policy_change_proposals
       SET status = 'rejected', reject_reason = v_reason
     WHERE id = p_id;
    RETURN jsonb_build_object('ok', false, 'error', 'validation', 'reason', v_reason);
  END IF;

  UPDATE global_limits SET
    max_single_tx      = CASE WHEN prop.patch ? 'max_single_tx'      THEN (prop.patch->>'max_single_tx')::NUMERIC      ELSE max_single_tx      END,
    max_hourly_volume  = CASE WHEN prop.patch ? 'max_hourly_volume'  THEN (prop.patch->>'max_hourly_volume')::NUMERIC  ELSE max_hourly_volume  END,
    max_daily_volume   = CASE WHEN prop.patch ? 'max_daily_volume'   THEN (prop.patch->>'max_daily_volume')::NUMERIC   ELSE max_daily_volume   END,
    max_weekly_volume  = CASE WHEN prop.patch ? 'max_weekly_volume'  THEN (prop.patch->>'max_weekly_volume')::NUMERIC  ELSE max_weekly_volume  END,
    max_daily_tx_count = CASE WHEN prop.patch ? 'max_daily_tx_count' THEN (prop.patch->>'max_daily_tx_count')::INT     ELSE max_daily_tx_count END,
    allowed_hours_utc  = CASE WHEN prop.patch ? 'allowed_hours_utc'
        THEN COALESCE((SELECT array_agg(v::INT) FROM jsonb_array_elements_text(prop.patch->'allowed_hours_utc') v), '{}'::INT[])
        ELSE allowed_hours_utc END,
    allowed_days_utc   = CASE WHEN prop.patch ? 'allowed_days_utc'
        THEN COALESCE((SELECT array_agg(v::INT) FROM jsonb_array_elements_text(prop.patch->'allowed_days_utc') v), '{}'::INT[])
        ELSE allowed_days_utc END,
    unknown_recipient_action = CASE WHEN prop.patch ? 'unknown_recipient_action' THEN prop.patch->>'unknown_recipient_action' ELSE unknown_recipient_action END,
    risk_threshold_approve   = CASE WHEN prop.patch ? 'risk_threshold_approve'   THEN (prop.patch->>'risk_threshold_approve')::INT ELSE risk_threshold_approve END,
    risk_threshold_block     = CASE WHEN prop.patch ? 'risk_threshold_block'     THEN (prop.patch->>'risk_threshold_block')::INT   ELSE risk_threshold_block   END,
    learning_enabled         = CASE WHEN prop.patch ? 'learning_enabled'         THEN (prop.patch->>'learning_enabled')::BOOLEAN   ELSE learning_enabled       END
  WHERE safe_address = p_safe
  RETURNING * INTO new_row;

  -- Audit in the SAME transaction: no applied change without its record.
  INSERT INTO behavioral_events (safe_address, event_type, metadata)
  VALUES (p_safe, 'policy_change', jsonb_build_object(
    'event',        'policy_change_applied',
    'proposalId',   prop.id,
    'proposedVia',  prop.proposed_via,
    'confirmedVia', 'telegram',
    'patch',        prop.patch,
    'previous',     to_jsonb(cur)
  ));

  RETURN jsonb_build_object(
    'ok', true,
    'patch', prop.patch,
    'previous', to_jsonb(cur),
    'limits', to_jsonb(new_row)
  );
END;
$$;

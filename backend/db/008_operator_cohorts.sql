BEGIN;
-- Session and role are rechecked inside every privileged function. No promotion
-- or direct role/catalog/cohort INSERT privilege is granted to the web runtime.
CREATE FUNCTION sixtysix.require_admin(session_hash text, fresh_required boolean DEFAULT true)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE actor uuid; fresh boolean; assigned text;
BEGIN
  SELECT u.id INTO actor FROM sixtysix.app_users u JOIN sixtysix.auth_sessions s ON s.user_id=u.id
    WHERE s.token_hash=session_hash FOR UPDATE OF u;
  IF NOT FOUND THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
  SELECT s.reauthenticated_at>clock_timestamp()-interval '5 minutes' INTO fresh
    FROM sixtysix.auth_sessions s JOIN sixtysix.app_users u ON u.id=s.user_id
    WHERE s.token_hash=session_hash AND s.revoked_at IS NULL AND s.expires_at>clock_timestamp()
      AND u.suspended_at IS NULL AND u.deletion_requested_at IS NULL AND u.anonymized_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'UNAUTHENTICATED'; END IF;
  SELECT r.role INTO assigned FROM sixtysix.operator_roles r WHERE r.user_id=actor FOR SHARE;
  IF assigned IS DISTINCT FROM 'admin' THEN RAISE EXCEPTION 'FORBIDDEN'; END IF;
  IF fresh_required IS DISTINCT FROM false AND fresh IS DISTINCT FROM true THEN RAISE EXCEPTION 'REAUTH_REQUIRED'; END IF;
  RETURN actor;
END $$;

CREATE FUNCTION sixtysix.admin_create_cohort(session_hash text, request_id uuid, input jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE actor uuid; habit uuid; start_day date; starts timestamptz; opens timestamptz;
  label text; cap integer; minimum integer; result sixtysix.cohorts%ROWTYPE;
BEGIN
  actor:=sixtysix.require_admin(session_hash,true);
  IF request_id IS NULL OR jsonb_typeof(input) IS DISTINCT FROM 'object'
    OR input-ARRAY['habitId','policyVersion','generation','startDate','recruitmentOpensAt','capacity','minParticipants']<>'{}'::jsonb
    OR jsonb_typeof(input->'habitId') IS DISTINCT FROM 'string'
    OR jsonb_typeof(input->'generation') IS DISTINCT FROM 'string'
    OR jsonb_typeof(input->'startDate') IS DISTINCT FROM 'string'
    OR jsonb_typeof(input->'recruitmentOpensAt') IS DISTINCT FROM 'string'
    OR input->'policyVersion' IS DISTINCT FROM '1'::jsonb
    OR jsonb_typeof(input->'capacity') IS DISTINCT FROM 'number'
    OR jsonb_typeof(input->'minParticipants') IS DISTINCT FROM 'number'
    OR (input->>'startDate')!~ '^\d{4}-\d{2}-\d{2}$'
    OR (input->>'capacity')!~ '^\d{1,2}$' OR (input->>'minParticipants')!~ '^\d{1,2}$'
  THEN RETURN jsonb_build_object('error','INVALID_REQUEST'); END IF;
  BEGIN
    habit:=(input->>'habitId')::uuid;start_day:=(input->>'startDate')::date;
    opens:=(input->>'recruitmentOpensAt')::timestamptz;
    cap:=(input->>'capacity')::integer;minimum:=(input->>'minParticipants')::integer;
  EXCEPTION WHEN invalid_text_representation OR datetime_field_overflow OR invalid_datetime_format THEN
    RETURN jsonb_build_object('error','INVALID_REQUEST');
  END;
  starts:=(start_day+time '04:00') AT TIME ZONE 'Asia/Seoul';label:=btrim(input->>'generation');
  IF length(label) NOT BETWEEN 1 AND 40 OR cap NOT BETWEEN 1 AND 30 OR minimum NOT BETWEEN 1 AND cap
    OR NOT isfinite(opens) OR opens>=starts OR starts<=clock_timestamp()
  THEN RETURN jsonb_build_object('error','INVALID_REQUEST'); END IF;
  PERFORM h.id FROM sixtysix.habits h WHERE h.id=habit AND h.retired_at IS NULL FOR SHARE;
  IF NOT FOUND THEN RETURN jsonb_build_object('error','NOT_FOUND'); END IF;
  IF starts<=clock_timestamp() THEN RETURN jsonb_build_object('error','INVALID_REQUEST'); END IF;
  BEGIN
    INSERT INTO sixtysix.cohorts(habit_id,policy_version,generation,starts_at,recruitment_opens_at,capacity,min_participants)
      VALUES(habit,1,label,starts,opens,cap,minimum) RETURNING * INTO result;
  EXCEPTION WHEN unique_violation THEN RETURN jsonb_build_object('error','COHORT_EXISTS'); END;
  INSERT INTO sixtysix.audit_events(actor_id,action,target_type,target_id,request_id,reason_code)
    VALUES(actor,'cohort.create','cohort',result.id,request_id::text,'OPERATOR_CREATE');
  RETURN to_jsonb(result);
END $$;

CREATE FUNCTION sixtysix.admin_cancel_cohort(session_hash text, request_id uuid, cohort_id uuid, reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
DECLARE actor uuid; result sixtysix.cohorts%ROWTYPE; participants integer; moment timestamptz;
BEGIN
  actor:=sixtysix.require_admin(session_hash,true);
  IF request_id IS NULL OR cohort_id IS NULL OR reason IS NULL OR length(btrim(reason)) NOT BETWEEN 1 AND 200 THEN
    RETURN jsonb_build_object('error','INVALID_REQUEST'); END IF;
  SELECT * INTO result FROM sixtysix.cohorts c WHERE c.id=cohort_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('error','NOT_FOUND'); END IF;
  moment:=clock_timestamp();
  IF result.cancelled_at IS NOT NULL OR result.launch_decided_at IS NOT NULL OR moment>=result.starts_at THEN
    RETURN jsonb_build_object('error','JOIN_CLOSED'); END IF;
  SELECT count(*) INTO participants FROM sixtysix.memberships m WHERE m.cohort_id=result.id AND m.cancelled_at IS NULL AND m.left_at IS NULL;
  UPDATE sixtysix.cohorts c SET cancelled_at=moment,cancellation_reason=btrim(reason),launch_decided_at=moment
    WHERE c.id=result.id RETURNING * INTO result;
  -- Same once-only decision event understood by the inbox worker. Slot cleanup
  -- remains lazy, avoiding locking participants while holding the cohort lock.
  INSERT INTO sixtysix.outbox(event_type,dedupe_key,payload)
    VALUES('cohort.cancelled','cohort.launch:'||result.id::text,jsonb_build_object('cohortId',result.id,'participantCount',participants));
  INSERT INTO sixtysix.audit_events(actor_id,action,target_type,target_id,request_id,reason_code)
    VALUES(actor,'cohort.cancel','cohort',result.id,request_id::text,'OPERATOR_CANCEL');
  RETURN to_jsonb(result);
END $$;
REVOKE ALL ON FUNCTION sixtysix.require_admin(text,boolean),sixtysix.admin_create_cohort(text,uuid,jsonb),sixtysix.admin_cancel_cohort(text,uuid,uuid,text) FROM PUBLIC;
COMMIT;

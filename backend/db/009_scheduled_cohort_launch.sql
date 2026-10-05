BEGIN;
CREATE INDEX cohorts_launch_due ON sixtysix.cohorts(starts_at,id)
  WHERE launch_decided_at IS NULL AND cancelled_at IS NULL;

CREATE FUNCTION sixtysix.settle_due_cohorts(batch_size integer DEFAULT 20, dry_run boolean DEFAULT true)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp SET lock_timeout = '1s' AS $$
DECLARE cohort record; participants integer; moment timestamptz;
  started integer:=0; cancelled integer:=0; examined integer:=0; due integer;
BEGIN
  IF batch_size IS NULL OR batch_size<1 OR batch_size>100 OR dry_run IS NULL THEN
    RAISE EXCEPTION 'invalid launch options' USING ERRCODE='22023';
  END IF;
  IF dry_run THEN
    SELECT count(*) INTO due FROM (SELECT id FROM sixtysix.cohorts
      WHERE launch_decided_at IS NULL AND cancelled_at IS NULL AND starts_at<=clock_timestamp()
      ORDER BY id LIMIT batch_size) AS pending;
    RETURN jsonb_build_object('dryRun',true,'due',due,'started',0,'cancelled',0,'batchFull',due=batch_size);
  END IF;
  -- The same cohort lock used by joining/cancellation/lazy launch; never locks
  -- participants' accounts. Sort by ID to match the app's multi-cohort lock order.
  FOR cohort IN SELECT c.* FROM sixtysix.cohorts c
    WHERE c.launch_decided_at IS NULL AND c.cancelled_at IS NULL AND c.starts_at<=clock_timestamp()
    ORDER BY c.id LIMIT batch_size FOR UPDATE OF c SKIP LOCKED
  LOOP
    moment:=clock_timestamp();examined:=examined+1;
    SELECT count(*) INTO participants FROM sixtysix.memberships m
      WHERE m.cohort_id=cohort.id AND m.cancelled_at IS NULL AND m.left_at IS NULL;
    UPDATE sixtysix.cohorts SET launch_decided_at=moment,
      cancelled_at=CASE WHEN participants<cohort.min_participants THEN moment ELSE NULL END,
      cancellation_reason=CASE WHEN participants<cohort.min_participants THEN 'MIN_PARTICIPANTS' ELSE NULL END
      WHERE id=cohort.id;
    INSERT INTO sixtysix.outbox(event_type,dedupe_key,payload)
      VALUES(CASE WHEN participants<cohort.min_participants THEN 'cohort.cancelled' ELSE 'cohort.started' END,
        'cohort.launch:'||cohort.id::text,jsonb_build_object('cohortId',cohort.id,'participantCount',participants));
    INSERT INTO sixtysix.audit_events(action,target_type,target_id,request_id,reason_code)
      VALUES(CASE WHEN participants<cohort.min_participants THEN 'cohort.cancelled' ELSE 'cohort.started' END,
        'cohort',cohort.id,gen_random_uuid()::text,CASE WHEN participants<cohort.min_participants THEN 'MIN_PARTICIPANTS' ELSE 'MINIMUM_REACHED' END);
    IF participants<cohort.min_participants THEN cancelled:=cancelled+1;ELSE started:=started+1;END IF;
  END LOOP;
  RETURN jsonb_build_object('dryRun',false,'due',examined,'started',started,'cancelled',cancelled,'batchFull',examined=batch_size);
END $$;

CREATE FUNCTION sixtysix.scheduled_work_status() RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
  SELECT jsonb_build_object('dueCohorts',count(*),'oldestDueAt',min(starts_at),'outbox',sixtysix.outbox_status())
    FROM sixtysix.cohorts WHERE launch_decided_at IS NULL AND cancelled_at IS NULL AND starts_at<=clock_timestamp()
$$;
REVOKE ALL ON FUNCTION sixtysix.settle_due_cohorts(integer,boolean),sixtysix.scheduled_work_status() FROM PUBLIC;
COMMIT;

BEGIN;
CREATE TABLE sixtysix.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES sixtysix.app_users(id),
  outbox_id uuid NOT NULL REFERENCES sixtysix.outbox(id),
  membership_id uuid NOT NULL REFERENCES sixtysix.memberships(id),
  cohort_id uuid NOT NULL REFERENCES sixtysix.cohorts(id),
  event_type text NOT NULL CHECK(event_type IN ('cohort.started','cohort.cancelled')),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE(outbox_id,user_id)
);
CREATE INDEX notifications_user ON sixtysix.notifications(user_id,created_at DESC,id DESC);

CREATE FUNCTION sixtysix.outbox_status() RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path = pg_catalog, pg_temp AS $$
  SELECT jsonb_build_object(
    'ready',count(*) FILTER(WHERE delivered_at IS NULL AND failed_at IS NULL AND available_at<=clock_timestamp() AND (locked_until IS NULL OR locked_until<=clock_timestamp())),
    'leased',count(*) FILTER(WHERE delivered_at IS NULL AND failed_at IS NULL AND locked_until>clock_timestamp()),
    'deferred',count(*) FILTER(WHERE delivered_at IS NULL AND failed_at IS NULL AND available_at>clock_timestamp() AND (locked_until IS NULL OR locked_until<=clock_timestamp())),
    'delivered',count(*) FILTER(WHERE delivered_at IS NOT NULL),
    'failed',count(*) FILTER(WHERE failed_at IS NOT NULL)) FROM sixtysix.outbox
$$;

-- Each claim counts as an attempt, including a worker crash. One minute leases.
CREATE FUNCTION sixtysix.claim_outbox(batch_size integer DEFAULT 20)
RETURNS TABLE(id uuid,lease_token uuid) LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp SET lock_timeout = '1s' AS $$
DECLARE job record; token uuid;
BEGIN
  IF batch_size IS NULL OR batch_size<1 OR batch_size>100 THEN
    RAISE EXCEPTION 'invalid batch' USING ERRCODE='22023';
  END IF;
  FOR job IN SELECT o.id,o.attempts FROM sixtysix.outbox o
    WHERE o.delivered_at IS NULL AND o.failed_at IS NULL AND o.available_at<=clock_timestamp()
      AND (o.locked_until IS NULL OR o.locked_until<=clock_timestamp())
    ORDER BY o.available_at,o.id LIMIT batch_size FOR UPDATE OF o SKIP LOCKED
  LOOP
    IF job.attempts>=5 THEN
      UPDATE sixtysix.outbox o SET failed_at=clock_timestamp(),locked_until=NULL,lease_token=NULL,last_error_code='ATTEMPTS_EXHAUSTED' WHERE o.id=job.id;
      INSERT INTO sixtysix.audit_events(action,target_type,target_id,request_id,reason_code)
        VALUES ('outbox.failed','outbox',job.id,gen_random_uuid()::text,'ATTEMPTS_EXHAUSTED');
    ELSE
      token:=gen_random_uuid();
      UPDATE sixtysix.outbox o SET attempts=o.attempts+1,lease_token=token,locked_until=clock_timestamp()+interval '60 seconds' WHERE o.id=job.id;
      id:=job.id;lease_token:=token;RETURN NEXT;
    END IF;
  END LOOP;
END $$;

CREATE FUNCTION sixtysix.reject_outbox(job_id uuid, token uuid, reason text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp SET lock_timeout = '1s' AS $$
DECLARE job sixtysix.outbox%ROWTYPE; terminal boolean;
BEGIN
  IF reason IS NULL OR reason NOT IN ('RETRYABLE','INVALID_EVENT') THEN
    RAISE EXCEPTION 'invalid reason' USING ERRCODE='22023';
  END IF;
  SELECT * INTO job FROM sixtysix.outbox o WHERE o.id=job_id FOR UPDATE;
  IF NOT FOUND OR job.lease_token IS DISTINCT FROM token OR token IS NULL OR job.locked_until<=clock_timestamp()
     OR job.delivered_at IS NOT NULL OR job.failed_at IS NOT NULL THEN RETURN 'stale'; END IF;
  terminal:=reason='INVALID_EVENT' OR job.attempts>=5;
  UPDATE sixtysix.outbox SET locked_until=NULL,lease_token=NULL,last_error_code=reason,
    failed_at=CASE WHEN terminal THEN clock_timestamp() ELSE NULL END,
    available_at=clock_timestamp()+make_interval(secs=>LEAST(3600,30*power(2,job.attempts-1))::integer)
    WHERE id=job_id;
  INSERT INTO sixtysix.audit_events(action,target_type,target_id,request_id,reason_code)
    VALUES (CASE WHEN terminal THEN 'outbox.failed' ELSE 'outbox.retry' END,'outbox',job_id,gen_random_uuid()::text,reason);
  RETURN CASE WHEN terminal THEN 'failed' ELSE 'retry' END;
END $$;

-- Only the built-in inbox handler can acknowledge a job. It never sends externally.
CREATE FUNCTION sixtysix.deliver_outbox(job_id uuid, token uuid) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, pg_temp SET lock_timeout = '1s' AS $$
DECLARE job sixtysix.outbox%ROWTYPE; cohort sixtysix.cohorts%ROWTYPE; target uuid;
BEGIN
  SELECT * INTO job FROM sixtysix.outbox o WHERE o.id=job_id FOR UPDATE;
  IF NOT FOUND OR job.lease_token IS DISTINCT FROM token OR token IS NULL OR job.locked_until<=clock_timestamp()
     OR job.delivered_at IS NOT NULL OR job.failed_at IS NOT NULL THEN RETURN 'stale'; END IF;
  IF job.event_type NOT IN ('cohort.started','cohort.cancelled')
     OR jsonb_typeof(job.payload->'cohortId') IS DISTINCT FROM 'string'
     OR jsonb_typeof(job.payload->'participantCount') IS DISTINCT FROM 'number'
     OR (job.payload-ARRAY['cohortId','participantCount'])<>'{}'::jsonb
     OR (job.payload->>'cohortId') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
     OR (job.payload->>'participantCount') !~ '^(0|[1-9][0-9]?)$'
  THEN RETURN 'invalid'; END IF;
  target:=(job.payload->>'cohortId')::uuid;
  SELECT * INTO cohort FROM sixtysix.cohorts c WHERE c.id=target;
  IF NOT FOUND OR cohort.launch_decided_at IS NULL OR job.dedupe_key<>'cohort.launch:'||target::text
    OR (job.payload->>'participantCount')::integer>cohort.capacity
    OR (job.event_type='cohort.started' AND cohort.cancelled_at IS NOT NULL)
    OR (job.event_type='cohort.cancelled' AND cohort.cancelled_at IS NULL)
  THEN RETURN 'invalid'; END IF;
  INSERT INTO sixtysix.notifications(user_id,outbox_id,membership_id,cohort_id,event_type)
    SELECT m.user_id,job.id,m.id,target,job.event_type
    FROM sixtysix.memberships m JOIN sixtysix.app_users u ON u.id=m.user_id
    WHERE m.cohort_id=target AND m.cancelled_at IS NULL AND m.left_at IS NULL
      AND u.suspended_at IS NULL AND u.deletion_requested_at IS NULL AND u.anonymized_at IS NULL
    ON CONFLICT(outbox_id,user_id) DO NOTHING;
  UPDATE sixtysix.outbox SET delivered_at=clock_timestamp(),locked_until=NULL,lease_token=NULL,last_error_code=NULL WHERE id=job_id;
  INSERT INTO sixtysix.audit_events(action,target_type,target_id,request_id)
    VALUES ('outbox.delivered','outbox',job_id,gen_random_uuid()::text);
  RETURN 'delivered';
END $$;
REVOKE ALL ON sixtysix.notifications FROM PUBLIC;
REVOKE ALL ON FUNCTION sixtysix.outbox_status(),sixtysix.claim_outbox(integer),sixtysix.reject_outbox(uuid,uuid,text),sixtysix.deliver_outbox(uuid,uuid) FROM PUBLIC;
COMMIT;

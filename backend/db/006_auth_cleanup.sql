BEGIN;
-- Supporting indexes for dependency-safe bounded cleanup.
CREATE INDEX auth_proofs_session ON sixtysix.auth_proofs(session_binding_hash);
CREATE INDEX auth_proofs_link_intent ON sixtysix.auth_proofs(link_intent_id);
CREATE INDEX auth_intents_session ON sixtysix.auth_intents(session_binding_hash);
CREATE INDEX auth_intents_link_intent ON sixtysix.auth_intents(link_intent_id);
CREATE INDEX link_intents_session ON sixtysix.link_intents(session_binding_hash);
CREATE INDEX link_intents_expiry ON sixtysix.link_intents(expires_at);
CREATE INDEX auth_sessions_revoked ON sixtysix.auth_sessions(revoked_at) WHERE revoked_at IS NOT NULL;

-- No caller-supplied cutoff, SQL or table names. Only expired auth ephemera.
CREATE FUNCTION sixtysix.cleanup_auth_ephemera(batch_size integer DEFAULT 100, dry_run boolean DEFAULT true)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, pg_temp SET lock_timeout = '1s' AS $$
DECLARE
  cutoff timestamptz := clock_timestamp() - interval '24 hours';
  remaining integer := batch_size;
  affected integer;
  counts jsonb := '{}'::jsonb;
BEGIN
  IF batch_size IS NULL OR batch_size < 1 OR batch_size > 500 OR dry_run IS NULL THEN
    RAISE EXCEPTION 'invalid cleanup options' USING ERRCODE = '22023';
  END IF;
  IF NOT pg_try_advisory_xact_lock(6666003) THEN
    RETURN jsonb_build_object('status','busy','dryRun',dry_run,'counts',counts);
  END IF;
  -- oauth_states: child rows first, never CASCADE.
  IF dry_run THEN
    SELECT count(*)::integer INTO affected FROM (
      SELECT t.state_hash FROM sixtysix.oauth_states t WHERE t.expires_at < cutoff
      ORDER BY t.expires_at,t.state_hash LIMIT remaining
    ) candidates;
  ELSE
    WITH candidates AS (
      SELECT t.state_hash FROM sixtysix.oauth_states t WHERE t.expires_at < cutoff
      ORDER BY t.expires_at,t.state_hash LIMIT remaining FOR UPDATE OF t SKIP LOCKED
    ), removed AS (
      DELETE FROM sixtysix.oauth_states t USING candidates c WHERE t.state_hash=c.state_hash RETURNING 1
    ) SELECT count(*)::integer INTO affected FROM removed;
  END IF;
  counts := counts || jsonb_build_object('oauth_states',affected);
  remaining := remaining - affected;
  -- email_challenges: child rows first, never CASCADE.
  IF dry_run THEN
    SELECT count(*)::integer INTO affected FROM (
      SELECT t.id FROM sixtysix.email_challenges t WHERE t.expires_at < cutoff
      ORDER BY t.expires_at,t.id LIMIT remaining
    ) candidates;
  ELSE
    WITH candidates AS (
      SELECT t.id FROM sixtysix.email_challenges t WHERE t.expires_at < cutoff
      ORDER BY t.expires_at,t.id LIMIT remaining FOR UPDATE OF t SKIP LOCKED
    ), removed AS (
      DELETE FROM sixtysix.email_challenges t USING candidates c WHERE t.id=c.id RETURNING 1
    ) SELECT count(*)::integer INTO affected FROM removed;
  END IF;
  counts := counts || jsonb_build_object('email_challenges',affected);
  remaining := remaining - affected;
  -- auth_intents: child rows first, never CASCADE.
  IF dry_run THEN
    SELECT count(*)::integer INTO affected FROM (
      SELECT t.id FROM sixtysix.auth_intents t WHERE t.expires_at < cutoff AND NOT EXISTS (SELECT 1 FROM sixtysix.oauth_states c WHERE c.intent_id=t.id) AND NOT EXISTS (SELECT 1 FROM sixtysix.email_challenges c WHERE c.intent_id=t.id)
      ORDER BY t.expires_at,t.id LIMIT remaining
    ) candidates;
  ELSE
    WITH candidates AS (
      SELECT t.id FROM sixtysix.auth_intents t WHERE t.expires_at < cutoff AND NOT EXISTS (SELECT 1 FROM sixtysix.oauth_states c WHERE c.intent_id=t.id) AND NOT EXISTS (SELECT 1 FROM sixtysix.email_challenges c WHERE c.intent_id=t.id)
      ORDER BY t.expires_at,t.id LIMIT remaining FOR UPDATE OF t SKIP LOCKED
    ), removed AS (
      DELETE FROM sixtysix.auth_intents t USING candidates c WHERE t.id=c.id RETURNING 1
    ) SELECT count(*)::integer INTO affected FROM removed;
  END IF;
  counts := counts || jsonb_build_object('auth_intents',affected);
  remaining := remaining - affected;
  -- auth_proofs: child rows first, never CASCADE.
  IF dry_run THEN
    SELECT count(*)::integer INTO affected FROM (
      SELECT t.id FROM sixtysix.auth_proofs t WHERE t.expires_at < cutoff AND NOT EXISTS (SELECT 1 FROM sixtysix.auth_intents c WHERE c.proof_id=t.id)
      ORDER BY t.expires_at,t.id LIMIT remaining
    ) candidates;
  ELSE
    WITH candidates AS (
      SELECT t.id FROM sixtysix.auth_proofs t WHERE t.expires_at < cutoff AND NOT EXISTS (SELECT 1 FROM sixtysix.auth_intents c WHERE c.proof_id=t.id)
      ORDER BY t.expires_at,t.id LIMIT remaining FOR UPDATE OF t SKIP LOCKED
    ), removed AS (
      DELETE FROM sixtysix.auth_proofs t USING candidates c WHERE t.id=c.id RETURNING 1
    ) SELECT count(*)::integer INTO affected FROM removed;
  END IF;
  counts := counts || jsonb_build_object('auth_proofs',affected);
  remaining := remaining - affected;
  -- link_intents: child rows first, never CASCADE.
  IF dry_run THEN
    SELECT count(*)::integer INTO affected FROM (
      SELECT t.id FROM sixtysix.link_intents t WHERE t.expires_at < cutoff AND NOT EXISTS (SELECT 1 FROM sixtysix.auth_intents c WHERE c.link_intent_id=t.id) AND NOT EXISTS (SELECT 1 FROM sixtysix.auth_proofs c WHERE c.link_intent_id=t.id)
      ORDER BY t.expires_at,t.id LIMIT remaining
    ) candidates;
  ELSE
    WITH candidates AS (
      SELECT t.id FROM sixtysix.link_intents t WHERE t.expires_at < cutoff AND NOT EXISTS (SELECT 1 FROM sixtysix.auth_intents c WHERE c.link_intent_id=t.id) AND NOT EXISTS (SELECT 1 FROM sixtysix.auth_proofs c WHERE c.link_intent_id=t.id)
      ORDER BY t.expires_at,t.id LIMIT remaining FOR UPDATE OF t SKIP LOCKED
    ), removed AS (
      DELETE FROM sixtysix.link_intents t USING candidates c WHERE t.id=c.id RETURNING 1
    ) SELECT count(*)::integer INTO affected FROM removed;
  END IF;
  counts := counts || jsonb_build_object('link_intents',affected);
  remaining := remaining - affected;
  -- auth_sessions: child rows first, never CASCADE.
  IF dry_run THEN
    SELECT count(*)::integer INTO affected FROM (
      SELECT t.token_hash FROM sixtysix.auth_sessions t WHERE (t.expires_at < cutoff OR t.revoked_at < cutoff) AND NOT EXISTS (SELECT 1 FROM sixtysix.auth_proofs c WHERE c.session_binding_hash=t.token_hash) AND NOT EXISTS (SELECT 1 FROM sixtysix.auth_intents c WHERE c.session_binding_hash=t.token_hash) AND NOT EXISTS (SELECT 1 FROM sixtysix.link_intents c WHERE c.session_binding_hash=t.token_hash)
      ORDER BY t.expires_at,t.token_hash LIMIT remaining
    ) candidates;
  ELSE
    WITH candidates AS (
      SELECT t.token_hash FROM sixtysix.auth_sessions t WHERE (t.expires_at < cutoff OR t.revoked_at < cutoff) AND NOT EXISTS (SELECT 1 FROM sixtysix.auth_proofs c WHERE c.session_binding_hash=t.token_hash) AND NOT EXISTS (SELECT 1 FROM sixtysix.auth_intents c WHERE c.session_binding_hash=t.token_hash) AND NOT EXISTS (SELECT 1 FROM sixtysix.link_intents c WHERE c.session_binding_hash=t.token_hash)
      ORDER BY t.expires_at,t.token_hash LIMIT remaining FOR UPDATE OF t SKIP LOCKED
    ), removed AS (
      DELETE FROM sixtysix.auth_sessions t USING candidates c WHERE t.token_hash=c.token_hash RETURNING 1
    ) SELECT count(*)::integer INTO affected FROM removed;
  END IF;
  counts := counts || jsonb_build_object('auth_sessions',affected);
  remaining := remaining - affected;
  -- auth_rate_limits: child rows first, never CASCADE.
  IF dry_run THEN
    SELECT count(*)::integer INTO affected FROM (
      SELECT t.bucket_key FROM sixtysix.auth_rate_limits t WHERE t.expires_at < cutoff
      ORDER BY t.expires_at,t.bucket_key LIMIT remaining
    ) candidates;
  ELSE
    WITH candidates AS (
      SELECT t.bucket_key FROM sixtysix.auth_rate_limits t WHERE t.expires_at < cutoff
      ORDER BY t.expires_at,t.bucket_key LIMIT remaining FOR UPDATE OF t SKIP LOCKED
    ), removed AS (
      DELETE FROM sixtysix.auth_rate_limits t USING candidates c WHERE t.bucket_key=c.bucket_key RETURNING 1
    ) SELECT count(*)::integer INTO affected FROM removed;
  END IF;
  counts := counts || jsonb_build_object('auth_rate_limits',affected);
  remaining := remaining - affected;
  IF NOT dry_run AND remaining < batch_size THEN
    INSERT INTO sixtysix.audit_events(action,target_type,request_id)
      VALUES ('auth.cleanup','auth_ephemera',gen_random_uuid()::text);
  END IF;
  RETURN jsonb_build_object('status','ok','dryRun',dry_run,'cutoff',cutoff,
    'limit',batch_size,'counts',counts,'batchFull',remaining=0);
END
$$;
REVOKE ALL ON FUNCTION sixtysix.cleanup_auth_ephemera(integer,boolean) FROM PUBLIC;
COMMIT;

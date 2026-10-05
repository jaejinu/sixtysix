-- T02 domain migration. Apply once to an empty test database, PostgreSQL 16+.
-- Auth-provider tables and runtime roles/grants are intentionally separate.
BEGIN;
CREATE SCHEMA sixtysix;
SET LOCAL search_path = sixtysix, public;

CREATE FUNCTION utf16_length(value text) RETURNS integer
LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE AS $$
  SELECT COALESCE(sum(CASE WHEN ascii(substr(value, n, 1)) > 65535 THEN 2 ELSE 1 END), 0)::integer
  FROM generate_series(1, char_length(value)) n
$$;

CREATE TABLE app_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_subject text UNIQUE, -- FK added after auth adapter/schema spike; null only after anonymization.
  display_name text NOT NULL CHECK (char_length(display_name) BETWEEN 1 AND 40),
  created_at timestamptz NOT NULL DEFAULT now(),
  suspended_at timestamptz,
  deletion_requested_at timestamptz,
  anonymized_at timestamptz,
  CHECK (auth_subject IS NOT NULL OR anonymized_at IS NOT NULL)
);
CREATE TABLE preferences (
  user_id uuid PRIMARY KEY REFERENCES app_users(id),
  default_visibility text NOT NULL DEFAULT 'cohort' CHECK (default_visibility IN ('cohort','private'))
);
CREATE TABLE operator_roles (
  user_id uuid PRIMARY KEY REFERENCES app_users(id),
  role text NOT NULL CHECK (role IN ('moderator','admin')),
  granted_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE habits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  short_name text NOT NULL,
  goal text NOT NULL,
  image_ref text NOT NULL,
  time_of_day text NOT NULL CHECK (time_of_day IN ('morning','evening')),
  retired_at timestamptz
);
CREATE TABLE policy_versions (
  version integer PRIMARY KEY CHECK (version > 0),
  duration_days integer NOT NULL CHECK (duration_days = 66),
  pass_limit integer NOT NULL CHECK (pass_limit = 3),
  timezone text NOT NULL CHECK (timezone = 'Asia/Seoul'),
  deadline_hour integer NOT NULL CHECK (deadline_hour = 4),
  late_hours integer NOT NULL CHECK (late_hours = 12),
  dormancy_days integer NOT NULL CHECK (dormancy_days = 7),
  text_utf16_limit integer NOT NULL CHECK (text_utf16_limit = 40),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE FUNCTION reject_policy_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'policy versions are immutable' USING ERRCODE = '23514'; END
$$;
CREATE TRIGGER policy_immutable BEFORE UPDATE OR DELETE ON policy_versions
FOR EACH ROW EXECUTE FUNCTION reject_policy_mutation();
INSERT INTO policy_versions(version,duration_days,pass_limit,timezone,deadline_hour,late_hours,dormancy_days,text_utf16_limit)
VALUES (1,66,3,'Asia/Seoul',4,12,7,40);

CREATE TABLE sample_photos (
  ref text PRIMARY KEY,
  public_path text NOT NULL CHECK (public_path LIKE '/%'),
  retired_at timestamptz
);
CREATE TABLE cohorts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  habit_id uuid NOT NULL REFERENCES habits(id),
  policy_version integer NOT NULL REFERENCES policy_versions(version),
  generation text NOT NULL,
  starts_at timestamptz NOT NULL,
  recruitment_opens_at timestamptz NOT NULL,
  capacity integer NOT NULL CHECK (capacity BETWEEN 1 AND 30),
  min_participants integer NOT NULL CHECK (min_participants >= 1 AND min_participants <= capacity),
  launch_decided_at timestamptz,
  cancelled_at timestamptz,
  cancellation_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (recruitment_opens_at < starts_at),
  CHECK ((starts_at AT TIME ZONE 'Asia/Seoul')::time = time '04:00'),
  CHECK ((cancelled_at IS NULL) = (cancellation_reason IS NULL)),
  UNIQUE (habit_id, generation)
);
CREATE INDEX cohorts_recruitment ON cohorts(starts_at,id) WHERE cancelled_at IS NULL;
CREATE TABLE memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app_users(id),
  cohort_id uuid NOT NULL REFERENCES cohorts(id),
  joined_at timestamptz NOT NULL DEFAULT now(),
  cancelled_at timestamptz,
  left_at timestamptz,
  UNIQUE (user_id,cohort_id),
  UNIQUE (id,user_id),
  CHECK (cancelled_at IS NULL OR cancelled_at >= joined_at),
  CHECK (left_at IS NULL OR left_at >= joined_at),
  CHECK (cancelled_at IS NULL OR left_at IS NULL)
);
CREATE INDEX memberships_cohort ON memberships(cohort_id,id);
CREATE TABLE user_cohort_slots (
  user_id uuid PRIMARY KEY REFERENCES app_users(id),
  membership_id uuid NOT NULL UNIQUE,
  FOREIGN KEY (membership_id,user_id) REFERENCES memberships(id,user_id)
);
CREATE TABLE day_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  membership_id uuid NOT NULL REFERENCES memberships(id),
  cohort_day integer NOT NULL CHECK (cohort_day BETWEEN 1 AND 66),
  kind text NOT NULL CHECK (kind IN ('checkin','pass')),
  created_at timestamptz NOT NULL DEFAULT now(),
  body text,
  sample_photo_ref text REFERENCES sample_photos(ref),
  visibility text CHECK (visibility IN ('cohort','private')),
  hidden_at timestamptz,
  UNIQUE (membership_id,cohort_day),
  CHECK ((kind = 'pass' AND body IS NULL AND sample_photo_ref IS NULL AND visibility IS NULL)
      OR (kind = 'checkin' AND body IS NOT NULL AND visibility IS NOT NULL
          AND utf16_length(body) BETWEEN 1 AND 40 AND char_length(btrim(body)) > 0))
);
CREATE INDEX day_entries_feed ON day_entries(created_at DESC,id DESC)
  WHERE kind = 'checkin' AND visibility = 'cohort' AND hidden_at IS NULL;

CREATE TABLE link_intents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app_users(id),
  session_binding_hash text NOT NULL,
  provider text NOT NULL CHECK (provider IN ('email','kakao')),
  verified_provider_subject text,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  verified_at timestamptz,
  consumed_at timestamptz,
  CHECK (expires_at > created_at),
  CHECK ((verified_at IS NULL) = (verified_provider_subject IS NULL)),
  CHECK (consumed_at IS NULL OR verified_at IS NOT NULL)
);
CREATE TABLE idempotency_records (
  user_id uuid NOT NULL REFERENCES app_users(id),
  scope text NOT NULL,
  key uuid NOT NULL,
  request_hash text NOT NULL,
  response_status integer NOT NULL CHECK (response_status BETWEEN 200 AND 299),
  response_body jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  PRIMARY KEY (user_id,scope,key),
  CHECK (expires_at > created_at)
);
CREATE INDEX idempotency_expiry ON idempotency_records(expires_at);
CREATE TABLE reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid NOT NULL REFERENCES app_users(id),
  entry_id uuid REFERENCES day_entries(id),
  reported_user_id uuid REFERENCES app_users(id),
  reason text NOT NULL CHECK (char_length(reason) BETWEEN 1 AND 1000),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved','dismissed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by uuid REFERENCES app_users(id),
  CHECK (num_nonnulls(entry_id,reported_user_id) = 1),
  CHECK ((status = 'open' AND resolved_at IS NULL AND resolved_by IS NULL)
      OR (status <> 'open' AND resolved_at IS NOT NULL AND resolved_by IS NOT NULL))
);
CREATE INDEX reports_queue ON reports(created_at,id) WHERE status = 'open';
CREATE TABLE support_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES app_users(id),
  contact_email text,
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved')),
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by uuid REFERENCES app_users(id),
  CHECK (user_id IS NOT NULL OR contact_email IS NOT NULL),
  CHECK ((status = 'open' AND resolved_at IS NULL AND resolved_by IS NULL)
      OR (status = 'resolved' AND resolved_at IS NOT NULL AND resolved_by IS NOT NULL))
);
CREATE TABLE deletion_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app_users(id),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','running','failed','completed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  last_error_code text,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  CHECK ((status = 'completed') = (completed_at IS NOT NULL))
);
CREATE UNIQUE INDEX deletion_one_open ON deletion_requests(user_id) WHERE status <> 'completed';
CREATE TABLE outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  dedupe_key text NOT NULL UNIQUE,
  payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  available_at timestamptz NOT NULL DEFAULT now(),
  locked_until timestamptz,
  lease_token uuid,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  delivered_at timestamptz,
  failed_at timestamptz,
  last_error_code text,
  CHECK (delivered_at IS NULL OR failed_at IS NULL),
  CHECK ((locked_until IS NULL) = (lease_token IS NULL))
);
CREATE INDEX outbox_pending ON outbox(available_at,id) WHERE delivered_at IS NULL AND failed_at IS NULL;
CREATE TABLE audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES app_users(id), -- null for system jobs
  action text NOT NULL,
  target_type text NOT NULL,
  target_id uuid,
  request_id text NOT NULL,
  reason_code text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_target ON audit_events(target_type,target_id,created_at);
COMMIT;

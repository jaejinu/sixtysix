-- Isolated constraint checks. No application authorization/concurrency claims.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL search_path = sixtysix, public;
CREATE FUNCTION pg_temp.expect_failure(statement text, expected_state text) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE actual_state text;
BEGIN
  BEGIN
    EXECUTE statement;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS actual_state = RETURNED_SQLSTATE;
  END;
  IF actual_state IS DISTINCT FROM expected_state THEN
    RAISE EXCEPTION 'expected %, got %: %', expected_state, actual_state, statement;
  END IF;
END $$;

INSERT INTO app_users(id,auth_subject,display_name) VALUES
 ('00000000-0000-4000-8000-000000000001','test-auth-a','테스트 A'),
 ('00000000-0000-4000-8000-000000000002','test-auth-b','테스트 B');
INSERT INTO habits(id,slug,name,short_name,goal,image_ref,time_of_day)
 VALUES ('10000000-0000-4000-8000-000000000001','test-read','읽기','읽기','15분','/test.webp','morning');
INSERT INTO cohorts(id,habit_id,policy_version,generation,starts_at,recruitment_opens_at,capacity,min_participants)
 VALUES ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',1,'test','2026-10-06T04:00:00+09','2026-10-01T00:00:00+09',30,10);
INSERT INTO memberships(id,user_id,cohort_id) VALUES
 ('30000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001'),
 ('30000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001');
INSERT INTO user_cohort_slots(user_id,membership_id)
 VALUES ('00000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001');
INSERT INTO sample_photos(ref,public_path) VALUES ('test-photo','/test.webp');
INSERT INTO day_entries(membership_id,cohort_day,kind,body,visibility,sample_photo_ref) VALUES
 ('30000000-0000-4000-8000-000000000001',1,'checkin','오늘 읽었어요','private','test-photo'),
 ('30000000-0000-4000-8000-000000000001',2,'checkin',repeat('😀',20),'cohort',NULL),
 ('30000000-0000-4000-8000-000000000001',3,'pass',NULL,NULL,NULL);

DO $$ BEGIN
 IF utf16_length('가😀') <> 3 OR utf16_length('') <> 0 THEN RAISE EXCEPTION 'UTF16 mismatch'; END IF;
END $$;

-- 1: one provider user maps to one app user
SELECT pg_temp.expect_failure($q$INSERT INTO app_users(auth_subject,display_name) VALUES ('test-auth-a','중복')$q$,'23505');
-- 2: one row per user/cohort
SELECT pg_temp.expect_failure($q$INSERT INTO memberships(user_id,cohort_id) VALUES ('00000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001')$q$,'23505');
-- 3: one slot per user
SELECT pg_temp.expect_failure($q$INSERT INTO user_cohort_slots(user_id,membership_id) VALUES ('00000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001')$q$,'23505');
-- 4: slot ownership cannot point at another user's membership
SELECT pg_temp.expect_failure($q$UPDATE user_cohort_slots SET user_id='00000000-0000-4000-8000-000000000002'$q$,'23503');
-- 5: checkin/checkin collision
SELECT pg_temp.expect_failure($q$INSERT INTO day_entries(membership_id,cohort_day,kind,body,visibility) VALUES ('30000000-0000-4000-8000-000000000001',1,'checkin','중복','cohort')$q$,'23505');
-- 6: checkin/pass collision
SELECT pg_temp.expect_failure($q$INSERT INTO day_entries(membership_id,cohort_day,kind) VALUES ('30000000-0000-4000-8000-000000000001',1,'pass')$q$,'23505');
-- 7/8: day range
SELECT pg_temp.expect_failure($q$INSERT INTO day_entries(membership_id,cohort_day,kind) VALUES ('30000000-0000-4000-8000-000000000001',0,'pass')$q$,'23514');
SELECT pg_temp.expect_failure($q$INSERT INTO day_entries(membership_id,cohort_day,kind) VALUES ('30000000-0000-4000-8000-000000000001',67,'pass')$q$,'23514');
-- 9/10: explicit NULLs cannot bypass payload CHECK
SELECT pg_temp.expect_failure($q$INSERT INTO day_entries(membership_id,cohort_day,kind,body) VALUES ('30000000-0000-4000-8000-000000000001',4,'checkin','본문')$q$,'23514');
SELECT pg_temp.expect_failure($q$INSERT INTO day_entries(membership_id,cohort_day,kind,body) VALUES ('30000000-0000-4000-8000-000000000001',4,'pass','본문')$q$,'23514');
-- 11: invalid photo not accepted
SELECT pg_temp.expect_failure($q$INSERT INTO day_entries(membership_id,cohort_day,kind,body,visibility,sample_photo_ref) VALUES ('30000000-0000-4000-8000-000000000001',4,'checkin','본문','cohort','untrusted')$q$,'23503');
-- 12: 21 supplementary codepoints exceed 40 UTF16 units
SELECT pg_temp.expect_failure($q$INSERT INTO day_entries(membership_id,cohort_day,kind,body,visibility) VALUES ('30000000-0000-4000-8000-000000000001',4,'checkin',repeat('😀',21),'cohort')$q$,'23514');
-- 13: blank text
SELECT pg_temp.expect_failure($q$INSERT INTO day_entries(membership_id,cohort_day,kind,body,visibility) VALUES ('30000000-0000-4000-8000-000000000001',4,'checkin','  ','cohort')$q$,'23514');
-- 14/15: policy facts immutable
SELECT pg_temp.expect_failure($q$UPDATE policy_versions SET pass_limit=3 WHERE version=1$q$,'23514');
SELECT pg_temp.expect_failure($q$DELETE FROM policy_versions WHERE version=1$q$,'23514');
-- 16/17: cohort start and capacity relationships
SELECT pg_temp.expect_failure($q$UPDATE cohorts SET starts_at='2026-10-06T00:00:00+09'$q$,'23514');
SELECT pg_temp.expect_failure($q$UPDATE cohorts SET min_participants=31$q$,'23514');
-- 18: report has exactly one target
SELECT pg_temp.expect_failure($q$INSERT INTO reports(reporter_id,reason) VALUES ('00000000-0000-4000-8000-000000000001','대상 없음')$q$,'23514');
-- 19: one open deletion request
INSERT INTO deletion_requests(user_id) VALUES ('00000000-0000-4000-8000-000000000001');
SELECT pg_temp.expect_failure($q$INSERT INTO deletion_requests(user_id) VALUES ('00000000-0000-4000-8000-000000000001')$q$,'23505');
-- 20: idempotency uniqueness
INSERT INTO idempotency_records(user_id,scope,key,request_hash,response_status,response_body,expires_at)
 VALUES ('00000000-0000-4000-8000-000000000001','test','40000000-0000-4000-8000-000000000001','hash',201,'{}',now()+interval '1 day');
SELECT pg_temp.expect_failure($q$INSERT INTO idempotency_records(user_id,scope,key,request_hash,response_status,expires_at) VALUES ('00000000-0000-4000-8000-000000000001','test','40000000-0000-4000-8000-000000000001','hash',201,now()+interval '1 day')$q$,'23505');

SELECT 'PASS: valid fixtures, UTF16 boundary, 20 rejection checks; rolling back fixtures' AS verification;
ROLLBACK;

BEGIN;
CREATE TABLE sixtysix.auth_intents (
  id uuid PRIMARY KEY,
  purpose text NOT NULL CHECK (purpose IN ('reauth','link')),
  provider text NOT NULL CHECK (provider IN ('email','kakao')),
  target_subject text,
  browser_binding_hash text NOT NULL CHECK (browser_binding_hash ~ '^[a-f0-9]{64}$'),
  session_binding_hash text NOT NULL REFERENCES sixtysix.auth_sessions(token_hash),
  link_intent_id uuid REFERENCES sixtysix.link_intents(id),
  proof_id uuid UNIQUE REFERENCES sixtysix.auth_proofs(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now()+interval '5 minutes'),
  completed_at timestamptz,
  CHECK ((purpose='link') = (link_intent_id IS NOT NULL)),
  CHECK (purpose<>'reauth' OR target_subject IS NOT NULL),
  CHECK (provider<>'email' OR target_subject IS NOT NULL),
  CHECK (expires_at>created_at AND expires_at<=created_at+interval '5 minutes')
);
CREATE INDEX auth_intents_expiry ON sixtysix.auth_intents(expires_at);
CREATE TABLE sixtysix.oauth_states (
  state_hash text PRIMARY KEY CHECK (state_hash ~ '^[a-f0-9]{64}$'),
  browser_binding_hash text NOT NULL CHECK (browser_binding_hash ~ '^[a-f0-9]{64}$'),
  intent_id uuid UNIQUE REFERENCES sixtysix.auth_intents(id),
  return_to text NOT NULL CHECK (return_to IN ('/home','/my','/onboarding')),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now()+interval '5 minutes'),
  consumed_at timestamptz,
  CHECK (expires_at>created_at AND expires_at<=created_at+interval '5 minutes')
);
CREATE INDEX oauth_states_expiry ON sixtysix.oauth_states(expires_at);
ALTER TABLE sixtysix.email_challenges DROP CONSTRAINT email_challenges_purpose_check;
ALTER TABLE sixtysix.email_challenges ADD CONSTRAINT email_challenges_purpose_check CHECK (purpose IN ('login','reauth','link'));
ALTER TABLE sixtysix.email_challenges ADD COLUMN intent_id uuid UNIQUE REFERENCES sixtysix.auth_intents(id);
ALTER TABLE sixtysix.email_challenges ADD CONSTRAINT email_challenges_intent_check CHECK ((purpose='login')=(intent_id IS NULL));
COMMIT;

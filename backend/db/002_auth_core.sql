-- Identity-first authentication. Provider verification is a separate server boundary.
BEGIN;
CREATE TABLE sixtysix.auth_identities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES sixtysix.app_users(id),
  provider text NOT NULL CHECK (provider IN ('email', 'kakao')),
  subject text NOT NULL CHECK (length(subject) BETWEEN 1 AND 320),
  created_at timestamptz NOT NULL DEFAULT now(),
  disabled_at timestamptz,
  UNIQUE (provider, subject)
);
CREATE INDEX auth_identities_user ON sixtysix.auth_identities(user_id);

CREATE TABLE sixtysix.auth_sessions (
  token_hash text PRIMARY KEY CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  user_id uuid NOT NULL REFERENCES sixtysix.app_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  reauthenticated_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  CHECK (expires_at > created_at)
);
CREATE INDEX auth_sessions_user ON sixtysix.auth_sessions(user_id);
CREATE INDEX auth_sessions_expiry ON sixtysix.auth_sessions(expires_at);

-- Only trusted OTP/OAuth verification code may insert these short-lived assertions.
-- No provider access token, email code, or raw browser/session token is stored here.
CREATE TABLE sixtysix.auth_proofs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL CHECK (provider IN ('email', 'kakao')),
  subject text NOT NULL CHECK (length(subject) BETWEEN 1 AND 320),
  purpose text NOT NULL CHECK (purpose IN ('login', 'reauth', 'link')),
  browser_binding_hash text NOT NULL CHECK (browser_binding_hash ~ '^[a-f0-9]{64}$'),
  session_binding_hash text REFERENCES sixtysix.auth_sessions(token_hash),
  link_intent_id uuid REFERENCES sixtysix.link_intents(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '5 minutes'),
  consumed_at timestamptz,
  CHECK (expires_at > created_at AND expires_at <= created_at + interval '5 minutes'),
  CHECK ((purpose = 'login' AND session_binding_hash IS NULL) OR
         (purpose IN ('reauth', 'link') AND session_binding_hash IS NOT NULL)),
  CHECK ((purpose = 'link') = (link_intent_id IS NOT NULL))
);
CREATE INDEX auth_proofs_expiry ON sixtysix.auth_proofs(expires_at);
COMMIT;

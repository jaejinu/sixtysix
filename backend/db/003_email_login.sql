BEGIN;
CREATE TABLE sixtysix.email_challenges (
  id uuid PRIMARY KEY,
  email text NOT NULL CHECK (length(email) BETWEEN 3 AND 320),
  browser_binding_hash text NOT NULL CHECK (browser_binding_hash ~ '^[a-f0-9]{64}$'),
  code_hash text NOT NULL CHECK (code_hash ~ '^[a-f0-9]{64}$'),
  purpose text NOT NULL DEFAULT 'login' CHECK (purpose = 'login'),
  delivery_state text NOT NULL DEFAULT 'pending' CHECK (delivery_state IN ('pending','sent','failed')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 3),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '5 minutes'),
  consumed_at timestamptz,
  CHECK (expires_at > created_at AND expires_at <= created_at + interval '5 minutes')
);
CREATE INDEX email_challenges_expiry ON sixtysix.email_challenges(expires_at);
CREATE TABLE sixtysix.auth_rate_limits (
  bucket_key text PRIMARY KEY CHECK (bucket_key ~ '^[a-f0-9]{64}$'),
  hits integer NOT NULL CHECK (hits > 0),
  expires_at timestamptz NOT NULL
);
CREATE INDEX auth_rate_limits_expiry ON sixtysix.auth_rate_limits(expires_at);
COMMIT;

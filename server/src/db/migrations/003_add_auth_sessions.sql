CREATE TABLE IF NOT EXISTS auth_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

  user_id UUID NOT NULL
    REFERENCES users(id)
    ON DELETE CASCADE,

  refresh_token_hash VARCHAR(255) NOT NULL UNIQUE,

  expires_at TIMESTAMPTZ NOT NULL,

  revoked_at TIMESTAMPTZ,

  replaced_by_session_id UUID
    REFERENCES auth_sessions(id)
    ON DELETE SET NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  last_used_at TIMESTAMPTZ,

  user_agent TEXT,

  ip_address INET
);

CREATE INDEX IF NOT EXISTS idx_auth_sessions_user
  ON auth_sessions(user_id);

CREATE INDEX IF NOT EXISTS idx_auth_sessions_expires
  ON auth_sessions(expires_at);

CREATE INDEX IF NOT EXISTS idx_auth_sessions_active
  ON auth_sessions(user_id, revoked_at, expires_at);
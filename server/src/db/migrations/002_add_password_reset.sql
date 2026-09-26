ALTER TABLE users
  ADD COLUMN IF NOT EXISTS password_reset_token_hash VARCHAR(255),
  ADD COLUMN IF NOT EXISTS password_reset_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS password_reset_sent_at TIMESTAMPTZ;
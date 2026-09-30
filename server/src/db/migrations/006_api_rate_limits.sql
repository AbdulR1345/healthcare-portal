CREATE TABLE IF NOT EXISTS api_rate_limits (
  limiter_key CHAR(64) PRIMARY KEY,
  hit_count INTEGER NOT NULL CHECK (hit_count >= 0),
  reset_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_api_rate_limits_reset_at
  ON api_rate_limits(reset_at);
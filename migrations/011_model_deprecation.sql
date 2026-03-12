-- Migration 011: Model deprecation overrides table
-- User-defined model name rewrites (supplements the built-in static map).

CREATE TABLE IF NOT EXISTS model_deprecation_overrides (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  from_model VARCHAR(255) NOT NULL,
  to_model VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE (user_id, from_model)
);

CREATE INDEX IF NOT EXISTS idx_model_deprecation_user
  ON model_deprecation_overrides (user_id);

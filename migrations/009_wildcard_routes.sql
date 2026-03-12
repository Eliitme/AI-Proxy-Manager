-- Migration 009: Wildcard model routing table
-- Maps glob patterns to concrete provider/model targets or combo names.

CREATE TABLE IF NOT EXISTS wildcard_routes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  pattern VARCHAR(255) NOT NULL,
  target VARCHAR(255) NOT NULL,
  priority INTEGER NOT NULL DEFAULT 100,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_wildcard_routes_user_priority
  ON wildcard_routes (user_id, priority ASC);

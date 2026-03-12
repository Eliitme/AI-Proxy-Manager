-- Migration 010: IP filter rules table
-- Supports per-user allowlist/blocklist with CIDR notation.

CREATE TABLE IF NOT EXISTS ip_filter_rules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  mode VARCHAR(10) NOT NULL CHECK (mode IN ('allow', 'block')),
  cidr VARCHAR(50) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ip_filter_rules_user
  ON ip_filter_rules (user_id);

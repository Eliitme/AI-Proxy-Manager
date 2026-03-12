-- Migration 008: Circuit breaker state table
-- Persists circuit breaker state across restarts for recovery and dashboard visibility.

CREATE TABLE IF NOT EXISTS circuit_breaker_state (
  connection_id UUID PRIMARY KEY REFERENCES provider_connections(id) ON DELETE CASCADE,
  state VARCHAR(20) NOT NULL DEFAULT 'closed' CHECK (state IN ('closed', 'open', 'half-open')),
  failure_count INTEGER NOT NULL DEFAULT 0,
  last_failure_at BIGINT,
  opened_at BIGINT,
  half_open_at BIGINT,
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_circuit_breaker_state
  ON circuit_breaker_state (state)
  WHERE state != 'closed';

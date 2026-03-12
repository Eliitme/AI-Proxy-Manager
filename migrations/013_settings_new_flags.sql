-- Migration 013: Add new feature flag columns to settings table
-- All new columns default to disabled/conservative values.

ALTER TABLE settings ADD COLUMN IF NOT EXISTS circuit_breaker_enabled BOOLEAN DEFAULT FALSE;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS circuit_breaker_failure_threshold INTEGER DEFAULT 5;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS circuit_breaker_recovery_window_ms INTEGER DEFAULT 60000;

ALTER TABLE settings ADD COLUMN IF NOT EXISTS idempotency_enabled BOOLEAN DEFAULT FALSE;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS idempotency_ttl_ms INTEGER DEFAULT 5000;

ALTER TABLE settings ADD COLUMN IF NOT EXISTS quota_preflight_enabled BOOLEAN DEFAULT FALSE;

ALTER TABLE settings ADD COLUMN IF NOT EXISTS signature_cache_enabled BOOLEAN DEFAULT FALSE;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS signature_cache_ttl_ms INTEGER DEFAULT 60000;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS semantic_cache_enabled BOOLEAN DEFAULT FALSE;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS semantic_cache_ttl_ms INTEGER DEFAULT 300000;

ALTER TABLE settings ADD COLUMN IF NOT EXISTS background_task_routing_enabled BOOLEAN DEFAULT FALSE;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS background_task_model VARCHAR(255) DEFAULT '';

ALTER TABLE settings ADD COLUMN IF NOT EXISTS mcp_server_enabled BOOLEAN DEFAULT FALSE;

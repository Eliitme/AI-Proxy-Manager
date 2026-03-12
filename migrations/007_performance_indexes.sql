-- Migration 007: Performance indexes for 100-user scale
-- All indexes use CONCURRENTLY to avoid locking tables during deployment.
-- Safe to run on a live database.

-- Hot path: getProviderConnections() is called on every proxy request.
-- Composite partial index eliminates the post-scan is_active filter.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_provider_connections_provider_active
  ON provider_connections (provider, is_active)
  WHERE is_active = true;

-- Settings table has no index; getSettings() runs a full sequential scan.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_settings_user_id
  ON settings (user_id);

-- request_logs: periodic cleanup DELETE and per-user log reads.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_request_logs_user_id_created
  ON request_logs (user_id, created_at DESC);

-- usage_history: filter queries by provider and model in usage stats/charts.
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_usage_history_provider
  ON usage_history (provider);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_usage_history_model
  ON usage_history (model);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_usage_history_connection
  ON usage_history (connection_id);

-- proxy_pools: fast lookup of active pools (migration 006 added no indexes).
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_proxy_pools_active
  ON proxy_pools (is_active)
  WHERE is_active = true;

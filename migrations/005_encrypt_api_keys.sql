-- Encrypt api_keys at rest: add key_hash (for lookup) and key_encrypted (ciphertext).
-- Existing rows keep key until backfilled; new rows use key_hash + key_encrypted only (key nullable).
-- Run backfill (Node script or app startup) to populate key_hash/key_encrypted from key, then run 006 to drop key.

-- Add new columns
ALTER TABLE api_keys
  ADD COLUMN IF NOT EXISTS key_hash VARCHAR(64),
  ADD COLUMN IF NOT EXISTS key_encrypted TEXT;

-- Allow key to be null for new rows (insert with key_hash + key_encrypted only)
ALTER TABLE api_keys
  ALTER COLUMN key DROP NOT NULL;

-- Unique on key_hash (multiple NULLs allowed in PostgreSQL)
CREATE UNIQUE INDEX IF NOT EXISTS idx_api_keys_key_hash ON api_keys (key_hash) WHERE key_hash IS NOT NULL;

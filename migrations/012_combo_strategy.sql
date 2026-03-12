-- Migration 012: Add strategy and weights columns to combos table
-- Existing combos default to 'ordered' strategy — no behaviour change.

ALTER TABLE combos ADD COLUMN IF NOT EXISTS strategy VARCHAR(50) NOT NULL DEFAULT 'ordered';
ALTER TABLE combos ADD COLUMN IF NOT EXISTS weights JSONB DEFAULT NULL;

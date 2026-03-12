-- Migration 014: Add ip_filter_enabled flag to settings table

ALTER TABLE settings ADD COLUMN IF NOT EXISTS ip_filter_enabled BOOLEAN DEFAULT TRUE;

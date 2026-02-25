-- Migration 005: Add sync_skipped_reason column to applications
-- Tracks why ActiveKG graph sync was skipped at enqueue time
ALTER TABLE applications ADD COLUMN IF NOT EXISTS sync_skipped_reason TEXT;

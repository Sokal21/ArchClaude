-- Migration 0002: Add death save tracking to PCs
-- Also adds concentration tracking field

ALTER TABLE pcs ADD COLUMN death_save_successes INTEGER NOT NULL DEFAULT 0;
ALTER TABLE pcs ADD COLUMN death_save_failures INTEGER NOT NULL DEFAULT 0;
ALTER TABLE pcs ADD COLUMN concentrating_on TEXT;

INSERT INTO schema_migrations (version, applied_at) VALUES (2, datetime('now'));

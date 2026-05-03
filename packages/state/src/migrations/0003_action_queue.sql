-- Migration 0003: Player action queue
-- Enables Player UI → SQLite queue → Combat Director polling pattern.
-- Claude can't receive WebSocket push, so actions are queued here
-- and polled via get_pending_actions during PC turns.

CREATE TABLE action_queue (
    id            INTEGER PRIMARY KEY,
    player_id     TEXT NOT NULL,
    action_type   TEXT NOT NULL,       -- 'attack', 'cast_spell', 'use_ability', 'other', 'say', 'roll', 'dm_inject'
    payload_json  TEXT NOT NULL,       -- full action details as JSON
    submitted_at  TEXT NOT NULL,
    processed     INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX action_queue_pending ON action_queue(processed, submitted_at);

INSERT INTO schema_migrations (version, applied_at) VALUES (3, datetime('now'));

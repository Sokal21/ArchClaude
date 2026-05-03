/**
 * Event log DAL — append-only event log with projection and revert.
 *
 * Architecture: The event log is the single source of truth for all
 * state changes. Tables are projections. Every mutation flows through
 * appendEvent() which stores the event and returns the created row.
 *
 * revert() marks an event as reverted (soft delete). Callers are
 * responsible for reversing the projected state change (e.g. restoring HP).
 * This is intentionally simple — full auto-revert from event replay
 * is deferred to Phase 5.
 *
 * project() returns the event stream for a session, used for recap
 * generation and debugging.
 */

import type { Database } from "better-sqlite3";
import type { GameEvent, EventSource } from "@archclaude/shared";
import type { EventInput, EventType } from "@archclaude/shared";
import { fromJson, toJson, toBool } from "./json-helpers.js";

interface EventRow {
  id: number;
  timestamp: string;
  session_id: number | null;
  source: string;
  type: string;
  payload_json: string;
  reverted: number;
}

function rowToEvent(row: EventRow): GameEvent {
  return {
    ...row,
    source: row.source as EventSource,
    payload_json: fromJson<Record<string, unknown>>(row.payload_json)!,
    reverted: toBool(row.reverted),
  };
}

export class EventDAL {
  constructor(private db: Database) {}

  getById(id: number): GameEvent | undefined {
    const row = this.db
      .prepare("SELECT * FROM events WHERE id = ?")
      .get(id) as EventRow | undefined;
    return row ? rowToEvent(row) : undefined;
  }

  /** Append a new event to the log. Returns the created event with id and timestamp. */
  append<T extends EventType>(input: EventInput<T>): GameEvent {
    const info = this.db
      .prepare(
        `INSERT INTO events (timestamp, session_id, source, type, payload_json)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(
        new Date().toISOString(),
        input.session_id ?? null,
        input.source,
        input.type,
        toJson(input.payload),
      );
    return this.getById(info.lastInsertRowid as number)!;
  }

  /**
   * Project the event stream for a session.
   * Returns events in chronological order, excluding reverted ones by default.
   */
  project(sessionId: number, includeReverted = false): GameEvent[] {
    const sql = includeReverted
      ? "SELECT * FROM events WHERE session_id = ? ORDER BY id"
      : "SELECT * FROM events WHERE session_id = ? AND reverted = 0 ORDER BY id";
    const rows = this.db.prepare(sql).all(sessionId) as EventRow[];
    return rows.map(rowToEvent);
  }

  /** Get events by type, optionally within a session. */
  listByType(type: string, sessionId?: number): GameEvent[] {
    if (sessionId !== undefined) {
      const rows = this.db
        .prepare(
          "SELECT * FROM events WHERE type = ? AND session_id = ? AND reverted = 0 ORDER BY id",
        )
        .all(type, sessionId) as EventRow[];
      return rows.map(rowToEvent);
    }
    const rows = this.db
      .prepare(
        "SELECT * FROM events WHERE type = ? AND reverted = 0 ORDER BY id",
      )
      .all(type) as EventRow[];
    return rows.map(rowToEvent);
  }

  /** Get recent events, most recent first. */
  recent(limit = 50): GameEvent[] {
    const rows = this.db
      .prepare(
        "SELECT * FROM events WHERE reverted = 0 ORDER BY id DESC LIMIT ?",
      )
      .all(limit) as EventRow[];
    return rows.map(rowToEvent);
  }

  /**
   * Mark an event as reverted (soft delete).
   * Returns true if the event was found and reverted, false if already reverted or not found.
   */
  revert(eventId: number): boolean {
    const result = this.db
      .prepare("UPDATE events SET reverted = 1 WHERE id = ? AND reverted = 0")
      .run(eventId);
    return result.changes > 0;
  }

  /** Count events, optionally by type or session. */
  count(filters?: { type?: string; session_id?: number }): number {
    let sql = "SELECT COUNT(*) as count FROM events WHERE reverted = 0";
    const values: unknown[] = [];

    if (filters?.type) {
      sql += " AND type = ?";
      values.push(filters.type);
    }
    if (filters?.session_id !== undefined) {
      sql += " AND session_id = ?";
      values.push(filters.session_id);
    }

    const row = this.db.prepare(sql).get(...values) as { count: number };
    return row.count;
  }
}

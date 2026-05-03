/**
 * Action queue DAL — FIFO queue for player/DM actions.
 *
 * Architecture: The Player UI sends actions via WebSocket → the Map MCP
 * writes them to this queue → the Combat Director polls via
 * get_pending_actions during PC turns.
 *
 * This bridges the gap between WebSocket push (Player UI) and
 * request/response pull (Claude via MCP tool calls).
 */

import type { Database } from "better-sqlite3";

export interface QueuedAction {
  id: number;
  player_id: string;
  action_type: string;
  payload_json: Record<string, unknown>;
  submitted_at: string;
  processed: boolean;
}

interface QueuedActionRow {
  id: number;
  player_id: string;
  action_type: string;
  payload_json: string;
  submitted_at: string;
  processed: number;
}

function rowToAction(row: QueuedActionRow): QueuedAction {
  return {
    ...row,
    payload_json: JSON.parse(row.payload_json),
    processed: row.processed !== 0,
  };
}

export class ActionQueueDAL {
  constructor(private db: Database) {}

  /** Add an action to the queue. */
  enqueue(data: {
    player_id: string;
    action_type: string;
    payload: Record<string, unknown>;
  }): QueuedAction {
    const info = this.db
      .prepare(
        "INSERT INTO action_queue (player_id, action_type, payload_json, submitted_at) VALUES (?, ?, ?, ?)",
      )
      .run(
        data.player_id,
        data.action_type,
        JSON.stringify(data.payload),
        new Date().toISOString(),
      );
    return this.getById(info.lastInsertRowid as number)!;
  }

  /** Get the next unprocessed action without marking it processed. */
  peek(): QueuedAction | undefined {
    const row = this.db
      .prepare("SELECT * FROM action_queue WHERE processed = 0 ORDER BY id LIMIT 1")
      .get() as QueuedActionRow | undefined;
    return row ? rowToAction(row) : undefined;
  }

  /** Get and mark the next unprocessed action as processed. */
  dequeue(): QueuedAction | undefined {
    const row = this.db
      .prepare("SELECT * FROM action_queue WHERE processed = 0 ORDER BY id LIMIT 1")
      .get() as QueuedActionRow | undefined;
    if (!row) return undefined;
    this.db.prepare("UPDATE action_queue SET processed = 1 WHERE id = ?").run(row.id);
    return rowToAction(row);
  }

  /** Get all pending (unprocessed) actions. */
  listPending(): QueuedAction[] {
    const rows = this.db
      .prepare("SELECT * FROM action_queue WHERE processed = 0 ORDER BY id")
      .all() as QueuedActionRow[];
    return rows.map(rowToAction);
  }

  /** Mark a specific action as processed. */
  markProcessed(id: number): boolean {
    return this.db
      .prepare("UPDATE action_queue SET processed = 1 WHERE id = ?")
      .run(id).changes > 0;
  }

  /** Get an action by ID. */
  getById(id: number): QueuedAction | undefined {
    const row = this.db
      .prepare("SELECT * FROM action_queue WHERE id = ?")
      .get(id) as QueuedActionRow | undefined;
    return row ? rowToAction(row) : undefined;
  }

  /** Clear all processed actions (cleanup). */
  clearProcessed(): number {
    return this.db
      .prepare("DELETE FROM action_queue WHERE processed = 1")
      .run().changes;
  }

  /** Count pending actions. */
  countPending(): number {
    return (
      this.db
        .prepare("SELECT COUNT(*) as c FROM action_queue WHERE processed = 0")
        .get() as { c: number }
    ).c;
  }
}

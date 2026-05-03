import type { Database } from "better-sqlite3";
import type { Session } from "@archclaude/shared";
import { fromJson, toJson } from "./json-helpers.js";

interface SessionRow {
  id: number;
  number: number;
  played_at: string | null;
  ended_at: string | null;
  summary_file: string | null;
  recap_file: string | null;
  key_events_json: string | null;
}

function rowToSession(row: SessionRow): Session {
  return {
    ...row,
    key_events_json: fromJson<string[]>(row.key_events_json),
  };
}

export class SessionDAL {
  constructor(private db: Database) {}

  getById(id: number): Session | undefined {
    const row = this.db
      .prepare("SELECT * FROM sessions WHERE id = ?")
      .get(id) as SessionRow | undefined;
    return row ? rowToSession(row) : undefined;
  }

  getByNumber(num: number): Session | undefined {
    const row = this.db
      .prepare("SELECT * FROM sessions WHERE number = ?")
      .get(num) as SessionRow | undefined;
    return row ? rowToSession(row) : undefined;
  }

  list(): Session[] {
    const rows = this.db
      .prepare("SELECT * FROM sessions ORDER BY number")
      .all() as SessionRow[];
    return rows.map(rowToSession);
  }

  create(data: {
    number: number;
    played_at?: string;
  }): Session {
    const info = this.db
      .prepare(
        "INSERT INTO sessions (number, played_at) VALUES (?, ?)",
      )
      .run(data.number, data.played_at ?? null);
    return this.getById(info.lastInsertRowid as number)!;
  }

  update(
    id: number,
    fields: Partial<
      Pick<Session, "played_at" | "ended_at" | "summary_file" | "recap_file" | "key_events_json">
    >,
  ): Session {
    const sets: string[] = [];
    const values: unknown[] = [];

    if (fields.played_at !== undefined) {
      sets.push("played_at = ?");
      values.push(fields.played_at);
    }
    if (fields.ended_at !== undefined) {
      sets.push("ended_at = ?");
      values.push(fields.ended_at);
    }
    if (fields.summary_file !== undefined) {
      sets.push("summary_file = ?");
      values.push(fields.summary_file);
    }
    if (fields.recap_file !== undefined) {
      sets.push("recap_file = ?");
      values.push(fields.recap_file);
    }
    if (fields.key_events_json !== undefined) {
      sets.push("key_events_json = ?");
      values.push(toJson(fields.key_events_json));
    }

    if (sets.length > 0) {
      values.push(id);
      this.db
        .prepare(`UPDATE sessions SET ${sets.join(", ")} WHERE id = ?`)
        .run(...values);
    }
    return this.getById(id)!;
  }

  delete(id: number): boolean {
    return this.db.prepare("DELETE FROM sessions WHERE id = ?").run(id).changes > 0;
  }
}

import type { Database } from "better-sqlite3";
import type { Secret, SecretStatus } from "@archclaude/shared";

export class SecretDAL {
  constructor(private db: Database) {}

  getById(id: number): Secret | undefined {
    return this.db.prepare("SELECT * FROM secrets WHERE id = ?").get(id) as
      | Secret
      | undefined;
  }

  list(filters?: { status?: SecretStatus }): Secret[] {
    if (filters?.status) {
      return this.db
        .prepare("SELECT * FROM secrets WHERE status = ? ORDER BY id")
        .all(filters.status) as Secret[];
    }
    return this.db
      .prepare("SELECT * FROM secrets ORDER BY id")
      .all() as Secret[];
  }

  listHidden(): Secret[] {
    return this.list({ status: "hidden" });
  }

  create(data: {
    topic?: string;
    text: string;
    related_npc_id?: number;
    related_location_id?: number;
    status?: SecretStatus;
    added_session?: number;
  }): Secret {
    const info = this.db
      .prepare(
        `INSERT INTO secrets (topic, text, related_npc_id, related_location_id, status, added_session)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        data.topic ?? null,
        data.text,
        data.related_npc_id ?? null,
        data.related_location_id ?? null,
        data.status ?? "hidden",
        data.added_session ?? null,
      );
    return this.getById(info.lastInsertRowid as number)!;
  }

  update(id: number, fields: Partial<Omit<Secret, "id">>): Secret {
    const sets: string[] = [];
    const values: unknown[] = [];

    for (const [key, val] of Object.entries(fields)) {
      sets.push(`${key} = ?`);
      values.push(val ?? null);
    }

    if (sets.length > 0) {
      values.push(id);
      this.db
        .prepare(`UPDATE secrets SET ${sets.join(", ")} WHERE id = ?`)
        .run(...values);
    }
    return this.getById(id)!;
  }

  delete(id: number): boolean {
    return this.db.prepare("DELETE FROM secrets WHERE id = ?").run(id)
      .changes > 0;
  }
}

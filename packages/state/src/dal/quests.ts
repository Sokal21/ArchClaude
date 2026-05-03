import type { Database } from "better-sqlite3";
import type { Quest, QuestState } from "@archclaude/shared";

export class QuestDAL {
  constructor(private db: Database) {}

  getById(id: number): Quest | undefined {
    return this.db.prepare("SELECT * FROM quests WHERE id = ?").get(id) as
      | Quest
      | undefined;
  }

  list(filters?: { state?: QuestState }): Quest[] {
    if (filters?.state) {
      return this.db
        .prepare("SELECT * FROM quests WHERE state = ? ORDER BY id")
        .all(filters.state) as Quest[];
    }
    return this.db
      .prepare("SELECT * FROM quests ORDER BY id")
      .all() as Quest[];
  }

  listActive(): Quest[] {
    return this.list({ state: "active" });
  }

  create(data: {
    title: string;
    state?: QuestState;
    summary?: string;
    giver_npc_id?: number;
    related_location_id?: number;
    introduced_session?: number;
    notes_file?: string;
  }): Quest {
    const info = this.db
      .prepare(
        `INSERT INTO quests (title, state, summary, giver_npc_id, related_location_id,
         introduced_session, notes_file)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        data.title,
        data.state ?? "active",
        data.summary ?? null,
        data.giver_npc_id ?? null,
        data.related_location_id ?? null,
        data.introduced_session ?? null,
        data.notes_file ?? null,
      );
    return this.getById(info.lastInsertRowid as number)!;
  }

  update(id: number, fields: Partial<Omit<Quest, "id">>): Quest {
    const sets: string[] = [];
    const values: unknown[] = [];

    for (const [key, val] of Object.entries(fields)) {
      sets.push(`${key} = ?`);
      values.push(val ?? null);
    }

    if (sets.length > 0) {
      values.push(id);
      this.db
        .prepare(`UPDATE quests SET ${sets.join(", ")} WHERE id = ?`)
        .run(...values);
    }
    return this.getById(id)!;
  }

  delete(id: number): boolean {
    return this.db.prepare("DELETE FROM quests WHERE id = ?").run(id).changes > 0;
  }
}

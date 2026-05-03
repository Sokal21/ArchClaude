import type { Database } from "better-sqlite3";
import type { NPC, NPCStatus } from "@archclaude/shared";

export class NPCDAL {
  constructor(private db: Database) {}

  getById(id: number): NPC | undefined {
    return this.db.prepare("SELECT * FROM npcs WHERE id = ?").get(id) as
      | NPC
      | undefined;
  }

  getByName(name: string): NPC | undefined {
    return this.db.prepare("SELECT * FROM npcs WHERE name = ?").get(name) as
      | NPC
      | undefined;
  }

  list(filters?: { status?: NPCStatus; faction?: string }): NPC[] {
    let sql = "SELECT * FROM npcs";
    const conditions: string[] = [];
    const values: unknown[] = [];

    if (filters?.status) {
      conditions.push("status = ?");
      values.push(filters.status);
    }
    if (filters?.faction) {
      conditions.push("faction = ?");
      values.push(filters.faction);
    }

    if (conditions.length > 0) {
      sql += " WHERE " + conditions.join(" AND ");
    }
    sql += " ORDER BY name";

    return this.db.prepare(sql).all(...values) as NPC[];
  }

  create(data: {
    name: string;
    role?: string;
    status?: NPCStatus;
    current_location?: string;
    faction?: string;
    voice_profile?: string;
    dossier_file?: string;
    introduced_session?: number;
    notes_summary?: string;
  }): NPC {
    const info = this.db
      .prepare(
        `INSERT INTO npcs (name, role, status, current_location, faction, voice_profile,
         dossier_file, introduced_session, notes_summary)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        data.name,
        data.role ?? null,
        data.status ?? "alive",
        data.current_location ?? null,
        data.faction ?? null,
        data.voice_profile ?? null,
        data.dossier_file ?? null,
        data.introduced_session ?? null,
        data.notes_summary ?? null,
      );
    return this.getById(info.lastInsertRowid as number)!;
  }

  update(id: number, fields: Partial<Omit<NPC, "id">>): NPC {
    const sets: string[] = [];
    const values: unknown[] = [];

    for (const [key, val] of Object.entries(fields)) {
      sets.push(`${key} = ?`);
      values.push(val ?? null);
    }

    if (sets.length > 0) {
      values.push(id);
      this.db
        .prepare(`UPDATE npcs SET ${sets.join(", ")} WHERE id = ?`)
        .run(...values);
    }
    return this.getById(id)!;
  }

  delete(id: number): boolean {
    return this.db.prepare("DELETE FROM npcs WHERE id = ?").run(id).changes > 0;
  }
}

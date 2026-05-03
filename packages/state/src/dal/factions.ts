import type { Database } from "better-sqlite3";
import type { Faction } from "@archclaude/shared";

export class FactionDAL {
  constructor(private db: Database) {}

  getById(id: number): Faction | undefined {
    return this.db.prepare("SELECT * FROM factions WHERE id = ?").get(id) as
      | Faction
      | undefined;
  }

  getByName(name: string): Faction | undefined {
    return this.db
      .prepare("SELECT * FROM factions WHERE name = ?")
      .get(name) as Faction | undefined;
  }

  list(): Faction[] {
    return this.db
      .prepare("SELECT * FROM factions ORDER BY name")
      .all() as Faction[];
  }

  create(data: {
    name: string;
    reputation?: number;
    status?: string;
    dossier_file?: string;
  }): Faction {
    const info = this.db
      .prepare(
        "INSERT INTO factions (name, reputation, status, dossier_file) VALUES (?, ?, ?, ?)",
      )
      .run(
        data.name,
        data.reputation ?? 0,
        data.status ?? null,
        data.dossier_file ?? null,
      );
    return this.getById(info.lastInsertRowid as number)!;
  }

  update(id: number, fields: Partial<Omit<Faction, "id">>): Faction {
    const sets: string[] = [];
    const values: unknown[] = [];

    for (const [key, val] of Object.entries(fields)) {
      sets.push(`${key} = ?`);
      values.push(val ?? null);
    }

    if (sets.length > 0) {
      values.push(id);
      this.db
        .prepare(`UPDATE factions SET ${sets.join(", ")} WHERE id = ?`)
        .run(...values);
    }
    return this.getById(id)!;
  }

  delete(id: number): boolean {
    return this.db.prepare("DELETE FROM factions WHERE id = ?").run(id)
      .changes > 0;
  }
}

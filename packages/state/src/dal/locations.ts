import type { Database } from "better-sqlite3";
import type { Location, LocationType, LocationStatus } from "@archclaude/shared";

export class LocationDAL {
  constructor(private db: Database) {}

  getById(id: number): Location | undefined {
    return this.db.prepare("SELECT * FROM locations WHERE id = ?").get(id) as
      | Location
      | undefined;
  }

  getByName(name: string): Location | undefined {
    return this.db
      .prepare("SELECT * FROM locations WHERE name = ?")
      .get(name) as Location | undefined;
  }

  list(filters?: { type?: LocationType; status?: LocationStatus; parent_id?: number }): Location[] {
    let sql = "SELECT * FROM locations";
    const conditions: string[] = [];
    const values: unknown[] = [];

    if (filters?.type) {
      conditions.push("type = ?");
      values.push(filters.type);
    }
    if (filters?.status) {
      conditions.push("status = ?");
      values.push(filters.status);
    }
    if (filters?.parent_id !== undefined) {
      conditions.push("parent_id = ?");
      values.push(filters.parent_id);
    }

    if (conditions.length > 0) {
      sql += " WHERE " + conditions.join(" AND ");
    }
    sql += " ORDER BY name";

    return this.db.prepare(sql).all(...values) as Location[];
  }

  create(data: {
    name: string;
    type?: LocationType;
    parent_id?: number;
    status?: LocationStatus;
    dossier_file?: string;
    introduced_session?: number;
  }): Location {
    const info = this.db
      .prepare(
        `INSERT INTO locations (name, type, parent_id, status, dossier_file, introduced_session)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        data.name,
        data.type ?? null,
        data.parent_id ?? null,
        data.status ?? "unknown",
        data.dossier_file ?? null,
        data.introduced_session ?? null,
      );
    return this.getById(info.lastInsertRowid as number)!;
  }

  update(id: number, fields: Partial<Omit<Location, "id">>): Location {
    const sets: string[] = [];
    const values: unknown[] = [];

    for (const [key, val] of Object.entries(fields)) {
      sets.push(`${key} = ?`);
      values.push(val ?? null);
    }

    if (sets.length > 0) {
      values.push(id);
      this.db
        .prepare(`UPDATE locations SET ${sets.join(", ")} WHERE id = ?`)
        .run(...values);
    }
    return this.getById(id)!;
  }

  delete(id: number): boolean {
    return this.db.prepare("DELETE FROM locations WHERE id = ?").run(id)
      .changes > 0;
  }
}

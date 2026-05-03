import type { Database } from "better-sqlite3";
import type { Seed, SeedStatus, SeedVisibility } from "@archclaude/shared";

export class SeedDAL {
  constructor(private db: Database) {}

  getById(id: number): Seed | undefined {
    return this.db.prepare("SELECT * FROM seeds WHERE id = ?").get(id) as
      | Seed
      | undefined;
  }

  list(filters?: { status?: SeedStatus; visibility?: SeedVisibility }): Seed[] {
    let sql = "SELECT * FROM seeds";
    const conditions: string[] = [];
    const values: unknown[] = [];

    if (filters?.status) {
      conditions.push("status = ?");
      values.push(filters.status);
    }
    if (filters?.visibility) {
      conditions.push("visibility = ?");
      values.push(filters.visibility);
    }

    if (conditions.length > 0) {
      sql += " WHERE " + conditions.join(" AND ");
    }
    sql += " ORDER BY id";

    return this.db.prepare(sql).all(...values) as Seed[];
  }

  listPlanted(): Seed[] {
    return this.list({ status: "planted" });
  }

  create(data: {
    text: string;
    trigger_condition?: string;
    visibility?: SeedVisibility;
    planted_session?: number;
  }): Seed {
    const info = this.db
      .prepare(
        `INSERT INTO seeds (text, trigger_condition, visibility, planted_session)
         VALUES (?, ?, ?, ?)`,
      )
      .run(
        data.text,
        data.trigger_condition ?? null,
        data.visibility ?? "public",
        data.planted_session ?? null,
      );
    return this.getById(info.lastInsertRowid as number)!;
  }

  update(id: number, fields: Partial<Omit<Seed, "id">>): Seed {
    const sets: string[] = [];
    const values: unknown[] = [];

    for (const [key, val] of Object.entries(fields)) {
      sets.push(`${key} = ?`);
      values.push(val ?? null);
    }

    if (sets.length > 0) {
      values.push(id);
      this.db
        .prepare(`UPDATE seeds SET ${sets.join(", ")} WHERE id = ?`)
        .run(...values);
    }
    return this.getById(id)!;
  }

  delete(id: number): boolean {
    return this.db.prepare("DELETE FROM seeds WHERE id = ?").run(id).changes > 0;
  }
}

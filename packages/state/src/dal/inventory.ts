import type { Database } from "better-sqlite3";
import type { InventoryItem, ItemKind } from "@archclaude/shared";

export class InventoryDAL {
  constructor(private db: Database) {}

  getById(id: number): InventoryItem | undefined {
    return this.db.prepare("SELECT * FROM inventory WHERE id = ?").get(id) as
      | InventoryItem
      | undefined;
  }

  listByOwner(ownerKind: "pc" | "party", ownerId?: number): InventoryItem[] {
    if (ownerKind === "party") {
      return this.db
        .prepare("SELECT * FROM inventory WHERE owner_kind = 'party' ORDER BY name")
        .all() as InventoryItem[];
    }
    return this.db
      .prepare(
        "SELECT * FROM inventory WHERE owner_kind = 'pc' AND owner_id = ? ORDER BY name",
      )
      .all(ownerId!) as InventoryItem[];
  }

  listAll(): InventoryItem[] {
    return this.db
      .prepare("SELECT * FROM inventory ORDER BY owner_kind, name")
      .all() as InventoryItem[];
  }

  create(data: {
    owner_kind: "pc" | "party";
    owner_id?: number;
    name: string;
    kind?: ItemKind;
    description?: string;
    qty?: number;
    notes?: string;
  }): InventoryItem {
    const info = this.db
      .prepare(
        `INSERT INTO inventory (owner_kind, owner_id, name, kind, description, qty, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        data.owner_kind,
        data.owner_id ?? null,
        data.name,
        data.kind ?? null,
        data.description ?? null,
        data.qty ?? 1,
        data.notes ?? null,
      );
    return this.getById(info.lastInsertRowid as number)!;
  }

  update(id: number, fields: Partial<Omit<InventoryItem, "id">>): InventoryItem {
    const sets: string[] = [];
    const values: unknown[] = [];

    for (const [key, val] of Object.entries(fields)) {
      sets.push(`${key} = ?`);
      values.push(val ?? null);
    }

    if (sets.length > 0) {
      values.push(id);
      this.db
        .prepare(`UPDATE inventory SET ${sets.join(", ")} WHERE id = ?`)
        .run(...values);
    }
    return this.getById(id)!;
  }

  delete(id: number): boolean {
    return this.db.prepare("DELETE FROM inventory WHERE id = ?").run(id)
      .changes > 0;
  }
}

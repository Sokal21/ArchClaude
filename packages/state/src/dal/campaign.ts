import type { Database } from "better-sqlite3";
import type { Campaign } from "@archclaude/shared";

export class CampaignDAL {
  constructor(private db: Database) {}

  get(): Campaign | undefined {
    return this.db.prepare("SELECT * FROM campaign WHERE id = 1").get() as
      | Campaign
      | undefined;
  }

  create(name: string, system = "5e-2024"): Campaign {
    this.db
      .prepare(
        "INSERT INTO campaign (id, name, system, schema_version, created_at) VALUES (1, ?, ?, 1, ?)",
      )
      .run(name, system, new Date().toISOString());
    return this.get()!;
  }

  update(fields: Partial<Pick<Campaign, "name" | "system">>): Campaign {
    if (fields.name !== undefined) {
      this.db
        .prepare("UPDATE campaign SET name = ? WHERE id = 1")
        .run(fields.name);
    }
    if (fields.system !== undefined) {
      this.db
        .prepare("UPDATE campaign SET system = ? WHERE id = 1")
        .run(fields.system);
    }
    return this.get()!;
  }
}

import type { Database } from "better-sqlite3";
import type { Clock, TimeOfDay, PartyState } from "@archclaude/shared";

export class ClockDAL {
  constructor(private db: Database) {}

  get(): Clock | undefined {
    return this.db.prepare("SELECT * FROM clock WHERE id = 1").get() as
      | Clock
      | undefined;
  }

  /** Initialize the clock (singleton row). Call once after campaign creation. */
  init(data?: {
    in_world_date?: string;
    time_of_day?: TimeOfDay;
    weather?: string;
    current_location_id?: number;
    party_state?: PartyState;
  }): Clock {
    this.db
      .prepare(
        `INSERT OR REPLACE INTO clock (id, in_world_date, time_of_day, weather, current_location_id, party_state)
         VALUES (1, ?, ?, ?, ?, ?)`,
      )
      .run(
        data?.in_world_date ?? null,
        data?.time_of_day ?? null,
        data?.weather ?? null,
        data?.current_location_id ?? null,
        data?.party_state ?? null,
      );
    return this.get()!;
  }

  update(fields: Partial<Omit<Clock, "id">>): Clock {
    const sets: string[] = [];
    const values: unknown[] = [];

    for (const [key, val] of Object.entries(fields)) {
      sets.push(`${key} = ?`);
      values.push(val ?? null);
    }

    if (sets.length > 0) {
      this.db
        .prepare(`UPDATE clock SET ${sets.join(", ")} WHERE id = 1`)
        .run(...values);
    }
    return this.get()!;
  }
}

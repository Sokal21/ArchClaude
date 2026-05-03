import type { Database } from "better-sqlite3";
import type {
  Combat,
  NPCInstance,
  InitiativeEntry,
  CombatOutcome,
  CombatIntensity,
} from "@archclaude/shared";
import { fromJson, toJson, toBool, fromBool } from "./json-helpers.js";

interface CombatRow {
  id: number;
  session_id: number;
  started_at: string;
  ended_at: string | null;
  outcome: string | null;
  initiative_json: string | null;
  current_turn: number;
  round_number: number;
  intensity: string;
  difficulty: string | null;
  narrative_context: string | null;
}

interface NPCInstanceRow {
  id: number;
  combat_id: number;
  npc_id: number | null;
  template_key: string | null;
  display_name: string;
  max_hp: number;
  current_hp: number;
  ac: number;
  conditions_json: string | null;
  map_token_id: string | null;
  defeated: number;
}

function rowToCombat(row: CombatRow): Combat {
  return {
    ...row,
    outcome: row.outcome as CombatOutcome | null,
    initiative_json: fromJson<InitiativeEntry[]>(row.initiative_json),
    intensity: row.intensity as CombatIntensity,
    difficulty: row.difficulty as Combat["difficulty"],
  };
}

function rowToInstance(row: NPCInstanceRow): NPCInstance {
  return {
    ...row,
    conditions_json: fromJson<string[]>(row.conditions_json),
    defeated: toBool(row.defeated),
  };
}

export class CombatDAL {
  constructor(private db: Database) {}

  // ── Combats ──

  getById(id: number): Combat | undefined {
    const row = this.db
      .prepare("SELECT * FROM combats WHERE id = ?")
      .get(id) as CombatRow | undefined;
    return row ? rowToCombat(row) : undefined;
  }

  getActive(): Combat | undefined {
    const row = this.db
      .prepare("SELECT * FROM combats WHERE ended_at IS NULL ORDER BY id DESC LIMIT 1")
      .get() as CombatRow | undefined;
    return row ? rowToCombat(row) : undefined;
  }

  listBySession(sessionId: number): Combat[] {
    return (
      this.db
        .prepare("SELECT * FROM combats WHERE session_id = ? ORDER BY id")
        .all(sessionId) as CombatRow[]
    ).map(rowToCombat);
  }

  createCombat(data: {
    session_id: number;
    intensity?: CombatIntensity;
    difficulty?: string;
    narrative_context?: string;
  }): Combat {
    const info = this.db
      .prepare(
        `INSERT INTO combats (session_id, started_at, intensity, difficulty, narrative_context)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(
        data.session_id,
        new Date().toISOString(),
        data.intensity ?? "normal",
        data.difficulty ?? null,
        data.narrative_context ?? null,
      );
    return this.getById(info.lastInsertRowid as number)!;
  }

  updateCombat(
    id: number,
    fields: Partial<
      Pick<
        Combat,
        | "ended_at"
        | "outcome"
        | "initiative_json"
        | "current_turn"
        | "round_number"
        | "intensity"
      >
    >,
  ): Combat {
    const sets: string[] = [];
    const values: unknown[] = [];

    if (fields.ended_at !== undefined) {
      sets.push("ended_at = ?");
      values.push(fields.ended_at);
    }
    if (fields.outcome !== undefined) {
      sets.push("outcome = ?");
      values.push(fields.outcome);
    }
    if (fields.initiative_json !== undefined) {
      sets.push("initiative_json = ?");
      values.push(toJson(fields.initiative_json));
    }
    if (fields.current_turn !== undefined) {
      sets.push("current_turn = ?");
      values.push(fields.current_turn);
    }
    if (fields.round_number !== undefined) {
      sets.push("round_number = ?");
      values.push(fields.round_number);
    }
    if (fields.intensity !== undefined) {
      sets.push("intensity = ?");
      values.push(fields.intensity);
    }

    if (sets.length > 0) {
      values.push(id);
      this.db
        .prepare(`UPDATE combats SET ${sets.join(", ")} WHERE id = ?`)
        .run(...values);
    }
    return this.getById(id)!;
  }

  // ── NPC Instances ──

  getInstance(id: number): NPCInstance | undefined {
    const row = this.db
      .prepare("SELECT * FROM npc_instances WHERE id = ?")
      .get(id) as NPCInstanceRow | undefined;
    return row ? rowToInstance(row) : undefined;
  }

  listInstances(combatId: number): NPCInstance[] {
    return (
      this.db
        .prepare("SELECT * FROM npc_instances WHERE combat_id = ?")
        .all(combatId) as NPCInstanceRow[]
    ).map(rowToInstance);
  }

  createInstance(data: {
    combat_id: number;
    npc_id?: number;
    template_key?: string;
    display_name: string;
    max_hp: number;
    current_hp: number;
    ac: number;
  }): NPCInstance {
    const info = this.db
      .prepare(
        `INSERT INTO npc_instances (combat_id, npc_id, template_key, display_name, max_hp, current_hp, ac)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        data.combat_id,
        data.npc_id ?? null,
        data.template_key ?? null,
        data.display_name,
        data.max_hp,
        data.current_hp,
        data.ac,
      );
    return this.getInstance(info.lastInsertRowid as number)!;
  }

  updateInstance(
    id: number,
    fields: Partial<
      Pick<NPCInstance, "current_hp" | "conditions_json" | "map_token_id" | "defeated">
    >,
  ): NPCInstance {
    const sets: string[] = [];
    const values: unknown[] = [];

    if (fields.current_hp !== undefined) {
      sets.push("current_hp = ?");
      values.push(fields.current_hp);
    }
    if (fields.conditions_json !== undefined) {
      sets.push("conditions_json = ?");
      values.push(toJson(fields.conditions_json));
    }
    if (fields.map_token_id !== undefined) {
      sets.push("map_token_id = ?");
      values.push(fields.map_token_id);
    }
    if (fields.defeated !== undefined) {
      sets.push("defeated = ?");
      values.push(fromBool(fields.defeated));
    }

    if (sets.length > 0) {
      values.push(id);
      this.db
        .prepare(`UPDATE npc_instances SET ${sets.join(", ")} WHERE id = ?`)
        .run(...values);
    }
    return this.getInstance(id)!;
  }
}

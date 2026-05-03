import type { Database } from "better-sqlite3";
import type { PC, Senses, Saves, SpellSlots } from "@archclaude/shared";
import { fromJson, toJson, toBool, fromBool } from "./json-helpers.js";

interface PCRow {
  id: number;
  name: string;
  player_name: string | null;
  class: string | null;
  subclass: string | null;
  level: number;
  max_hp: number;
  current_hp: number;
  temp_hp: number;
  ac: number;
  initiative_bonus: number;
  speed_walk: number;
  speed_fly: number;
  speed_swim: number;
  senses_json: string | null;
  saves_json: string | null;
  spell_slots_json: string | null;
  resistances_json: string | null;
  immunities_json: string | null;
  conditions_json: string | null;
  dossier_file: string | null;
  voice_profile: string | null;
  active: number;
  notes: string | null;
}

function rowToPC(row: PCRow): PC {
  return {
    ...row,
    senses_json: fromJson<Senses>(row.senses_json),
    saves_json: fromJson<Saves>(row.saves_json),
    spell_slots_json: fromJson<SpellSlots>(row.spell_slots_json),
    resistances_json: fromJson<string[]>(row.resistances_json),
    immunities_json: fromJson<string[]>(row.immunities_json),
    conditions_json: fromJson<string[]>(row.conditions_json),
    active: toBool(row.active),
  };
}

export class PCDAL {
  constructor(private db: Database) {}

  getById(id: number): PC | undefined {
    const row = this.db.prepare("SELECT * FROM pcs WHERE id = ?").get(id) as
      | PCRow
      | undefined;
    return row ? rowToPC(row) : undefined;
  }

  getByName(name: string): PC | undefined {
    const row = this.db
      .prepare("SELECT * FROM pcs WHERE name = ?")
      .get(name) as PCRow | undefined;
    return row ? rowToPC(row) : undefined;
  }

  listActive(): PC[] {
    return (
      this.db.prepare("SELECT * FROM pcs WHERE active = 1").all() as PCRow[]
    ).map(rowToPC);
  }

  listAll(): PC[] {
    return (this.db.prepare("SELECT * FROM pcs").all() as PCRow[]).map(rowToPC);
  }

  create(data: {
    name: string;
    player_name?: string;
    class?: string;
    subclass?: string;
    level: number;
    max_hp: number;
    current_hp: number;
    ac: number;
    initiative_bonus?: number;
    speed_walk?: number;
    senses_json?: Senses;
    saves_json?: Saves;
    dossier_file?: string;
  }): PC {
    const info = this.db
      .prepare(
        `INSERT INTO pcs (name, player_name, class, subclass, level, max_hp, current_hp, ac,
         initiative_bonus, speed_walk, senses_json, saves_json, dossier_file)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        data.name,
        data.player_name ?? null,
        data.class ?? null,
        data.subclass ?? null,
        data.level,
        data.max_hp,
        data.current_hp,
        data.ac,
        data.initiative_bonus ?? 0,
        data.speed_walk ?? 30,
        toJson(data.senses_json),
        toJson(data.saves_json),
        data.dossier_file ?? null,
      );
    return this.getById(info.lastInsertRowid as number)!;
  }

  update(id: number, fields: Partial<Omit<PC, "id">>): PC {
    const sets: string[] = [];
    const values: unknown[] = [];

    const simple: (keyof Omit<PC, "id" | "active" | "senses_json" | "saves_json" | "spell_slots_json" | "resistances_json" | "immunities_json" | "conditions_json">)[] = [
      "name", "player_name", "class", "subclass", "level",
      "max_hp", "current_hp", "temp_hp", "ac", "initiative_bonus",
      "speed_walk", "speed_fly", "speed_swim", "dossier_file",
      "voice_profile", "notes",
    ];

    for (const key of simple) {
      if (fields[key] !== undefined) {
        sets.push(`${key} = ?`);
        values.push(fields[key]);
      }
    }

    const jsonFields: (keyof Pick<PC, "senses_json" | "saves_json" | "spell_slots_json" | "resistances_json" | "immunities_json" | "conditions_json">)[] = [
      "senses_json", "saves_json", "spell_slots_json",
      "resistances_json", "immunities_json", "conditions_json",
    ];

    for (const key of jsonFields) {
      if (fields[key] !== undefined) {
        sets.push(`${key} = ?`);
        values.push(toJson(fields[key]));
      }
    }

    if (fields.active !== undefined) {
      sets.push("active = ?");
      values.push(fromBool(fields.active));
    }

    if (sets.length > 0) {
      values.push(id);
      this.db
        .prepare(`UPDATE pcs SET ${sets.join(", ")} WHERE id = ?`)
        .run(...values);
    }
    return this.getById(id)!;
  }

  delete(id: number): boolean {
    return this.db.prepare("DELETE FROM pcs WHERE id = ?").run(id).changes > 0;
  }
}

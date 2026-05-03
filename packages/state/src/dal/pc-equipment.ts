/**
 * PC Equipment DAL — manages weapons, armor, skills, and save proficiencies.
 */

import type { Database } from "better-sqlite3";
import type { PCWeapon, PCArmor, PCSkill } from "@archclaude/shared";
import { fromJson, toJson, toBool, fromBool } from "./json-helpers.js";

interface WeaponRow {
  id: number;
  pc_id: number;
  name: string;
  slug: string | null;
  to_hit: number;
  damage_dice: string;
  damage_bonus: number;
  damage_type: string;
  properties: string | null;
  range_normal: number | null;
  range_long: number | null;
  is_magic: number;
  notes: string | null;
}

function rowToWeapon(row: WeaponRow): PCWeapon {
  return {
    ...row,
    properties: fromJson<string[]>(row.properties),
    is_magic: toBool(row.is_magic),
  };
}

export class PCEquipmentDAL {
  constructor(private db: Database) {}

  // ── Weapons ──

  listWeapons(pcId: number): PCWeapon[] {
    return (this.db.prepare("SELECT * FROM pc_weapons WHERE pc_id = ?").all(pcId) as WeaponRow[])
      .map(rowToWeapon);
  }

  addWeapon(data: {
    pc_id: number;
    name: string;
    slug?: string;
    to_hit: number;
    damage_dice: string;
    damage_bonus?: number;
    damage_type: string;
    properties?: string[];
    range_normal?: number;
    range_long?: number;
    is_magic?: boolean;
    notes?: string;
  }): PCWeapon {
    const info = this.db.prepare(
      `INSERT INTO pc_weapons (pc_id, name, slug, to_hit, damage_dice, damage_bonus, damage_type, properties, range_normal, range_long, is_magic, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      data.pc_id, data.name, data.slug ?? null, data.to_hit,
      data.damage_dice, data.damage_bonus ?? 0, data.damage_type,
      toJson(data.properties), data.range_normal ?? null,
      data.range_long ?? null, fromBool(data.is_magic ?? false),
      data.notes ?? null,
    );
    return rowToWeapon(
      this.db.prepare("SELECT * FROM pc_weapons WHERE id = ?").get(info.lastInsertRowid as number) as WeaponRow,
    );
  }

  removeWeapon(id: number): boolean {
    return this.db.prepare("DELETE FROM pc_weapons WHERE id = ?").run(id).changes > 0;
  }

  // ── Armor ──

  listArmor(pcId: number): PCArmor[] {
    return this.db.prepare("SELECT * FROM pc_armor WHERE pc_id = ?").all(pcId) as PCArmor[];
  }

  addArmor(data: {
    pc_id: number;
    name: string;
    slug?: string;
    base_ac: number;
    ac_bonus?: number;
    type: string;
    notes?: string;
  }): PCArmor {
    const info = this.db.prepare(
      "INSERT INTO pc_armor (pc_id, name, slug, base_ac, ac_bonus, type, notes) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).run(data.pc_id, data.name, data.slug ?? null, data.base_ac, data.ac_bonus ?? 0, data.type, data.notes ?? null);
    return this.db.prepare("SELECT * FROM pc_armor WHERE id = ?").get(info.lastInsertRowid as number) as PCArmor;
  }

  removeArmor(id: number): boolean {
    return this.db.prepare("DELETE FROM pc_armor WHERE id = ?").run(id).changes > 0;
  }

  // ── Skills ──

  listSkills(pcId: number): PCSkill[] {
    return this.db.prepare("SELECT * FROM pc_skills WHERE pc_id = ?").all(pcId) as PCSkill[];
  }

  addSkill(pcId: number, skill: string, ability: string, proficient = 1): void {
    this.db.prepare(
      "INSERT OR REPLACE INTO pc_skills (pc_id, skill, ability, proficient) VALUES (?, ?, ?, ?)",
    ).run(pcId, skill, ability, proficient);
  }

  // ── Save proficiencies ──

  listSaveProficiencies(pcId: number): string[] {
    return (this.db.prepare("SELECT ability FROM pc_save_proficiencies WHERE pc_id = ?").all(pcId) as { ability: string }[])
      .map((r) => r.ability);
  }

  addSaveProficiency(pcId: number, ability: string): void {
    this.db.prepare(
      "INSERT OR REPLACE INTO pc_save_proficiencies (pc_id, ability) VALUES (?, ?)",
    ).run(pcId, ability);
  }
}

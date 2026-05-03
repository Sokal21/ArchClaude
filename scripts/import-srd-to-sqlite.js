#!/usr/bin/env node

/**
 * Import SRD JSON cache into a SQLite database for Metabase browsing.
 *
 * Reads monsters.json, spells.json, conditions.json from ~/.archclaude/srd-cache/
 * and writes them into a SQLite DB at ~/.archclaude/srd-cache/bestiary.db
 *
 * Usage: node scripts/import-srd-to-sqlite.js
 */

import { createRequire } from "node:module";
import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(join(__dirname, "..", "packages", "state", "package.json"));
const Database = require("better-sqlite3");

const CACHE_DIR = join(homedir(), ".archclaude", "srd-cache");
const DB_PATH = join(CACHE_DIR, "bestiary.db");

function main() {
  if (!existsSync(join(CACHE_DIR, "monsters.json"))) {
    console.error("SRD cache not found. Run: pnpm --filter @archclaude/bestiary cache:pull");
    process.exit(1);
  }

  console.log(`Importing SRD data into ${DB_PATH}...`);

  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");

  // Create tables
  db.exec(`
    DROP TABLE IF EXISTS monsters;
    DROP TABLE IF EXISTS spells;
    DROP TABLE IF EXISTS conditions;

    CREATE TABLE monsters (
      slug TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      size TEXT,
      type TEXT,
      subtype TEXT,
      alignment TEXT,
      armor_class INTEGER,
      armor_desc TEXT,
      hit_points INTEGER,
      hit_dice TEXT,
      speed_json TEXT,
      strength INTEGER,
      dexterity INTEGER,
      constitution INTEGER,
      intelligence INTEGER,
      wisdom INTEGER,
      charisma INTEGER,
      challenge_rating TEXT,
      cr REAL,
      damage_vulnerabilities TEXT,
      damage_resistances TEXT,
      damage_immunities TEXT,
      condition_immunities TEXT,
      senses TEXT,
      languages TEXT,
      actions_json TEXT,
      special_abilities_json TEXT,
      legendary_actions_json TEXT,
      reactions_json TEXT,
      environments_json TEXT
    );

    CREATE TABLE spells (
      slug TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      desc TEXT,
      higher_level TEXT,
      level TEXT,
      school TEXT,
      casting_time TEXT,
      range TEXT,
      duration TEXT,
      concentration TEXT,
      components TEXT,
      material TEXT
    );

    CREATE TABLE conditions (
      slug TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      desc TEXT
    );

    DROP TABLE IF EXISTS weapons;
    DROP TABLE IF EXISTS armor;
    DROP TABLE IF EXISTS magic_items;

    CREATE TABLE weapons (
      slug TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT,
      cost TEXT,
      damage_dice TEXT,
      damage_type TEXT,
      weight TEXT,
      properties_json TEXT
    );

    CREATE TABLE armor (
      slug TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT,
      base_ac INTEGER,
      plus_dex_mod INTEGER,
      plus_max INTEGER,
      ac_string TEXT,
      strength_requirement TEXT,
      cost TEXT,
      weight TEXT,
      stealth_disadvantage INTEGER
    );

    CREATE TABLE magic_items (
      slug TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT,
      desc TEXT,
      rarity TEXT,
      requires_attunement TEXT
    );
  `);

  // Import monsters
  const monsters = JSON.parse(readFileSync(join(CACHE_DIR, "monsters.json"), "utf-8"));
  const insertMonster = db.prepare(`
    INSERT INTO monsters (slug, name, size, type, subtype, alignment, armor_class, armor_desc,
      hit_points, hit_dice, speed_json, strength, dexterity, constitution, intelligence, wisdom,
      charisma, challenge_rating, cr, damage_vulnerabilities, damage_resistances, damage_immunities,
      condition_immunities, senses, languages, actions_json, special_abilities_json,
      legendary_actions_json, reactions_json, environments_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertMonsters = db.transaction((data) => {
    for (const m of data) {
      insertMonster.run(
        m.slug, m.name, m.size, m.type, m.subtype, m.alignment,
        m.armor_class, m.armor_desc, m.hit_points, m.hit_dice,
        JSON.stringify(m.speed), m.strength, m.dexterity, m.constitution,
        m.intelligence, m.wisdom, m.charisma, m.challenge_rating, m.cr,
        m.damage_vulnerabilities, m.damage_resistances, m.damage_immunities,
        m.condition_immunities, m.senses, m.languages,
        JSON.stringify(m.actions), JSON.stringify(m.special_abilities),
        JSON.stringify(m.legendary_actions), JSON.stringify(m.reactions),
        JSON.stringify(m.environments),
      );
    }
  });
  insertMonsters(monsters);
  console.log(`  ${monsters.length} monsters imported.`);

  // Import spells
  const spells = JSON.parse(readFileSync(join(CACHE_DIR, "spells.json"), "utf-8"));
  const insertSpell = db.prepare(`
    INSERT INTO spells (slug, name, desc, higher_level, level, school, casting_time,
      range, duration, concentration, components, material)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertSpells = db.transaction((data) => {
    for (const s of data) {
      insertSpell.run(
        s.slug, s.name, s.desc, s.higher_level, s.level, s.school,
        s.casting_time, s.range, s.duration, s.concentration,
        s.components, s.material,
      );
    }
  });
  insertSpells(spells);
  console.log(`  ${spells.length} spells imported.`);

  // Import conditions
  const conditions = JSON.parse(readFileSync(join(CACHE_DIR, "conditions.json"), "utf-8"));
  const insertCondition = db.prepare("INSERT INTO conditions (slug, name, desc) VALUES (?, ?, ?)");

  const insertConditions = db.transaction((data) => {
    for (const c of data) {
      insertCondition.run(c.slug, c.name, c.desc);
    }
  });
  insertConditions(conditions);
  console.log(`  ${conditions.length} conditions imported.`);

  // Import weapons
  if (existsSync(join(CACHE_DIR, "weapons.json"))) {
    const weapons = JSON.parse(readFileSync(join(CACHE_DIR, "weapons.json"), "utf-8"));
    const insertWeapon = db.prepare(
      "INSERT INTO weapons (slug, name, category, cost, damage_dice, damage_type, weight, properties_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    );
    const insertWeapons = db.transaction((data) => {
      for (const w of data) {
        insertWeapon.run(w.slug, w.name, w.category, w.cost, w.damage_dice, w.damage_type, w.weight, JSON.stringify(w.properties));
      }
    });
    insertWeapons(weapons);
    console.log(`  ${weapons.length} weapons imported.`);
  }

  // Import armor
  if (existsSync(join(CACHE_DIR, "armor.json"))) {
    const armorData = JSON.parse(readFileSync(join(CACHE_DIR, "armor.json"), "utf-8"));
    const insertArmor = db.prepare(
      "INSERT INTO armor (slug, name, category, base_ac, plus_dex_mod, plus_max, ac_string, strength_requirement, cost, weight, stealth_disadvantage) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    );
    const insertArmors = db.transaction((data) => {
      for (const a of data) {
        insertArmor.run(a.slug, a.name, a.category, a.base_ac, a.plus_dex_mod ? 1 : 0, a.plus_max, a.ac_string, a.strength_requirement, a.cost, a.weight, a.stealth_disadvantage ? 1 : 0);
      }
    });
    insertArmors(armorData);
    console.log(`  ${armorData.length} armor imported.`);
  }

  // Import magic items
  if (existsSync(join(CACHE_DIR, "magicitems.json"))) {
    const items = JSON.parse(readFileSync(join(CACHE_DIR, "magicitems.json"), "utf-8"));
    const insertMagicItem = db.prepare(
      "INSERT INTO magic_items (slug, name, type, desc, rarity, requires_attunement) VALUES (?, ?, ?, ?, ?, ?)"
    );
    const insertMagicItems = db.transaction((data) => {
      for (const i of data) {
        insertMagicItem.run(i.slug, i.name, i.type, i.desc, i.rarity, i.requires_attunement);
      }
    });
    insertMagicItems(items);
    console.log(`  ${items.length} magic items imported.`);
  }

  db.close();
  console.log(`\nDone. Bestiary DB at: ${DB_PATH}`);
}

main();

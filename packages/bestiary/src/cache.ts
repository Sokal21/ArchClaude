/**
 * Open5e SRD local cache.
 *
 * Pulls monsters, spells, and conditions from the Open5e API and stores
 * them as JSON files in ~/.archclaude/srd-cache/. The cache is shared
 * across all campaigns — it's reference data, not campaign state.
 *
 * Architecture: The cache is a simple file-per-collection approach.
 * On first use (or `cache:pull`), we fetch all SRD data and write it
 * to disk. Subsequent reads load from disk. The Bestiary MCP server
 * reads from this cache rather than hitting the API at runtime.
 *
 * Open5e API: https://api.open5e.com/v1/
 * SRD content only — no copyrighted material.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import type { MonsterStatBlock, SpellDetail, ConditionDetail, WeaponDetail, ArmorDetail, MagicItemDetail } from "./types.js";

const CACHE_DIR = join(homedir(), ".archclaude", "srd-cache");
const MONSTERS_FILE = join(CACHE_DIR, "monsters.json");
const SPELLS_FILE = join(CACHE_DIR, "spells.json");
const CONDITIONS_FILE = join(CACHE_DIR, "conditions.json");
const WEAPONS_FILE = join(CACHE_DIR, "weapons.json");
const ARMOR_FILE = join(CACHE_DIR, "armor.json");
const MAGIC_ITEMS_FILE = join(CACHE_DIR, "magicitems.json");

function ensureCacheDir(): void {
  if (!existsSync(CACHE_DIR)) {
    mkdirSync(CACHE_DIR, { recursive: true });
  }
}

/** Fetch all pages from an Open5e paginated endpoint. */
async function fetchAllPages<T>(baseUrl: string): Promise<T[]> {
  const results: T[] = [];
  let url: string | null = baseUrl;

  while (url) {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Open5e API error: ${response.status} ${response.statusText} for ${url}`);
    }
    const data = (await response.json()) as { results: T[]; next: string | null };
    results.push(...data.results);
    url = data.next;
  }

  return results;
}

/**
 * Pull all SRD data from Open5e and write to cache.
 * This is a one-time operation; takes ~30 seconds.
 */
export async function pullCache(): Promise<{
  monsters: number;
  spells: number;
  conditions: number;
  weapons: number;
  armor: number;
  magicItems: number;
}> {
  ensureCacheDir();

  console.log("Pulling SRD monsters from Open5e...");
  const monsters = await fetchAllPages<MonsterStatBlock>(
    "https://api.open5e.com/v1/monsters/?document__slug=wotc-srd&limit=100&fields=slug,name,size,type,subtype,alignment,armor_class,armor_desc,hit_points,hit_dice,speed,strength,dexterity,constitution,intelligence,wisdom,charisma,strength_save,dexterity_save,constitution_save,intelligence_save,wisdom_save,charisma_save,perception,damage_vulnerabilities,damage_resistances,damage_immunities,condition_immunities,senses,languages,challenge_rating,cr,actions,special_abilities,legendary_actions,reactions,environments,document__slug",
  );
  writeFileSync(MONSTERS_FILE, JSON.stringify(monsters, null, 2));
  console.log(`  ${monsters.length} monsters cached.`);

  console.log("Pulling SRD spells from Open5e...");
  const spells = await fetchAllPages<SpellDetail>(
    "https://api.open5e.com/v1/spells/?document__slug=wotc-srd&limit=100",
  );
  writeFileSync(SPELLS_FILE, JSON.stringify(spells, null, 2));
  console.log(`  ${spells.length} spells cached.`);

  console.log("Pulling conditions from Open5e...");
  const conditions = await fetchAllPages<ConditionDetail>(
    "https://api.open5e.com/v1/conditions/?limit=100",
  );
  writeFileSync(CONDITIONS_FILE, JSON.stringify(conditions, null, 2));
  console.log(`  ${conditions.length} conditions cached.`);

  console.log("Pulling SRD weapons from Open5e...");
  const weapons = await fetchAllPages<WeaponDetail>(
    "https://api.open5e.com/v1/weapons/?document__slug=wotc-srd&limit=100",
  );
  writeFileSync(WEAPONS_FILE, JSON.stringify(weapons, null, 2));
  console.log(`  ${weapons.length} weapons cached.`);

  console.log("Pulling SRD armor from Open5e...");
  const armor = await fetchAllPages<ArmorDetail>(
    "https://api.open5e.com/v1/armor/?document__slug=wotc-srd&limit=100",
  );
  writeFileSync(ARMOR_FILE, JSON.stringify(armor, null, 2));
  console.log(`  ${armor.length} armor cached.`);

  console.log("Pulling SRD magic items from Open5e...");
  const magicItems = await fetchAllPages<MagicItemDetail>(
    "https://api.open5e.com/v1/magicitems/?document__slug=wotc-srd&limit=100",
  );
  writeFileSync(MAGIC_ITEMS_FILE, JSON.stringify(magicItems, null, 2));
  console.log(`  ${magicItems.length} magic items cached.`);

  return {
    monsters: monsters.length,
    spells: spells.length,
    conditions: conditions.length,
    weapons: weapons.length,
    armor: armor.length,
    magicItems: magicItems.length,
  };
}

/** Load cached monsters. Returns empty array if cache doesn't exist. */
export function loadMonsters(): MonsterStatBlock[] {
  if (!existsSync(MONSTERS_FILE)) return [];
  return JSON.parse(readFileSync(MONSTERS_FILE, "utf-8")) as MonsterStatBlock[];
}

/** Load cached spells. */
export function loadSpells(): SpellDetail[] {
  if (!existsSync(SPELLS_FILE)) return [];
  return JSON.parse(readFileSync(SPELLS_FILE, "utf-8")) as SpellDetail[];
}

/** Load cached conditions. */
export function loadConditions(): ConditionDetail[] {
  if (!existsSync(CONDITIONS_FILE)) return [];
  return JSON.parse(readFileSync(CONDITIONS_FILE, "utf-8")) as ConditionDetail[];
}

/** Load cached weapons. */
export function loadWeapons(): WeaponDetail[] {
  if (!existsSync(WEAPONS_FILE)) return [];
  return JSON.parse(readFileSync(WEAPONS_FILE, "utf-8")) as WeaponDetail[];
}

/** Load cached armor. */
export function loadArmor(): ArmorDetail[] {
  if (!existsSync(ARMOR_FILE)) return [];
  return JSON.parse(readFileSync(ARMOR_FILE, "utf-8")) as ArmorDetail[];
}

/** Load cached magic items. */
export function loadMagicItems(): MagicItemDetail[] {
  if (!existsSync(MAGIC_ITEMS_FILE)) return [];
  return JSON.parse(readFileSync(MAGIC_ITEMS_FILE, "utf-8")) as MagicItemDetail[];
}

/** Check if the SRD cache has been populated (core files). */
export function isCachePopulated(): boolean {
  return existsSync(MONSTERS_FILE) && existsSync(SPELLS_FILE) && existsSync(CONDITIONS_FILE);
}

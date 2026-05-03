/**
 * In-memory search over the cached SRD data.
 *
 * The cache is loaded once at startup. Search is fast — we're talking
 * ~300 monsters, not millions. Simple filtering beats a search index here.
 */

import type { MonsterStatBlock, SpellDetail, SearchFilters } from "./types.js";

/** Parse CR string ("1/4", "1", "10") to numeric value. */
export function parseCR(cr: string): number {
  if (cr.includes("/")) {
    const [num, den] = cr.split("/").map(Number);
    return num / den;
  }
  return parseFloat(cr);
}

export function searchMonsters(
  monsters: MonsterStatBlock[],
  filters: SearchFilters,
): MonsterStatBlock[] {
  let results = monsters;

  if (filters.cr_min !== undefined) {
    results = results.filter((m) => m.cr >= filters.cr_min!);
  }
  if (filters.cr_max !== undefined) {
    results = results.filter((m) => m.cr <= filters.cr_max!);
  }
  if (filters.type) {
    const type = filters.type.toLowerCase();
    results = results.filter((m) => m.type.toLowerCase().includes(type));
  }
  if (filters.size) {
    const size = filters.size.toLowerCase();
    results = results.filter((m) => m.size.toLowerCase() === size);
  }
  if (filters.environment) {
    const env = filters.environment.toLowerCase();
    results = results.filter((m) =>
      m.environments?.some((e) => e.toLowerCase().includes(env)),
    );
  }
  if (filters.name) {
    const name = filters.name.toLowerCase();
    results = results.filter((m) => m.name.toLowerCase().includes(name));
  }

  return results;
}

export function searchSpells(
  spells: SpellDetail[],
  filters: { name?: string; level?: string; school?: string },
): SpellDetail[] {
  let results = spells;

  if (filters.name) {
    const name = filters.name.toLowerCase();
    results = results.filter((s) => s.name.toLowerCase().includes(name));
  }
  if (filters.level) {
    results = results.filter((s) => s.level === filters.level);
  }
  if (filters.school) {
    const school = filters.school.toLowerCase();
    results = results.filter((s) => s.school.toLowerCase() === school);
  }

  return results;
}

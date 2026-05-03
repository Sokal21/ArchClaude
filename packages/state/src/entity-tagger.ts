/**
 * Entity tagger — extracts entity references from text for memory chunk tagging.
 *
 * Phase 5 enhancement to the indexer. When indexing markdown, we now extract
 * named entity references (NPCs, locations, factions) and store them as tags
 * on memory chunks. This enables `recall_memory(query, tags=[...])` for
 * precision filtering.
 *
 * Approach: Simple keyword matching against known entities from the DB.
 * No NER model needed — the campaign's entity list is small enough that
 * exact/fuzzy string matching covers it.
 */

import type { Database } from "better-sqlite3";

interface EntityMatch {
  type: "npc" | "location" | "faction";
  name: string;
  tag: string;
}

/**
 * Load all known entity names from the database and build a matcher.
 * Returns a function that extracts entity tags from arbitrary text.
 */
export function buildEntityTagger(db: Database): (text: string) => string[] {
  // Load all known entities
  const npcs = (db.prepare("SELECT name FROM npcs").all() as { name: string }[])
    .map((r) => ({
      type: "npc" as const,
      name: r.name,
      tag: `npc:${r.name.toLowerCase().replace(/\s+/g, "_")}`,
    }));

  const locations = (db.prepare("SELECT name FROM locations").all() as { name: string }[])
    .map((r) => ({
      type: "location" as const,
      name: r.name,
      tag: `loc:${r.name.toLowerCase().replace(/\s+/g, "_")}`,
    }));

  const factions = (db.prepare("SELECT name FROM factions").all() as { name: string }[])
    .map((r) => ({
      type: "faction" as const,
      name: r.name,
      tag: `faction:${r.name.toLowerCase().replace(/\s+/g, "_")}`,
    }));

  const allEntities: EntityMatch[] = [...npcs, ...locations, ...factions];

  return function extractTags(text: string): string[] {
    const lower = text.toLowerCase();
    const tags: string[] = [];

    for (const entity of allEntities) {
      if (lower.includes(entity.name.toLowerCase())) {
        tags.push(entity.tag);
      }
    }

    return [...new Set(tags)]; // deduplicate
  };
}

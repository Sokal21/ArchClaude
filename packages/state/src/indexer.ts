/**
 * Markdown indexer — syncs campaign markdown files into the database.
 *
 * Architecture: Campaign content lives in two places:
 * 1. Markdown files (human-owned, DM edits between sessions)
 * 2. SQLite (queryable, used by MCP tools and agents)
 *
 * The indexer bridges these two worlds:
 * - Reads YAML frontmatter → upserts into the appropriate DB table
 * - Reads prose body → splits into memory_chunks for FTS recall
 *
 * The indexer never writes back to markdown files. It's a one-way sync
 * from files → DB. The DM owns the files; the system owns the DB cache.
 *
 * Re-indexing a file deletes its old memory_chunks first (idempotent).
 */

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, relative, basename } from "node:path";
import matter from "gray-matter";
import type { CampaignDB } from "./db.js";
import { NPCDAL } from "./dal/npcs.js";
import { LocationDAL } from "./dal/locations.js";
import { SessionDAL } from "./dal/sessions.js";
import { MemoryDAL } from "./dal/memory.js";
import type { MemoryKind, NPCStatus, LocationType, LocationStatus } from "@archclaude/shared";

interface IndexResult {
  files_processed: number;
  chunks_created: number;
  errors: string[];
}

/**
 * Splits markdown body into chunks of roughly paragraph size.
 * Each heading starts a new chunk. This keeps chunks semantically coherent
 * for FTS recall — searching "shadow wolves" finds the paragraph about them,
 * not an entire 2000-word session summary.
 */
function splitIntoChunks(body: string): string[] {
  const chunks: string[] = [];
  let current = "";

  for (const line of body.split("\n")) {
    // New heading starts a new chunk
    if (line.startsWith("# ") || line.startsWith("## ") || line.startsWith("### ")) {
      if (current.trim()) {
        chunks.push(current.trim());
      }
      current = line + "\n";
    } else {
      current += line + "\n";
    }
  }

  if (current.trim()) {
    chunks.push(current.trim());
  }

  return chunks.filter((c) => c.length > 10); // skip trivially short chunks
}

/** Extract entity tags from frontmatter for memory chunk tagging. */
function extractTags(frontmatter: Record<string, unknown>, dir: string): string[] {
  const tags: string[] = [];
  const name = frontmatter.name as string | undefined;

  if (dir === "npcs" && name) tags.push(`npc:${name.toLowerCase().replace(/\s+/g, "_")}`);
  if (dir === "locations" && name) tags.push(`loc:${name.toLowerCase().replace(/\s+/g, "_")}`);
  if (dir === "lore") tags.push("lore");

  if (frontmatter.faction) tags.push(`faction:${(frontmatter.faction as string).toLowerCase().replace(/\s+/g, "_")}`);
  if (frontmatter.current_location) tags.push(`loc:${(frontmatter.current_location as string).toLowerCase().replace(/\s+/g, "_")}`);

  // Session-specific tags
  if (frontmatter.npcs_introduced) {
    for (const npc of frontmatter.npcs_introduced as string[]) {
      tags.push(`npc:${npc}`);
    }
  }
  if (frontmatter.locations_visited) {
    for (const loc of frontmatter.locations_visited as string[]) {
      tags.push(`loc:${loc}`);
    }
  }

  return tags;
}

function memoryKindForDir(dir: string): MemoryKind {
  switch (dir) {
    case "sessions":
      return "session_summary";
    case "npcs":
      return "npc_note";
    case "characters":
      return "npc_note"; // PCs use same memory kind
    case "locations":
      return "lore";
    case "lore":
      return "lore";
    default:
      return "lore";
  }
}

/**
 * Index all markdown files in the campaign's content directories.
 * Call this after init, after DM edits files, or at session start.
 */
export function indexCampaign(campaignDb: CampaignDB): IndexResult {
  const result: IndexResult = { files_processed: 0, chunks_created: 0, errors: [] };
  const dir = campaignDb.campaignDir;

  const npcDal = new NPCDAL(campaignDb.db);
  const locationDal = new LocationDAL(campaignDb.db);
  const sessionDal = new SessionDAL(campaignDb.db);
  const memoryDal = new MemoryDAL(campaignDb.db);

  const contentDirs = ["npcs", "locations", "lore", "sessions", "characters"];

  for (const contentDir of contentDirs) {
    const fullDir = join(dir, contentDir);
    if (!existsSync(fullDir)) continue;

    let files: string[];
    try {
      files = readdirSync(fullDir).filter((f) => f.endsWith(".md"));
    } catch {
      continue;
    }

    for (const file of files) {
      const filePath = join(fullDir, file);
      const relPath = relative(dir, filePath);

      try {
        const raw = readFileSync(filePath, "utf-8");
        const { data: frontmatter, content: body } = matter(raw);

        // Sync frontmatter to appropriate table
        if (contentDir === "npcs" && frontmatter.name) {
          const existing = npcDal.getByName(frontmatter.name as string);
          if (existing) {
            npcDal.update(existing.id, {
              role: frontmatter.role as string | undefined,
              status: (frontmatter.status as NPCStatus) ?? "alive",
              current_location: frontmatter.current_location as string | undefined,
              faction: frontmatter.faction as string | undefined,
              voice_profile: frontmatter.voice_profile as string | undefined,
              dossier_file: relPath,
              introduced_session: frontmatter.introduced_session as number | undefined,
            });
          } else {
            npcDal.create({
              name: frontmatter.name as string,
              role: frontmatter.role as string | undefined,
              status: (frontmatter.status as NPCStatus) ?? "alive",
              current_location: frontmatter.current_location as string | undefined,
              faction: frontmatter.faction as string | undefined,
              voice_profile: frontmatter.voice_profile as string | undefined,
              dossier_file: relPath,
              introduced_session: frontmatter.introduced_session as number | undefined,
            });
          }
        }

        if (contentDir === "locations" && frontmatter.name) {
          const existing = locationDal.getByName(frontmatter.name as string);
          if (existing) {
            locationDal.update(existing.id, {
              type: frontmatter.type as LocationType | undefined,
              status: (frontmatter.status as LocationStatus) ?? "unknown",
              dossier_file: relPath,
              introduced_session: frontmatter.introduced_session as number | undefined,
            });
          } else {
            locationDal.create({
              name: frontmatter.name as string,
              type: frontmatter.type as LocationType | undefined,
              status: (frontmatter.status as LocationStatus) ?? "unknown",
              dossier_file: relPath,
              introduced_session: frontmatter.introduced_session as number | undefined,
            });
          }
        }

        if (contentDir === "sessions" && frontmatter.session) {
          const sessionNum = frontmatter.session as number;
          const existing = sessionDal.getByNumber(sessionNum);
          if (existing) {
            sessionDal.update(existing.id, {
              played_at: frontmatter.played_at as string | undefined,
              summary_file: relPath,
              key_events_json: frontmatter.key_events as string[] | undefined,
            });
          } else {
            const session = sessionDal.create({
              number: sessionNum,
              played_at: frontmatter.played_at as string | undefined,
            });
            sessionDal.update(session.id, {
              summary_file: relPath,
              key_events_json: frontmatter.key_events as string[] | undefined,
            });
          }
        }

        // Index body into memory chunks
        memoryDal.deleteBySource(relPath); // clear old chunks first

        const chunks = splitIntoChunks(body);
        const tags = extractTags(frontmatter, contentDir);
        const sessionNum = frontmatter.session as number | undefined;

        for (const chunkText of chunks) {
          memoryDal.create({
            kind: memoryKindForDir(contentDir),
            text: chunkText,
            source_file: relPath,
            source_session: sessionNum,
            tags_json: tags.length > 0 ? tags : undefined,
          });
          result.chunks_created++;
        }

        result.files_processed++;
      } catch (err) {
        result.errors.push(
          `${relPath}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  }

  return result;
}

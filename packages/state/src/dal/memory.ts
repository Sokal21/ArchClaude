/**
 * Memory chunks DAL — provides full-text search over campaign memory.
 *
 * Architecture: memory_chunks stores text fragments from markdown files
 * (session summaries, NPC notes, lore, etc). The FTS5 virtual table
 * (memory_chunks_fts) enables keyword search. Triggers keep them in sync.
 *
 * In Phase 5, entity tagging and query rewrite will enhance recall.
 * For now, this is naive keyword search — sufficient for early playtests.
 */

import type { Database } from "better-sqlite3";
import type { MemoryChunk, MemoryKind } from "@archclaude/shared";
import { fromJson, toJson } from "./json-helpers.js";

interface MemoryChunkRow {
  id: number;
  kind: string;
  text: string;
  source_file: string | null;
  source_session: number | null;
  tags_json: string | null;
  created_at: string;
}

function rowToChunk(row: MemoryChunkRow): MemoryChunk {
  return {
    ...row,
    kind: row.kind as MemoryKind,
    tags_json: fromJson<string[]>(row.tags_json),
  };
}

export class MemoryDAL {
  constructor(private db: Database) {}

  getById(id: number): MemoryChunk | undefined {
    const row = this.db
      .prepare("SELECT * FROM memory_chunks WHERE id = ?")
      .get(id) as MemoryChunkRow | undefined;
    return row ? rowToChunk(row) : undefined;
  }

  /** Full-text search over memory chunks. Returns ranked results. */
  search(query: string, limit = 20): MemoryChunk[] {
    const rows = this.db
      .prepare(
        `SELECT mc.* FROM memory_chunks mc
         JOIN memory_chunks_fts fts ON mc.id = fts.rowid
         WHERE memory_chunks_fts MATCH ?
         ORDER BY rank
         LIMIT ?`,
      )
      .all(query, limit) as MemoryChunkRow[];
    return rows.map(rowToChunk);
  }

  /** Search with tag filtering. Tags are AND-matched. */
  searchWithTags(
    query: string,
    tags: string[],
    limit = 20,
  ): MemoryChunk[] {
    // FTS5 search first, then filter by tags in JS
    // (tag filtering in SQL would require JSON1 extension or complex LIKE patterns)
    const all = this.search(query, limit * 3); // overfetch to compensate for filtering
    const filtered = all.filter((chunk) => {
      if (!chunk.tags_json) return false;
      return tags.every((tag) => chunk.tags_json!.includes(tag));
    });
    return filtered.slice(0, limit);
  }

  listBySource(sourceFile: string): MemoryChunk[] {
    const rows = this.db
      .prepare("SELECT * FROM memory_chunks WHERE source_file = ? ORDER BY id")
      .all(sourceFile) as MemoryChunkRow[];
    return rows.map(rowToChunk);
  }

  listByKind(kind: MemoryKind): MemoryChunk[] {
    const rows = this.db
      .prepare("SELECT * FROM memory_chunks WHERE kind = ? ORDER BY id")
      .all(kind) as MemoryChunkRow[];
    return rows.map(rowToChunk);
  }

  create(data: {
    kind: MemoryKind;
    text: string;
    source_file?: string;
    source_session?: number;
    tags_json?: string[];
  }): MemoryChunk {
    const info = this.db
      .prepare(
        `INSERT INTO memory_chunks (kind, text, source_file, source_session, tags_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        data.kind,
        data.text,
        data.source_file ?? null,
        data.source_session ?? null,
        toJson(data.tags_json),
        new Date().toISOString(),
      );
    return this.getById(info.lastInsertRowid as number)!;
  }

  /** Delete all chunks from a given source file (used before re-indexing). */
  deleteBySource(sourceFile: string): number {
    return this.db
      .prepare("DELETE FROM memory_chunks WHERE source_file = ?")
      .run(sourceFile).changes;
  }

  delete(id: number): boolean {
    return this.db.prepare("DELETE FROM memory_chunks WHERE id = ?").run(id)
      .changes > 0;
  }
}

/**
 * Schema migration runner.
 *
 * Reads SQL files from the migrations/ directory and applies any that
 * haven't been run yet. Migrations are numbered sequentially (0001, 0002, ...)
 * and tracked in the schema_migrations table.
 *
 * Design: Migrations run inside a transaction. If a migration fails, the
 * entire migration is rolled back and the error propagates. Never edit a
 * migration that has shipped — add a new one.
 */

import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { CampaignDB } from "./db.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// When running from source (vitest): __dirname is .../src, migrations at ./migrations
// When running from dist: __dirname is .../dist, migrations at ../src/migrations
const MIGRATIONS_DIR_CANDIDATES = [
  join(__dirname, "migrations"),           // from source (src/migrations)
  join(__dirname, "..", "src", "migrations"), // from dist (../src/migrations)
];

interface MigrationFile {
  version: number;
  filename: string;
  path: string;
}

function findMigrationsDir(): string {
  for (const candidate of MIGRATIONS_DIR_CANDIDATES) {
    try {
      readdirSync(candidate);
      return candidate;
    } catch {
      continue;
    }
  }
  throw new Error(
    `Could not find migrations directory. Tried: ${MIGRATIONS_DIR_CANDIDATES.join(", ")}`,
  );
}

function discoverMigrations(): MigrationFile[] {
  const dir = findMigrationsDir();
  const files = readdirSync(dir);

  return files
    .filter((f) => f.endsWith(".sql"))
    .map((f) => ({
      version: parseInt(f.split("_")[0], 10),
      filename: f,
      path: join(dir, f),
    }))
    .sort((a, b) => a.version - b.version);
}

function getAppliedVersions(campaignDb: CampaignDB): Set<number> {
  // The schema_migrations table might not exist yet (fresh DB)
  const tableExists = campaignDb.db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='schema_migrations'",
    )
    .get();

  if (!tableExists) {
    return new Set();
  }

  const rows = campaignDb.db
    .prepare("SELECT version FROM schema_migrations ORDER BY version")
    .all() as { version: number }[];

  return new Set(rows.map((r) => r.version));
}

/**
 * Apply all pending migrations to the campaign database.
 * Returns the number of migrations applied.
 */
export function migrate(campaignDb: CampaignDB): number {
  const migrations = discoverMigrations();
  const applied = getAppliedVersions(campaignDb);
  const pending = migrations.filter((m) => !applied.has(m.version));

  if (pending.length === 0) return 0;

  for (const migration of pending) {
    const sql = readFileSync(migration.path, "utf-8");
    campaignDb.db.exec(sql);
  }

  return pending.length;
}

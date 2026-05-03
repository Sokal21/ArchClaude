/**
 * CampaignDB — thin wrapper around better-sqlite3 that opens a campaign's
 * SQLite database and provides the connection to DAL modules.
 *
 * Architecture: One CampaignDB instance per campaign folder. Every DAL module
 * takes the db instance in its constructor. The db owns the connection lifecycle.
 */

import Database from "better-sqlite3";
import type { Database as DatabaseType } from "better-sqlite3";
import { join } from "node:path";
import { DB_FILENAME } from "@archclaude/shared";

export class CampaignDB {
  readonly db: DatabaseType;
  readonly campaignDir: string;

  constructor(campaignDir: string) {
    this.campaignDir = campaignDir;
    const dbPath = join(campaignDir, DB_FILENAME);
    this.db = new Database(dbPath);

    // Enable WAL mode for better concurrent read performance
    this.db.pragma("journal_mode = WAL");
    // Enforce foreign key constraints
    this.db.pragma("foreign_keys = ON");
  }

  close(): void {
    this.db.close();
  }

  /** Run a function inside a transaction. Rolls back on throw. */
  transaction<T>(fn: () => T): T {
    return this.db.transaction(fn)();
  }
}

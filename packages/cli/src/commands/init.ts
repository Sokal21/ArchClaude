/**
 * `archclaude init <folder>` — bootstraps a campaign folder.
 *
 * Creates the canonical folder layout from campaign-state-schema.md,
 * initializes campaign.json, seeds.json, secrets.md stubs,
 * creates the SQLite DB, and runs migrations.
 *
 * Safe to run on an existing folder — skips files/dirs that already exist.
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, basename, resolve } from "node:path";
import { CAMPAIGN_DIRS, CAMPAIGN_INIT_FILES } from "@archclaude/shared";
import { CampaignDB, migrate, CampaignDAL, ClockDAL } from "@archclaude/state";

export function initCommand(folder: string | undefined): void {
  if (!folder) {
    console.error("Usage: archclaude init <folder>");
    process.exit(1);
  }

  const campaignDir = resolve(folder);
  const campaignName = basename(campaignDir);

  console.log(`Initializing campaign: ${campaignName}`);
  console.log(`Location: ${campaignDir}`);

  // Create root directory
  if (!existsSync(campaignDir)) {
    mkdirSync(campaignDir, { recursive: true });
    console.log(`  Created ${campaignDir}`);
  }

  // Create subdirectories
  for (const dir of CAMPAIGN_DIRS) {
    const fullPath = join(campaignDir, dir);
    if (!existsSync(fullPath)) {
      mkdirSync(fullPath, { recursive: true });
      console.log(`  Created ${dir}/`);
    }
  }

  // Create init files (skip if they already exist)
  for (const [relPath, contentFn] of Object.entries(CAMPAIGN_INIT_FILES)) {
    const fullPath = join(campaignDir, relPath);
    if (!existsSync(fullPath)) {
      writeFileSync(fullPath, contentFn(campaignName));
      console.log(`  Created ${relPath}`);
    } else {
      console.log(`  Skipped ${relPath} (already exists)`);
    }
  }

  // Initialize SQLite database
  const db = new CampaignDB(campaignDir);
  try {
    const migrationsApplied = migrate(db);
    console.log(`  Database: ${migrationsApplied} migration(s) applied`);

    // Create campaign row and clock
    const campaignDal = new CampaignDAL(db.db);
    if (!campaignDal.get()) {
      campaignDal.create(campaignName);
      console.log(`  Campaign record created`);
    }

    const clockDal = new ClockDAL(db.db);
    if (!clockDal.get()) {
      clockDal.init();
      console.log(`  Clock initialized`);
    }
  } finally {
    db.close();
  }

  console.log(`\nCampaign "${campaignName}" is ready.`);
  console.log(`Next: add NPCs to ${join(folder, "npcs/")}, locations to ${join(folder, "locations/")}`);
}

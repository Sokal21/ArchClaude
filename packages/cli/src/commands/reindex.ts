/**
 * `archclaude reindex <folder>` — re-index campaign markdown into the database.
 *
 * Syncs NPC/location/PC frontmatter into their tables,
 * rebuilds memory chunks for FTS search, and loads seeds/secrets.
 */

import { resolve } from "node:path";
import { CampaignDB, migrate, indexCampaign, loadSeedsAndSecrets } from "@archclaude/state";

export function reindexCommand(folder: string | undefined): void {
  if (!folder) {
    console.error("Usage: archclaude reindex <folder>");
    process.exit(1);
  }

  const campaignDir = resolve(folder);
  console.log(`Re-indexing campaign: ${campaignDir}`);

  const db = new CampaignDB(campaignDir);
  try {
    migrate(db);

    const indexResult = indexCampaign(db);
    console.log(`  Files: ${indexResult.files_processed} processed`);
    console.log(`  Memory chunks: ${indexResult.chunks_created} created`);
    if (indexResult.errors.length > 0) {
      console.log(`  Errors: ${indexResult.errors.join("\n    ")}`);
    }

    const seedSecretResult = loadSeedsAndSecrets(db, campaignDir);
    console.log(`  Seeds: ${seedSecretResult.seeds} loaded`);
    console.log(`  Secrets: ${seedSecretResult.secrets} loaded`);
  } finally {
    db.close();
  }

  console.log("Done.");
}

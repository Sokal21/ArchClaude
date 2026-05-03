/**
 * Defines the canonical campaign folder structure.
 *
 * Used by `archclaude init` to create folders and by `archclaude doctor`
 * to validate them. The structure matches campaign-state-schema.md section 2.
 *
 * A campaign IS a folder. Point the app at a folder, that's the campaign.
 * There is no cross-campaign state.
 */

/** Directories that must exist inside a campaign folder. */
export const CAMPAIGN_DIRS = [
  "sessions",
  "characters",
  "npcs",
  "locations",
  "lore",
  "homebrew",
  "assets",
  "assets/npc_portraits",
  "assets/scene_images",
] as const;

/** Files created by `archclaude init`. */
export const CAMPAIGN_INIT_FILES = {
  "campaign.json": (name: string) =>
    JSON.stringify(
      {
        name,
        system: "5e-2024",
        schema_version: 1,
        created_at: new Date().toISOString(),
      },
      null,
      2,
    ),
  "seeds.json": () => JSON.stringify([], null, 2),
  "secrets.md": () => "# DM Secrets\n\n<!-- DM-only notes. Hidden from narration output. -->\n",
  "homebrew/monsters.json": () => JSON.stringify([], null, 2),
  "homebrew/items.json": () => JSON.stringify([], null, 2),
} as const;

export const CURRENT_SCHEMA_VERSION = 1;

export const DB_FILENAME = "campaign.db";

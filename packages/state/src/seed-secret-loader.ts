/**
 * Seed and secret loader — imports seeds.json and secrets.md into the database.
 *
 * The main indexer only processes markdown files in content directories.
 * Seeds and secrets live in separate files at the campaign root and need
 * their own import logic.
 */

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { CampaignDB } from "./db.js";
import { SeedDAL } from "./dal/seeds.js";
import { SecretDAL } from "./dal/secrets.js";

interface SeedEntry {
  id?: number;
  text: string;
  trigger?: string;
  trigger_condition?: string;
  visibility?: "public" | "secret";
  status?: string;
}

/**
 * Load seeds from seeds.json into the database.
 * Skips seeds that already exist (matched by text).
 */
function loadSeeds(campaignDb: CampaignDB, campaignDir: string): number {
  const seedsPath = join(campaignDir, "seeds.json");
  if (!existsSync(seedsPath)) return 0;

  const raw = readFileSync(seedsPath, "utf-8");
  const entries = JSON.parse(raw) as SeedEntry[];
  const dal = new SeedDAL(campaignDb.db);
  const existing = dal.list();
  const existingTexts = new Set(existing.map((s) => s.text));

  let created = 0;
  for (const entry of entries) {
    if (existingTexts.has(entry.text)) continue;
    dal.create({
      text: entry.text,
      trigger_condition: entry.trigger_condition ?? entry.trigger,
      visibility: entry.visibility ?? "public",
    });
    created++;
  }
  return created;
}

/**
 * Parse secrets.md and load secrets into the database.
 * Expects markdown with ## headings as secret topics and content as the secret text.
 * Skips secrets that already exist (matched by topic).
 */
function loadSecrets(campaignDb: CampaignDB, campaignDir: string): number {
  const secretsPath = join(campaignDir, "secrets.md");
  if (!existsSync(secretsPath)) return 0;

  const raw = readFileSync(secretsPath, "utf-8");
  const dal = new SecretDAL(campaignDb.db);
  const existing = dal.list();
  const existingTopics = new Set(existing.map((s) => s.topic));

  let created = 0;
  let currentTopic: string | null = null;
  let currentText = "";

  for (const line of raw.split("\n")) {
    // Skip top-level heading and HTML comments
    if (line.startsWith("# ") || line.startsWith("<!--") || line.startsWith("-->")) continue;

    if (line.startsWith("## ")) {
      // Save previous secret
      if (currentTopic && currentText.trim()) {
        const topicSlug = currentTopic.toLowerCase().replace(/\s+/g, "_");
        if (!existingTopics.has(topicSlug)) {
          dal.create({ topic: topicSlug, text: currentText.trim() });
          created++;
        }
      }
      currentTopic = line.replace(/^## /, "").trim();
      currentText = "";
    } else {
      currentText += line + "\n";
    }
  }

  // Save last secret
  if (currentTopic && currentText.trim()) {
    const topicSlug = currentTopic.toLowerCase().replace(/\s+/g, "_");
    if (!existingTopics.has(topicSlug)) {
      dal.create({ topic: topicSlug, text: currentText.trim() });
      created++;
    }
  }

  return created;
}

/**
 * Load both seeds and secrets into the campaign database.
 */
export function loadSeedsAndSecrets(
  campaignDb: CampaignDB,
  campaignDir: string,
): { seeds: number; secrets: number } {
  return {
    seeds: loadSeeds(campaignDb, campaignDir),
    secrets: loadSecrets(campaignDb, campaignDir),
  };
}

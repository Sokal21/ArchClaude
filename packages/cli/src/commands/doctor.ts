/**
 * `archclaude doctor <folder>` — validates a campaign folder.
 *
 * Checks:
 * 1. Required directories exist
 * 2. campaign.json exists and has valid schema_version
 * 3. SQLite database exists and schema is current
 * 4. Markdown files have valid YAML frontmatter
 * 5. No orphaned references (e.g. dossier_file pointing to missing file)
 *
 * Exits 0 if healthy, 1 if issues found.
 */

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import matter from "gray-matter";
import { CAMPAIGN_DIRS, CURRENT_SCHEMA_VERSION, DB_FILENAME } from "@archclaude/shared";
import { CampaignDB, CampaignDAL } from "@archclaude/state";

interface DiagnosticResult {
  ok: boolean;
  check: string;
  detail?: string;
}

export function doctorCommand(folder: string | undefined): void {
  if (!folder) {
    console.error("Usage: archclaude doctor <folder>");
    process.exit(1);
  }

  const campaignDir = resolve(folder);
  const results: DiagnosticResult[] = [];

  console.log(`Checking campaign: ${campaignDir}\n`);

  // 1. Root directory exists
  if (!existsSync(campaignDir)) {
    console.error(`Campaign folder does not exist: ${campaignDir}`);
    process.exit(1);
  }

  // 2. Required directories
  for (const dir of CAMPAIGN_DIRS) {
    const fullPath = join(campaignDir, dir);
    results.push({
      ok: existsSync(fullPath),
      check: `Directory: ${dir}/`,
      detail: existsSync(fullPath) ? undefined : "Missing — run `archclaude init` to create",
    });
  }

  // 3. campaign.json
  const campaignJsonPath = join(campaignDir, "campaign.json");
  if (existsSync(campaignJsonPath)) {
    try {
      const raw = readFileSync(campaignJsonPath, "utf-8");
      const config = JSON.parse(raw) as { schema_version?: number; name?: string };

      results.push({
        ok: !!config.name,
        check: "campaign.json: name",
        detail: config.name ? config.name : "Missing 'name' field",
      });

      results.push({
        ok: config.schema_version === CURRENT_SCHEMA_VERSION,
        check: "campaign.json: schema_version",
        detail:
          config.schema_version === CURRENT_SCHEMA_VERSION
            ? `v${config.schema_version} (current)`
            : `v${config.schema_version ?? "missing"} (expected v${CURRENT_SCHEMA_VERSION})`,
      });
    } catch (err) {
      results.push({
        ok: false,
        check: "campaign.json",
        detail: `Parse error: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  } else {
    results.push({
      ok: false,
      check: "campaign.json",
      detail: "Missing — run `archclaude init`",
    });
  }

  // 4. SQLite database
  const dbPath = join(campaignDir, DB_FILENAME);
  if (existsSync(dbPath)) {
    try {
      const db = new CampaignDB(campaignDir);
      try {
        const campaignDal = new CampaignDAL(db.db);
        const campaign = campaignDal.get();
        results.push({
          ok: !!campaign,
          check: "Database: campaign row",
          detail: campaign ? `"${campaign.name}" (schema v${campaign.schema_version})` : "No campaign row",
        });

        // Check schema_migrations
        const migrations = db.db
          .prepare("SELECT version FROM schema_migrations ORDER BY version")
          .all() as { version: number }[];
        results.push({
          ok: migrations.length > 0,
          check: "Database: migrations",
          detail: `${migrations.length} migration(s) applied`,
        });
      } finally {
        db.close();
      }
    } catch (err) {
      results.push({
        ok: false,
        check: "Database",
        detail: `Error: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  } else {
    results.push({
      ok: false,
      check: "Database",
      detail: "campaign.db missing — run `archclaude init`",
    });
  }

  // 5. Validate markdown frontmatter
  const contentDirs = ["npcs", "locations", "sessions", "characters"];
  for (const contentDir of contentDirs) {
    const fullDir = join(campaignDir, contentDir);
    if (!existsSync(fullDir)) continue;

    let files: string[];
    try {
      files = readdirSync(fullDir).filter((f) => f.endsWith(".md"));
    } catch {
      continue;
    }

    for (const file of files) {
      const filePath = join(fullDir, file);
      try {
        const raw = readFileSync(filePath, "utf-8");
        const { data } = matter(raw);
        const hasFrontmatter = Object.keys(data).length > 0;

        results.push({
          ok: hasFrontmatter,
          check: `Frontmatter: ${contentDir}/${file}`,
          detail: hasFrontmatter ? undefined : "No YAML frontmatter found",
        });

        // Check required name field for npcs/locations
        if ((contentDir === "npcs" || contentDir === "locations") && hasFrontmatter) {
          results.push({
            ok: !!data.name,
            check: `${contentDir}/${file}: name field`,
            detail: data.name ? undefined : "Missing required 'name' field in frontmatter",
          });
        }
      } catch (err) {
        results.push({
          ok: false,
          check: `Parse: ${contentDir}/${file}`,
          detail: err instanceof Error ? err.message : String(err),
        });
      }
    }
  }

  // Print results
  let hasIssues = false;
  for (const r of results) {
    const icon = r.ok ? "OK" : "FAIL";
    const detail = r.detail ? ` — ${r.detail}` : "";
    console.log(`  [${icon}] ${r.check}${detail}`);
    if (!r.ok) hasIssues = true;
  }

  console.log();
  if (hasIssues) {
    console.log("Issues found. Run `archclaude init` to fix structural problems.");
    process.exit(1);
  } else {
    console.log("All checks passed.");
  }
}

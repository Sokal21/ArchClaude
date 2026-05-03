/**
 * `archclaude check <folder>` — validates everything needed for a session.
 *
 * Checks: DB exists + has content, bestiary cache populated,
 * .mcp.json exists, all packages built.
 */

import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { DB_FILENAME } from "@archclaude/shared";
import { CampaignDB } from "@archclaude/state";
import { homedir } from "node:os";

interface Check {
  name: string;
  ok: boolean;
  detail: string;
}

export function checkCommand(folder: string | undefined): void {
  if (!folder) {
    console.error("Usage: archclaude check <folder>");
    process.exit(1);
  }

  const campaignDir = resolve(folder);
  const projectRoot = resolve(".");
  const checks: Check[] = [];

  console.log(`Session readiness check: ${campaignDir}\n`);

  // 1. Campaign DB exists
  const dbPath = join(campaignDir, DB_FILENAME);
  checks.push({
    name: "Campaign database",
    ok: existsSync(dbPath),
    detail: existsSync(dbPath) ? dbPath : "Missing — run `archclaude init`",
  });

  // 2. DB has content
  if (existsSync(dbPath)) {
    try {
      const db = new CampaignDB(campaignDir);
      const pcCount = (db.db.prepare("SELECT COUNT(*) as c FROM pcs").get() as { c: number }).c;
      const npcCount = (db.db.prepare("SELECT COUNT(*) as c FROM npcs").get() as { c: number }).c;
      const chunkCount = (db.db.prepare("SELECT COUNT(*) as c FROM memory_chunks").get() as { c: number }).c;
      const seedCount = (db.db.prepare("SELECT COUNT(*) as c FROM seeds").get() as { c: number }).c;
      db.close();

      checks.push({
        name: "PCs indexed",
        ok: pcCount > 0,
        detail: pcCount > 0 ? `${pcCount} PCs` : "No PCs — run `archclaude reindex`",
      });
      checks.push({
        name: "NPCs indexed",
        ok: npcCount > 0,
        detail: npcCount > 0 ? `${npcCount} NPCs` : "No NPCs — add markdown to npcs/",
      });
      checks.push({
        name: "Memory chunks",
        ok: chunkCount > 0,
        detail: `${chunkCount} chunks for FTS recall`,
      });
      checks.push({
        name: "Seeds loaded",
        ok: seedCount > 0,
        detail: seedCount > 0 ? `${seedCount} seeds` : "No seeds — check seeds.json",
      });
    } catch (err) {
      checks.push({
        name: "Database readable",
        ok: false,
        detail: `Error: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  // 3. Bestiary SRD cache
  const cacheDir = join(homedir(), ".archclaude", "srd-cache");
  const monstersCache = join(cacheDir, "monsters.json");
  const spellsCache = join(cacheDir, "spells.json");
  const hasBestiary = existsSync(monstersCache) && existsSync(spellsCache);
  checks.push({
    name: "Bestiary SRD cache",
    ok: hasBestiary,
    detail: hasBestiary
      ? `${cacheDir}`
      : "Missing — will auto-pull on first MCP start, or run `cache:pull`",
  });

  // 4. .mcp.json exists
  const mcpJsonPath = join(projectRoot, ".mcp.json");
  const hasMcpJson = existsSync(mcpJsonPath);
  checks.push({
    name: "MCP config (.mcp.json)",
    ok: hasMcpJson,
    detail: hasMcpJson ? mcpJsonPath : "Missing — MCP servers won't auto-start in Claude Code",
  });

  // 5. Packages built
  const requiredDists = [
    "packages/state-mcp/dist/index.js",
    "packages/bestiary/dist/index.js",
    "packages/map/dist/index.js",
  ];
  const allBuilt = requiredDists.every((p) => existsSync(join(projectRoot, p)));
  checks.push({
    name: "MCP servers built",
    ok: allBuilt,
    detail: allBuilt ? "All dist/ present" : "Run `pnpm build` first",
  });

  // 6. Character files have stats
  if (existsSync(dbPath)) {
    try {
      const db = new CampaignDB(campaignDir);
      const pcsWithLowHp = db.db
        .prepare("SELECT name, max_hp FROM pcs WHERE max_hp <= 10")
        .all() as { name: string; max_hp: number }[];
      db.close();

      if (pcsWithLowHp.length > 0) {
        checks.push({
          name: "PC stats populated",
          ok: false,
          detail: `PCs with default HP (need real stats): ${pcsWithLowHp.map((p) => p.name).join(", ")}`,
        });
      } else {
        checks.push({
          name: "PC stats populated",
          ok: true,
          detail: "All PCs have proper HP values",
        });
      }
    } catch { /* skip */ }
  }

  // Print results
  let failures = 0;
  for (const check of checks) {
    const icon = check.ok ? "OK" : "!!";
    console.log(`  [${icon}] ${check.name} — ${check.detail}`);
    if (!check.ok) failures++;
  }

  console.log();
  if (failures === 0) {
    console.log("Ready to play! Open Claude Code and start a session.");
  } else {
    console.log(`${failures} issue(s) found. Fix them before starting a session.`);
    process.exit(1);
  }
}

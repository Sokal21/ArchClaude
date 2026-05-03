#!/usr/bin/env node

/**
 * Bestiary MCP Server
 *
 * Provides monster, spell, and condition lookup from the SRD via Open5e.
 * Data is served from a local cache (~/.archclaude/srd-cache/).
 *
 * Tools:
 *   find_monsters   — Search by CR range, type, size, environment
 *   get_stat_block  — Full stat block for a specific monster
 *   find_spells     — Search spells by name, level, school
 *   get_spell       — Full spell description
 *   get_condition   — Condition rules text
 *   list_homebrew   — List homebrew monsters/items from campaign folder
 *
 * The Encounter Builder skill calls find_monsters to compose fights.
 * The Combat Director calls get_stat_block for monster tactics.
 *
 * Usage:
 *   archclaude-bestiary-mcp
 *   CAMPAIGN_DIR=/path/to/campaign archclaude-bestiary-mcp  (for homebrew)
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  loadMonsters,
  loadSpells,
  loadConditions,
  isCachePopulated,
} from "./cache.js";
import { searchMonsters, searchSpells } from "./search.js";
import type { MonsterStatBlock, SpellDetail, ConditionDetail } from "./types.js";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

async function main() {
  if (!isCachePopulated()) {
    console.error(
      "SRD cache not found. Run: pnpm --filter @archclaude/bestiary cache:pull",
    );
    process.exit(1);
  }

  // Load all data into memory at startup (~2MB for SRD)
  const monsters = loadMonsters();
  const spells = loadSpells();
  const conditions = loadConditions();
  const campaignDir = process.env.CAMPAIGN_DIR;

  const server = new McpServer({
    name: "archclaude-bestiary",
    version: "0.1.0",
  });

  server.tool(
    "find_monsters",
    "Search SRD monsters by CR range, creature type, size, or environment. Returns compact summaries. Use get_stat_block for full details.",
    {
      cr_min: z.number().optional().describe("Minimum challenge rating"),
      cr_max: z.number().optional().describe("Maximum challenge rating"),
      type: z.string().optional().describe("Creature type (beast, undead, fiend, dragon, etc)"),
      size: z.string().optional().describe("Size (Tiny, Small, Medium, Large, Huge, Gargantuan)"),
      environment: z.string().optional().describe("Environment (forest, underdark, arctic, etc)"),
      name: z.string().optional().describe("Name search (partial match)"),
      limit: z.number().optional().describe("Max results (default 20)"),
    },
    async (filters) => {
      const limit = filters.limit ?? 20;
      const results = searchMonsters(monsters, filters).slice(0, limit);

      if (results.length === 0) {
        return { content: [{ type: "text", text: "No monsters match those filters." }] };
      }

      const summaries = results.map((m) => ({
        slug: m.slug,
        name: m.name,
        cr: m.challenge_rating,
        type: m.type,
        size: m.size,
        hp: m.hit_points,
        ac: m.armor_class,
        environments: m.environments,
      }));

      return { content: [{ type: "text", text: JSON.stringify(summaries, null, 2) }] };
    },
  );

  server.tool(
    "get_stat_block",
    "Get the full stat block for a monster by slug (e.g. 'goblin', 'ancient-red-dragon'). Includes actions, abilities, saves.",
    {
      slug: z.string().describe("Monster slug from find_monsters results"),
    },
    async ({ slug }) => {
      const monster = monsters.find((m) => m.slug === slug);
      if (!monster) {
        return { content: [{ type: "text", text: `Monster "${slug}" not found in SRD cache.` }] };
      }
      return { content: [{ type: "text", text: JSON.stringify(monster, null, 2) }] };
    },
  );

  server.tool(
    "find_spells",
    "Search SRD spells by name, level, or school.",
    {
      name: z.string().optional().describe("Spell name (partial match)"),
      level: z.string().optional().describe("Spell level ('Cantrip', '1st-level', '2nd-level', etc)"),
      school: z.string().optional().describe("School of magic (evocation, abjuration, etc)"),
      limit: z.number().optional(),
    },
    async (filters) => {
      const limit = filters.limit ?? 20;
      const results = searchSpells(spells, filters).slice(0, limit);

      if (results.length === 0) {
        return { content: [{ type: "text", text: "No spells match those filters." }] };
      }

      const summaries = results.map((s) => ({
        slug: s.slug,
        name: s.name,
        level: s.level,
        school: s.school,
        casting_time: s.casting_time,
        range: s.range,
        concentration: s.concentration,
      }));

      return { content: [{ type: "text", text: JSON.stringify(summaries, null, 2) }] };
    },
  );

  server.tool(
    "get_spell",
    "Get the full description of a spell by slug.",
    {
      slug: z.string().describe("Spell slug from find_spells results"),
    },
    async ({ slug }) => {
      const spell = spells.find((s) => s.slug === slug);
      if (!spell) {
        return { content: [{ type: "text", text: `Spell "${slug}" not found.` }] };
      }
      return { content: [{ type: "text", text: JSON.stringify(spell, null, 2) }] };
    },
  );

  server.tool(
    "get_condition",
    "Get the rules text for a condition (e.g. 'blinded', 'stunned', 'poisoned').",
    {
      name: z.string().describe("Condition name"),
    },
    async ({ name }) => {
      const condition = conditions.find(
        (c) => c.name.toLowerCase() === name.toLowerCase(),
      );
      if (!condition) {
        return { content: [{ type: "text", text: `Condition "${name}" not found. Available: ${conditions.map((c) => c.name).join(", ")}` }] };
      }
      return { content: [{ type: "text", text: `## ${condition.name}\n\n${condition.desc}` }] };
    },
  );

  server.tool(
    "list_homebrew",
    "List homebrew monsters and items from the campaign's homebrew/ folder.",
    {},
    async () => {
      if (!campaignDir) {
        return { content: [{ type: "text", text: "No CAMPAIGN_DIR set. Homebrew lookup unavailable." }] };
      }

      const result: { monsters: unknown[]; items: unknown[] } = { monsters: [], items: [] };

      const monstersPath = join(campaignDir, "homebrew", "monsters.json");
      if (existsSync(monstersPath)) {
        result.monsters = JSON.parse(readFileSync(monstersPath, "utf-8"));
      }

      const itemsPath = join(campaignDir, "homebrew", "items.json");
      if (existsSync(itemsPath)) {
        result.items = JSON.parse(readFileSync(itemsPath, "utf-8"));
      }

      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    },
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});

/**
 * Integration tests for the Bestiary MCP server.
 *
 * Spawns the real server, connects via stdio, searches SRD data.
 * Skips if the SRD cache hasn't been populated.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const SERVER_PATH = join(import.meta.dirname, "..", "..", "dist", "index.js");
const CACHE_DIR = join(homedir(), ".archclaude", "srd-cache");
const cacheExists = existsSync(join(CACHE_DIR, "monsters.json"));

let client: Client;
let transport: StdioClientTransport;

beforeAll(async () => {
  if (!cacheExists) return;

  transport = new StdioClientTransport({
    command: "node",
    args: [SERVER_PATH],
    stderr: "pipe",
  });

  client = new Client({ name: "test-client", version: "1.0" });
  await client.connect(transport);
}, 30000);

afterAll(async () => {
  if (client) await client.close();
});

describe.skipIf(!cacheExists)("Bestiary MCP integration", () => {
  it("lists tools", async () => {
    const result = await client.listTools();
    const names = result.tools.map((t) => t.name);
    expect(names).toContain("find_monsters");
    expect(names).toContain("get_stat_block");
    expect(names).toContain("find_spells");
    expect(names).toContain("get_condition");
  });

  it("find_monsters by CR range", async () => {
    const result = await client.callTool({
      name: "find_monsters",
      arguments: { cr_min: 0, cr_max: 0.25, limit: 5 },
    });
    const text = (result.content as Array<{ type: string; text: string }>)[0].text;
    const monsters = JSON.parse(text);
    expect(monsters.length).toBeGreaterThan(0);
    expect(monsters[0]).toHaveProperty("slug");
    expect(monsters[0]).toHaveProperty("name");
  });

  it("get_stat_block returns full data", async () => {
    const result = await client.callTool({
      name: "get_stat_block",
      arguments: { slug: "goblin" },
    });
    const text = (result.content as Array<{ type: string; text: string }>)[0].text;
    const goblin = JSON.parse(text);
    expect(goblin.name).toBe("Goblin");
    expect(goblin.hit_points).toBeGreaterThan(0);
    expect(goblin.armor_class).toBeGreaterThan(0);
    expect(goblin.actions.length).toBeGreaterThan(0);
  });

  it("find_spells by name", async () => {
    const result = await client.callTool({
      name: "find_spells",
      arguments: { name: "fireball" },
    });
    const text = (result.content as Array<{ type: string; text: string }>)[0].text;
    const spells = JSON.parse(text);
    expect(spells.length).toBeGreaterThan(0);
    expect(spells[0].name.toLowerCase()).toContain("fireball");
  });

  it("get_condition returns rules text", async () => {
    const result = await client.callTool({
      name: "get_condition",
      arguments: { name: "blinded" },
    });
    const text = (result.content as Array<{ type: string; text: string }>)[0].text;
    expect(text).toContain("Blinded");
  });

  it("find_monsters by type", async () => {
    const result = await client.callTool({
      name: "find_monsters",
      arguments: { type: "dragon", limit: 5 },
    });
    const text = (result.content as Array<{ type: string; text: string }>)[0].text;
    const monsters = JSON.parse(text);
    expect(monsters.length).toBeGreaterThan(0);
  });
});

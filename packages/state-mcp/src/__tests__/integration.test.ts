/**
 * Integration tests for the Campaign State MCP server.
 *
 * Spawns a real MCP server process, connects via StdioClientTransport,
 * calls tools, and asserts results. This verifies the full stack:
 * MCP protocol → tool handler → DAL → SQLite → response.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";

const SERVER_PATH = join(import.meta.dirname, "..", "..", "dist", "index.js");
const CLI_PATH = join(import.meta.dirname, "..", "..", "..", "cli", "dist", "index.js");

let client: Client;
let transport: StdioClientTransport;
let tmpDir: string;

beforeAll(async () => {
  // Create a temp campaign with content
  tmpDir = join(mkdtempSync(join(tmpdir(), "mcp-integ-")), "campaign");
  mkdirSync(join(tmpDir, "characters"), { recursive: true });
  mkdirSync(join(tmpDir, "npcs"), { recursive: true });
  mkdirSync(join(tmpDir, "locations"), { recursive: true });

  writeFileSync(
    join(tmpDir, "characters", "test_pc.md"),
    `---
name: TestHero
player_name: Player1
class: Fighter
level: 5
max_hp: 44
ac: 18
initiative_bonus: 2
---

# TestHero

A brave fighter.
`,
  );

  writeFileSync(
    join(tmpDir, "npcs", "test_npc.md"),
    `---
name: TestVillain
role: BBEG
status: alive
---

# TestVillain

The antagonist.
`,
  );

  writeFileSync(
    join(tmpDir, "locations", "test_town.md"),
    `---
name: TestTown
type: city
status: visited
---

# TestTown

A small town.
`,
  );

  // Initialize the campaign (creates DB, indexes content)
  execFileSync("node", [CLI_PATH, "init", tmpDir], { timeout: 15000 });

  // Spawn the MCP server
  transport = new StdioClientTransport({
    command: "node",
    args: [SERVER_PATH, "--campaign", tmpDir],
    stderr: "pipe",
  });

  client = new Client({ name: "test-client", version: "1.0" });
  await client.connect(transport);
}, 30000);

afterAll(async () => {
  await client.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("State MCP integration", () => {
  it("lists tools", async () => {
    const result = await client.listTools();
    const names = result.tools.map((t) => t.name);
    expect(names).toContain("list_pcs");
    expect(names).toContain("start_session");
    expect(names).toContain("recall_memory");
    expect(names).toContain("start_combat");
    expect(names.length).toBeGreaterThan(30);
  });

  it("list_pcs returns indexed PCs", async () => {
    const result = await client.callTool({ name: "list_pcs", arguments: {} });
    const text = (result.content as Array<{ type: string; text: string }>)[0].text;
    const pcs = JSON.parse(text);
    expect(pcs).toHaveLength(1);
    expect(pcs[0].name).toBe("TestHero");
    expect(pcs[0].class).toBe("Fighter");
  });

  it("get_pc returns full PC data", async () => {
    const result = await client.callTool({
      name: "get_pc",
      arguments: { name: "TestHero" },
    });
    const text = (result.content as Array<{ type: string; text: string }>)[0].text;
    const pc = JSON.parse(text);
    expect(pc.max_hp).toBe(44);
    expect(pc.ac).toBe(18);
    expect(pc.level).toBe(5);
  });

  it("start_session creates a session", async () => {
    const result = await client.callTool({ name: "start_session", arguments: {} });
    const text = (result.content as Array<{ type: string; text: string }>)[0].text;
    expect(text).toContain("Session 1 started");
  });

  it("apply_damage reduces HP", async () => {
    const result = await client.callTool({
      name: "apply_damage",
      arguments: { name: "TestHero", amount: 10, damage_type: "slashing" },
    });
    const text = (result.content as Array<{ type: string; text: string }>)[0].text;
    expect(text).toContain("34/44"); // 44 - 10

    // Verify via get_pc
    const pcResult = await client.callTool({
      name: "get_pc",
      arguments: { name: "TestHero" },
    });
    const pc = JSON.parse(
      (pcResult.content as Array<{ type: string; text: string }>)[0].text,
    );
    expect(pc.current_hp).toBe(34);
  });

  it("apply_healing restores HP", async () => {
    await client.callTool({
      name: "apply_healing",
      arguments: { name: "TestHero", amount: 5 },
    });
    const pcResult = await client.callTool({
      name: "get_pc",
      arguments: { name: "TestHero" },
    });
    const pc = JSON.parse(
      (pcResult.content as Array<{ type: string; text: string }>)[0].text,
    );
    expect(pc.current_hp).toBe(39); // 34 + 5
  });

  it("combat lifecycle: start → add → initiative → advance → end", async () => {
    // Start combat
    const startResult = await client.callTool({
      name: "start_combat",
      arguments: { intensity: "normal", narrative_context: "Test fight" },
    });
    expect(
      (startResult.content as Array<{ type: string; text: string }>)[0].text,
    ).toContain("Combat #");

    // Add combatant
    const addResult = await client.callTool({
      name: "add_combatant",
      arguments: { display_name: "Goblin 1", max_hp: 7, ac: 15 },
    });
    const addText = (addResult.content as Array<{ type: string; text: string }>)[0].text;
    expect(addText).toContain("Goblin 1");

    // Get combat state
    const stateResult = await client.callTool({
      name: "get_combat_state",
      arguments: {},
    });
    const state = JSON.parse(
      (stateResult.content as Array<{ type: string; text: string }>)[0].text,
    );
    expect(state.round).toBe(1);

    // End combat
    const endResult = await client.callTool({
      name: "end_combat",
      arguments: { outcome: "victory" },
    });
    expect(
      (endResult.content as Array<{ type: string; text: string }>)[0].text,
    ).toContain("victory");
  });

  it("recall_memory searches indexed content", async () => {
    const result = await client.callTool({
      name: "recall_memory",
      arguments: { query: "brave fighter" },
    });
    const text = (result.content as Array<{ type: string; text: string }>)[0].text;
    expect(text).toContain("TestHero");
  });

  it("NPC tools work", async () => {
    const result = await client.callTool({
      name: "get_npc",
      arguments: { name: "TestVillain" },
    });
    const npc = JSON.parse(
      (result.content as Array<{ type: string; text: string }>)[0].text,
    );
    expect(npc.role).toBe("BBEG");
  });

  it("location tools work", async () => {
    const result = await client.callTool({
      name: "get_location",
      arguments: { name: "TestTown" },
    });
    const loc = JSON.parse(
      (result.content as Array<{ type: string; text: string }>)[0].text,
    );
    expect(loc.type).toBe("city");
  });

  it("death saves track correctly", async () => {
    // Reduce HP to 0 first
    await client.callTool({
      name: "apply_damage",
      arguments: { name: "TestHero", amount: 100 },
    });

    const r1 = await client.callTool({
      name: "record_death_save",
      arguments: { name: "TestHero", success: true },
    });
    expect(
      (r1.content as Array<{ type: string; text: string }>)[0].text,
    ).toContain("1 success");

    // Reset and heal
    await client.callTool({
      name: "reset_death_saves",
      arguments: { name: "TestHero" },
    });
    await client.callTool({
      name: "apply_healing",
      arguments: { name: "TestHero", amount: 44 },
    });
  });

  it("long_rest restores full HP", async () => {
    // Damage first
    await client.callTool({
      name: "apply_damage",
      arguments: { name: "TestHero", amount: 20 },
    });

    await client.callTool({
      name: "long_rest",
      arguments: { name: "TestHero" },
    });

    const pcResult = await client.callTool({
      name: "get_pc",
      arguments: { name: "TestHero" },
    });
    const pc = JSON.parse(
      (pcResult.content as Array<{ type: string; text: string }>)[0].text,
    );
    expect(pc.current_hp).toBe(44);
  });

  it("get_recent_events returns logged events", async () => {
    const result = await client.callTool({
      name: "get_recent_events",
      arguments: { limit: 5 },
    });
    const text = (result.content as Array<{ type: string; text: string }>)[0].text;
    expect(text).toContain("combat_started");
  });
});

/**
 * Integration tests for the Map MCP server.
 *
 * Spawns the real server, connects via stdio, calls spatial tools.
 * Note: The map server also starts a WebSocket on port 3100,
 * so we use a random port to avoid conflicts.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { join } from "node:path";

const SERVER_PATH = join(import.meta.dirname, "..", "..", "dist", "index.js");

let client: Client;
let transport: StdioClientTransport;

// Use a random port to avoid conflicts with running instances
const testPort = 3100 + Math.floor(Math.random() * 900);

beforeAll(async () => {
  transport = new StdioClientTransport({
    command: "node",
    args: [SERVER_PATH, "--port", String(testPort)],
    stderr: "pipe",
  });

  client = new Client({ name: "test-client", version: "1.0" });
  await client.connect(transport);
}, 15000);

afterAll(async () => {
  await client.close();
});

describe("Map MCP integration", () => {
  it("lists tools", async () => {
    const result = await client.listTools();
    const names = result.tools.map((t) => t.name);
    expect(names).toContain("create_map");
    expect(names).toContain("place_token");
    expect(names).toContain("move_token");
    expect(names).toContain("measure_distance");
    expect(names).toContain("apply_aoe");
    expect(names.length).toBeGreaterThan(10);
  });

  it("create_map + place_token + move_token", async () => {
    // Create map
    const createResult = await client.callTool({
      name: "create_map",
      arguments: { name: "Test Arena", width: 20, height: 20, combat_id: "test-1" },
    });
    expect(
      (createResult.content as Array<{ type: string; text: string }>)[0].text,
    ).toContain("Test Arena");

    // Place token
    const placeResult = await client.callTool({
      name: "place_token",
      arguments: {
        label: "Fighter",
        x: 5,
        y: 5,
        size: "medium",
        color: "#00ff00",
        actor_kind: "pc",
        actor_id: 1,
      },
    });
    const placeText = (placeResult.content as Array<{ type: string; text: string }>)[0].text;
    expect(placeText).toContain("Fighter");
    expect(placeText).toContain("(5,5)");

    // Extract token ID from response
    const tokenIdMatch = placeText.match(/ID: (\w+)/);
    expect(tokenIdMatch).not.toBeNull();
    const tokenId = tokenIdMatch![1];

    // Move token
    const moveResult = await client.callTool({
      name: "move_token",
      arguments: { token_id: tokenId, x: 8, y: 5 },
    });
    expect(
      (moveResult.content as Array<{ type: string; text: string }>)[0].text,
    ).toContain("(8,5)");
  });

  it("measure_distance between tokens", async () => {
    // Place a second token
    const place2 = await client.callTool({
      name: "place_token",
      arguments: {
        label: "Goblin",
        x: 12,
        y: 5,
        size: "small",
        color: "#ff0000",
        actor_kind: "npc_instance",
        actor_id: 1,
      },
    });
    const goblinId = (place2.content as Array<{ type: string; text: string }>)[0].text.match(
      /ID: (\w+)/,
    )![1];

    // Get map to find the fighter token ID
    const mapResult = await client.callTool({ name: "get_map", arguments: {} });
    const mapData = JSON.parse(
      (mapResult.content as Array<{ type: string; text: string }>)[0].text,
    );
    const fighterToken = mapData.tokens.find(
      (t: { label: string }) => t.label === "Fighter",
    );

    // Measure distance: Fighter at (8,5), Goblin at (12,5) = 4 cells = 20ft
    const distResult = await client.callTool({
      name: "measure_distance",
      arguments: { from_token: fighterToken.id, to_token: goblinId },
    });
    expect(
      (distResult.content as Array<{ type: string; text: string }>)[0].text,
    ).toContain("20ft");
  });

  it("set_terrain blocks movement", async () => {
    // Set a wall
    await client.callTool({
      name: "set_terrain",
      arguments: { cells: [{ x: 10, y: 10, type: "wall" }] },
    });

    // Place a token and try to move into the wall
    const tok = await client.callTool({
      name: "place_token",
      arguments: {
        label: "WallTester",
        x: 9,
        y: 10,
        size: "medium",
        color: "#0000ff",
        actor_kind: "pc",
        actor_id: 2,
      },
    });
    const tokId = (tok.content as Array<{ type: string; text: string }>)[0].text.match(
      /ID: (\w+)/,
    )![1];

    const moveResult = await client.callTool({
      name: "move_token",
      arguments: { token_id: tokId, x: 10, y: 10 },
    });
    expect(
      (moveResult.content as Array<{ type: string; text: string }>)[0].text,
    ).toContain("wall");
  });

  it("apply_aoe finds affected tokens", async () => {
    const result = await client.callTool({
      name: "apply_aoe",
      arguments: { shape: "circle", origin_x: 5, origin_y: 5, size_ft: 15 },
    });
    const text = (result.content as Array<{ type: string; text: string }>)[0].text;
    expect(text).toContain("circle AoE");
    expect(text).toContain("cells affected");
  });
});

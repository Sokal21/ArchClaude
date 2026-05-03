#!/usr/bin/env node

/**
 * Map MCP Server
 *
 * Owns spatial battle map state. Runs both:
 * 1. MCP stdio transport (for Claude tool calls)
 * 2. WebSocket server on port 3100 (for the map renderer / TV display)
 *
 * Usage:
 *   archclaude-map-mcp [--port 3100] [--campaign /path/to/campaign]
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { WebSocketServer, WebSocket } from "ws";
import { z } from "zod";
import { MapStore } from "./map-store.js";
import type { MapEvent, AoeShape, TokenSize, TerrainType, CoverType } from "./types.js";

function getArgs(): { port: number; campaignDir?: string } {
  let port = 3100;
  let campaignDir: string | undefined;
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--port" && args[i + 1]) port = parseInt(args[i + 1], 10);
    if (args[i] === "--campaign" && args[i + 1]) campaignDir = args[i + 1];
  }
  if (process.env.CAMPAIGN_DIR) campaignDir = process.env.CAMPAIGN_DIR;
  return { port, campaignDir };
}

async function main() {
  const { port, campaignDir } = getArgs();

  // WebSocket server for the renderer
  const wss = new WebSocketServer({ port });
  const clients = new Set<WebSocket>();

  wss.on("connection", (ws) => {
    clients.add(ws);
    ws.on("close", () => clients.delete(ws));
    // Send current map state on connect
    const map = store.getMap();
    if (map) {
      ws.send(JSON.stringify({
        type: "map_sync",
        timestamp: new Date().toISOString(),
        payload: {
          id: map.id,
          name: map.name,
          width: map.width,
          height: map.height,
          cell_size: map.cell_size,
          terrain: Array.from(map.terrain.values()),
          tokens: Array.from(map.tokens.values()),
        },
      }));
    }
  });

  // Event emitter broadcasts to all WS clients
  function broadcastEvent(event: MapEvent): void {
    const msg = JSON.stringify(event);
    for (const client of clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(msg);
      }
    }
  }

  const store = new MapStore(broadcastEvent);

  // MCP server
  const server = new McpServer({
    name: "archclaude-map",
    version: "0.1.0",
  });

  // ── Map lifecycle tools ──

  server.tool(
    "create_map",
    "Create a new battle map for a combat encounter.",
    {
      name: z.string().describe("Map name (e.g. 'Forest Clearing')"),
      width: z.number().int().positive().describe("Grid width in cells"),
      height: z.number().int().positive().describe("Grid height in cells"),
      combat_id: z.string().describe("Combat ID from start_combat"),
    },
    async ({ name, width, height, combat_id }) => {
      store.createMap(name, width, height, combat_id);
      return { content: [{ type: "text", text: `Map "${name}" created (${width}x${height} grid, combat ${combat_id}).` }] };
    },
  );

  server.tool(
    "get_map",
    "Get the current active map state — all terrain and tokens.",
    {},
    async () => {
      const map = store.getMap();
      if (!map) return { content: [{ type: "text", text: "No active map." }] };
      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            id: map.id,
            name: map.name,
            size: `${map.width}x${map.height}`,
            tokens: Array.from(map.tokens.values()).map((t) => ({
              id: t.id,
              label: t.label,
              pos: `(${t.x},${t.y})`,
              size: t.size,
              conditions: t.conditions,
              visible: t.visible,
            })),
            terrain_count: map.terrain.size,
          }, null, 2),
        }],
      };
    },
  );

  server.tool("clear_map", "Remove all tokens and terrain.", {}, async () => {
    store.clearMap();
    return { content: [{ type: "text", text: "Map cleared." }] };
  });

  server.tool("save_map", "Save the current map to disk.", {}, async () => {
    const path = store.saveMap(campaignDir);
    return { content: [{ type: "text", text: path ? `Map saved to ${path}` : "No map or no campaign dir." }] };
  });

  // ── Token tools ──

  server.tool(
    "place_token",
    "Place a token on the battle map. Returns the token ID for future reference.",
    {
      label: z.string().describe("Display name"),
      x: z.number().int(),
      y: z.number().int(),
      size: z.enum(["tiny", "small", "medium", "large", "huge", "gargantuan"]).default("medium"),
      color: z.string().default("#cc0000").describe("Hex color"),
      actor_kind: z.enum(["pc", "npc_instance"]),
      actor_id: z.number().int(),
      visible: z.boolean().optional().default(true),
    },
    async ({ label, x, y, size, color, actor_kind, actor_id, visible }) => {
      const token = store.placeToken({
        label, x, y,
        size: size as TokenSize,
        color, actor_kind, actor_id, visible,
      });
      return { content: [{ type: "text", text: `Token "${label}" placed at (${x},${y}), ID: ${token.id}` }] };
    },
  );

  server.tool(
    "move_token",
    "Move a token to a new grid position.",
    {
      token_id: z.string(),
      x: z.number().int(),
      y: z.number().int(),
    },
    async ({ token_id, x, y }) => {
      try {
        const token = store.moveToken(token_id, x, y);
        return { content: [{ type: "text", text: `${token.label} moved to (${x},${y}).` }] };
      } catch (err) {
        return { content: [{ type: "text", text: `Move failed: ${(err as Error).message}` }] };
      }
    },
  );

  server.tool("remove_token", "Remove a token from the map.", {
    token_id: z.string(),
  }, async ({ token_id }) => {
    const removed = store.removeToken(token_id);
    return { content: [{ type: "text", text: removed ? "Token removed." : "Token not found." }] };
  });

  server.tool("set_token_visibility", "Show or hide a token (for invisible creatures).", {
    token_id: z.string(),
    visible: z.boolean(),
  }, async ({ token_id, visible }) => {
    try {
      store.setTokenVisibility(token_id, visible);
      return { content: [{ type: "text", text: `Token ${visible ? "revealed" : "hidden"}.` }] };
    } catch (err) {
      return { content: [{ type: "text", text: (err as Error).message }] };
    }
  });

  server.tool("update_token_conditions", "Update visual condition indicators on a token.", {
    token_id: z.string(),
    conditions: z.array(z.string()),
  }, async ({ token_id, conditions }) => {
    try {
      store.updateTokenConditions(token_id, conditions);
      return { content: [{ type: "text", text: `Conditions updated: [${conditions.join(", ")}]` }] };
    } catch (err) {
      return { content: [{ type: "text", text: (err as Error).message }] };
    }
  });

  // ── Terrain tools ──

  server.tool(
    "set_terrain",
    "Set terrain for specific cells. Use for walls, difficult terrain, cover, etc.",
    {
      cells: z.array(z.object({
        x: z.number().int(),
        y: z.number().int(),
        type: z.enum(["open", "difficult", "wall", "water", "pit", "elevation"]),
        cover: z.enum(["none", "half", "three_quarter", "full"]).optional(),
        elevation: z.number().optional(),
        notes: z.string().optional(),
      })),
    },
    async ({ cells }) => {
      store.setTerrain(cells as Array<{ x: number; y: number; type: TerrainType; cover?: CoverType }>);
      return { content: [{ type: "text", text: `${cells.length} terrain cell(s) set.` }] };
    },
  );

  server.tool(
    "set_terrain_rect",
    "Fill a rectangle with a terrain type (quick wall/water placement).",
    {
      x: z.number().int(), y: z.number().int(),
      width: z.number().int().positive(), height: z.number().int().positive(),
      type: z.enum(["open", "difficult", "wall", "water", "pit", "elevation"]),
      cover: z.enum(["none", "half", "three_quarter", "full"]).optional(),
    },
    async ({ x, y, width, height, type, cover }) => {
      store.setTerrainRect(x, y, width, height, type as TerrainType, cover as CoverType | undefined);
      return { content: [{ type: "text", text: `Terrain rect ${width}x${height} of ${type} set at (${x},${y}).` }] };
    },
  );

  // ── Spatial query tools ──

  server.tool(
    "measure_distance",
    "Measure distance in feet between two tokens (Chebyshev/5e diagonal).",
    {
      from_token: z.string().describe("Token ID"),
      to_token: z.string().describe("Token ID"),
    },
    async ({ from_token, to_token }) => {
      try {
        const dist = store.measureDistance(from_token, to_token);
        const a = store.getToken(from_token);
        const b = store.getToken(to_token);
        return { content: [{ type: "text", text: `${a?.label ?? from_token} → ${b?.label ?? to_token}: ${dist}ft` }] };
      } catch (err) {
        return { content: [{ type: "text", text: (err as Error).message }] };
      }
    },
  );

  server.tool(
    "get_visible",
    "List tokens visible from a position (checks line-of-sight through walls).",
    { from_token: z.string() },
    async ({ from_token }) => {
      try {
        const visible = store.getVisible(from_token);
        const from = store.getToken(from_token);
        const summary = visible.map((t) => `${t.label} at (${t.x},${t.y})`);
        return {
          content: [{
            type: "text",
            text: `${from?.label ?? from_token} can see: ${summary.length > 0 ? summary.join(", ") : "nobody"}`,
          }],
        };
      } catch (err) {
        return { content: [{ type: "text", text: (err as Error).message }] };
      }
    },
  );

  server.tool(
    "query_in_range",
    "Find all tokens within a range (feet) from a token.",
    {
      from_token: z.string(),
      range_ft: z.number().positive(),
    },
    async ({ from_token, range_ft }) => {
      try {
        const tokens = store.queryInRange(from_token, range_ft);
        const from = store.getToken(from_token);
        const summary = tokens.map((t) => {
          const dist = store.measureDistance(from_token, t.id);
          return `${t.label} (${dist}ft)`;
        });
        return {
          content: [{
            type: "text",
            text: `Within ${range_ft}ft of ${from?.label ?? from_token}: ${summary.length > 0 ? summary.join(", ") : "nobody"}`,
          }],
        };
      } catch (err) {
        return { content: [{ type: "text", text: (err as Error).message }] };
      }
    },
  );

  server.tool(
    "apply_aoe",
    "Apply an area of effect and find affected tokens. Shape: circle, cone, line, cube.",
    {
      shape: z.enum(["circle", "cone", "line", "cube"]),
      origin_x: z.number().int(),
      origin_y: z.number().int(),
      size_ft: z.number().positive().describe("Radius/length in feet"),
      direction: z.number().optional().describe("Direction in degrees (0=north) — for cone and line"),
    },
    async ({ shape, origin_x, origin_y, size_ft, direction }) => {
      try {
        const result = store.applyAoe(shape as AoeShape, origin_x, origin_y, size_ft, direction);
        const affected = result.affectedTokens.map((t) => t.label);
        return {
          content: [{
            type: "text",
            text: `${shape} AoE (${size_ft}ft) at (${origin_x},${origin_y}): ${result.cells.length} cells affected. Tokens hit: ${affected.length > 0 ? affected.join(", ") : "none"}`,
          }],
        };
      } catch (err) {
        return { content: [{ type: "text", text: (err as Error).message }] };
      }
    },
  );

  // ── HUD forwarding tool ──

  server.tool(
    "broadcast_narration",
    "Send narration text to the TV display via WebSocket.",
    {
      text: z.string(),
      intensity: z.enum(["terse", "normal", "tense", "climax"]).optional(),
    },
    async ({ text, intensity }) => {
      store.forwardEvent("narration_text", { text, intensity: intensity ?? "normal" });
      return { content: [{ type: "text", text: "Narration broadcast to display." }] };
    },
  );

  server.tool(
    "broadcast_initiative",
    "Update the initiative display on the TV.",
    {
      order: z.array(z.object({
        name: z.string(),
        actor_kind: z.string(),
        actor_id: z.number(),
        init: z.number(),
      })),
      current_index: z.number().int(),
    },
    async ({ order, current_index }) => {
      store.forwardEvent("initiative_update", { order, current_index });
      return { content: [{ type: "text", text: "Initiative display updated." }] };
    },
  );

  server.tool(
    "broadcast_party_status",
    "Update party HP/condition display on the TV.",
    {
      pcs: z.array(z.object({
        name: z.string(),
        hp: z.number(),
        max_hp: z.number(),
        conditions: z.array(z.string()),
      })),
    },
    async ({ pcs }) => {
      store.forwardEvent("party_status_update", { pcs });
      return { content: [{ type: "text", text: "Party status display updated." }] };
    },
  );

  // Start MCP transport
  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error(`Map MCP server running. WebSocket on port ${port}.`);

  process.on("SIGINT", () => {
    wss.close();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});

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

import { resolve, join } from "node:path";
import Database from "better-sqlite3";
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
    if (args[i] === "--campaign" && args[i + 1]) campaignDir = resolve(args[i + 1]);
  }
  if (process.env.CAMPAIGN_DIR) campaignDir = resolve(process.env.CAMPAIGN_DIR);
  return { port, campaignDir };
}

async function main() {
  const { port, campaignDir } = getArgs();

  // Open the campaign DB (used for action queue writes + broadcast reads)
  let campaignDb: InstanceType<typeof Database> | null = null;
  let actionQueueInsert: ((playerId: string, actionType: string, payloadJson: string, submittedAt: string) => void) | null = null;
  if (campaignDir) {
    try {
      campaignDb = new Database(join(campaignDir, "campaign.db"));
      campaignDb.pragma("journal_mode = WAL");
      const stmt = campaignDb.prepare(
        "INSERT INTO action_queue (player_id, action_type, payload_json, submitted_at) VALUES (?, ?, ?, ?)",
      );
      actionQueueInsert = (playerId, actionType, payloadJson, submittedAt) => {
        stmt.run(playerId, actionType, payloadJson, submittedAt);
      };
      console.error("Campaign DB connected (action queue + broadcast reads).");
    } catch {
      console.error("Warning: Could not open campaign DB. Action queue and DB-backed broadcasts unavailable.");
    }
  }

  /** Route an incoming WebSocket message to the action queue. */
  function enqueueAction(playerId: string, actionType: string, payload: Record<string, unknown>): void {
    if (actionQueueInsert) {
      actionQueueInsert(playerId, actionType, JSON.stringify(payload), new Date().toISOString());
    }
  }

  // WebSocket server for the renderer
  const wss = new WebSocketServer({ port });
  const clients = new Set<WebSocket>();

  wss.on("connection", (ws) => {
    clients.add(ws);
    ws.on("close", () => clients.delete(ws));

    // Handle incoming messages from Player UI / TV Display
    ws.on("message", (data) => {
      try {
        const msg = JSON.parse(data.toString()) as {
          type: string;
          payload: Record<string, unknown>;
        };

        switch (msg.type) {
          case "pc_action_submitted":
            enqueueAction(
              (msg.payload.player_id as string) ?? "unknown",
              (msg.payload.action as string) ?? "other",
              msg.payload,
            );
            // Also broadcast to other clients (TV display can show pending action)
            broadcastEvent({
              type: "player_action_submitted",
              timestamp: new Date().toISOString(),
              payload: msg.payload,
            });
            break;

          case "pc_say":
            enqueueAction(
              (msg.payload.player_id as string) ?? "unknown",
              "say",
              msg.payload,
            );
            break;

          case "pc_roll":
            enqueueAction(
              (msg.payload.player_id as string) ?? "unknown",
              "roll",
              msg.payload,
            );
            break;

          case "pc_click_move":
            enqueueAction(
              (msg.payload.actor_kind as string) ?? "unknown",
              "move",
              msg.payload,
            );
            break;

          // DM injections
          case "dm_inject_public":
          case "dm_inject_secret":
          case "dm_inject_override":
          case "dm_inject_seed":
            enqueueAction("dm", "dm_inject", {
              inject_type: msg.type.replace("dm_inject_", ""),
              ...msg.payload,
            });
            break;
        }
      } catch {
        // Ignore malformed messages
      }
    });

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

  server.registerTool(
    "create_map",
    {
      description: "Create a new battle map for a combat encounter.",
      inputSchema: {
        name: z.string().describe("Map name (e.g. 'Forest Clearing')"),
        width: z.number().int().positive().describe("Grid width in cells"),
        height: z.number().int().positive().describe("Grid height in cells"),
        combat_id: z.string().describe("Combat ID from start_combat"),
      },
    },
    async ({ name, width, height, combat_id }) => {
      store.createMap(name, width, height, combat_id);
      return { content: [{ type: "text", text: `Map "${name}" created (${width}x${height} grid, combat ${combat_id}).` }] };
    },
  );

  server.registerTool(
    "get_map",
    { description: "Get the current active map state — all terrain and tokens." },
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

  server.registerTool("clear_map", { description: "Remove all tokens and terrain." }, async () => {
    store.clearMap();
    return { content: [{ type: "text", text: "Map cleared." }] };
  });

  server.registerTool("save_map", { description: "Save the current map to disk." }, async () => {
    const path = store.saveMap(campaignDir);
    return { content: [{ type: "text", text: path ? `Map saved to ${path}` : "No map or no campaign dir." }] };
  });

  // ── Token tools ──

  server.registerTool(
    "place_token",
    {
      description: "Place a token on the battle map. Returns the token ID for future reference.",
      inputSchema: {
        label: z.string().describe("Display name"),
        x: z.number().int(),
        y: z.number().int(),
        size: z.enum(["tiny", "small", "medium", "large", "huge", "gargantuan"]).default("medium"),
        color: z.string().default("#cc0000").describe("Hex color"),
        actor_kind: z.enum(["pc", "npc_instance"]),
        actor_id: z.number().int(),
        visible: z.boolean().optional().default(true),
      },
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

  server.registerTool(
    "move_token",
    {
      description: "Move a token to a new grid position.",
      inputSchema: {
        token_id: z.string(),
        x: z.number().int(),
        y: z.number().int(),
      },
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

  server.registerTool("remove_token", {
    description: "Remove a token from the map.",
    inputSchema: { token_id: z.string() },
  }, async ({ token_id }) => {
    const removed = store.removeToken(token_id);
    return { content: [{ type: "text", text: removed ? "Token removed." : "Token not found." }] };
  });

  server.registerTool("set_token_visibility", {
    description: "Show or hide a token (for invisible creatures).",
    inputSchema: { token_id: z.string(), visible: z.boolean() },
  }, async ({ token_id, visible }) => {
    try {
      store.setTokenVisibility(token_id, visible);
      return { content: [{ type: "text", text: `Token ${visible ? "revealed" : "hidden"}.` }] };
    } catch (err) {
      return { content: [{ type: "text", text: (err as Error).message }] };
    }
  });

  server.registerTool("update_token_conditions", {
    description: "Update visual condition indicators on a token.",
    inputSchema: { token_id: z.string(), conditions: z.array(z.string()) },
  }, async ({ token_id, conditions }) => {
    try {
      store.updateTokenConditions(token_id, conditions);
      return { content: [{ type: "text", text: `Conditions updated: [${conditions.join(", ")}]` }] };
    } catch (err) {
      return { content: [{ type: "text", text: (err as Error).message }] };
    }
  });

  // ── Terrain tools ──

  server.registerTool(
    "set_terrain",
    {
      description: "Set terrain for specific cells. Use for walls, difficult terrain, cover, etc.",
      inputSchema: {
        cells: z.array(z.object({
          x: z.number().int(),
          y: z.number().int(),
          type: z.enum(["open", "difficult", "wall", "water", "pit", "elevation"]),
          cover: z.enum(["none", "half", "three_quarter", "full"]).optional(),
          elevation: z.number().optional(),
          notes: z.string().optional(),
        })),
      },
    },
    async ({ cells }) => {
      store.setTerrain(cells as Array<{ x: number; y: number; type: TerrainType; cover?: CoverType }>);
      return { content: [{ type: "text", text: `${cells.length} terrain cell(s) set.` }] };
    },
  );

  server.registerTool(
    "set_terrain_rect",
    {
      description: "Fill a rectangle with a terrain type (quick wall/water placement).",
      inputSchema: {
        x: z.number().int(), y: z.number().int(),
        width: z.number().int().positive(), height: z.number().int().positive(),
        type: z.enum(["open", "difficult", "wall", "water", "pit", "elevation"]),
        cover: z.enum(["none", "half", "three_quarter", "full"]).optional(),
      },
    },
    async ({ x, y, width, height, type, cover }) => {
      store.setTerrainRect(x, y, width, height, type as TerrainType, cover as CoverType | undefined);
      return { content: [{ type: "text", text: `Terrain rect ${width}x${height} of ${type} set at (${x},${y}).` }] };
    },
  );

  // ── Spatial query tools ──

  server.registerTool(
    "measure_distance",
    {
      description: "Measure distance in feet between two tokens (Chebyshev/5e diagonal).",
      inputSchema: {
        from_token: z.string().describe("Token ID"),
        to_token: z.string().describe("Token ID"),
      },
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

  server.registerTool(
    "get_visible",
    {
      description: "List tokens visible from a position (checks line-of-sight through walls).",
      inputSchema: { from_token: z.string() },
    },
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

  server.registerTool(
    "query_in_range",
    {
      description: "Find all tokens within a range (feet) from a token.",
      inputSchema: {
        from_token: z.string(),
        range_ft: z.number().positive(),
      },
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

  server.registerTool(
    "apply_aoe",
    {
      description: "Apply an area of effect and find affected tokens. Shape: circle, cone, line, cube.",
      inputSchema: {
        shape: z.enum(["circle", "cone", "line", "cube"]),
        origin_x: z.number().int(),
        origin_y: z.number().int(),
        size_ft: z.number().positive().describe("Radius/length in feet"),
        direction: z.number().optional().describe("Direction in degrees (0=north) — for cone and line"),
      },
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

  server.registerTool(
    "broadcast_narration",
    {
      description: "Send narration text to the TV display via WebSocket.",
      inputSchema: {
        text: z.string(),
        intensity: z.enum(["terse", "normal", "tense", "climax"]).optional(),
      },
    },
    async ({ text, intensity }) => {
      store.forwardEvent("narration_text", { text, intensity: intensity ?? "normal" });
      return { content: [{ type: "text", text: "Narration broadcast to display." }] };
    },
  );

  server.registerTool(
    "broadcast_initiative",
    {
      description: "Read initiative from the active combat in the DB and broadcast to the TV. Requires an active combat created via start_combat + set_initiative. WILL FAIL if no combat exists — you MUST call start_combat and set_initiative first.",
    },
    async () => {
      if (!campaignDb) {
        return { content: [{ type: "text", text: "No campaign DB connected. Cannot read initiative." }] };
      }
      const combat = campaignDb.prepare("SELECT * FROM combats WHERE ended_at IS NULL ORDER BY id DESC LIMIT 1").get() as Record<string, unknown> | undefined;
      if (!combat) {
        return { content: [{ type: "text", text: "ERROR: No active combat in database. You MUST call start_combat first, then add_combatant for each enemy, then set_initiative. Do NOT skip these steps." }] };
      }
      if (!combat.initiative_json) {
        return { content: [{ type: "text", text: "ERROR: Combat exists but no initiative set. Call set_initiative first." }] };
      }
      const initiative = JSON.parse(combat.initiative_json as string) as Array<{ actor_kind: string; actor_id: number; init: number }>;
      // Resolve names
      const order = initiative.map((entry) => {
        let name = `${entry.actor_kind}#${entry.actor_id}`;
        if (entry.actor_kind === "pc") {
          const pc = campaignDb!.prepare("SELECT name FROM pcs WHERE id = ?").get(entry.actor_id) as { name: string } | undefined;
          if (pc) name = pc.name;
        } else {
          const inst = campaignDb!.prepare("SELECT display_name FROM npc_instances WHERE id = ?").get(entry.actor_id) as { display_name: string } | undefined;
          if (inst) name = inst.display_name;
        }
        return { name, actor_kind: entry.actor_kind, actor_id: entry.actor_id, init: entry.init };
      });
      store.forwardEvent("initiative_update", { order, current_index: combat.current_turn as number });
      return { content: [{ type: "text", text: `Initiative broadcast (${order.length} combatants, round ${combat.round_number}).` }] };
    },
  );

  server.registerTool(
    "broadcast_party_status",
    {
      description: "Read party HP/conditions from the DB and broadcast to the TV. Reads live data — no input needed.",
    },
    async () => {
      if (!campaignDb) {
        return { content: [{ type: "text", text: "No campaign DB connected." }] };
      }
      const pcs = campaignDb.prepare("SELECT name, current_hp, max_hp, conditions_json FROM pcs WHERE active = 1").all() as Array<{
        name: string; current_hp: number; max_hp: number; conditions_json: string | null;
      }>;
      const data = pcs.map((pc) => ({
        name: pc.name,
        hp: pc.current_hp,
        max_hp: pc.max_hp,
        conditions: pc.conditions_json ? JSON.parse(pc.conditions_json) : [],
      }));
      store.forwardEvent("party_status_update", { pcs: data });
      return { content: [{ type: "text", text: `Party status broadcast (${pcs.length} PCs).` }] };
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

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CampaignDB } from "@archclaude/state";
import { NPCDAL } from "@archclaude/state";

export function registerNPCTools(server: McpServer, db: CampaignDB) {
  const dal = new NPCDAL(db.db);

  server.tool(
    "get_npc",
    "Get an NPC by name. Returns role, status, location, faction, and summary.",
    { name: z.string().describe("NPC name") },
    async ({ name }) => {
      const npc = dal.getByName(name);
      if (!npc) {
        return { content: [{ type: "text", text: `NPC "${name}" not found.` }] };
      }
      return { content: [{ type: "text", text: JSON.stringify(npc, null, 2) }] };
    },
  );

  server.tool(
    "list_npcs",
    "List NPCs, optionally filtered by status or faction.",
    {
      status: z.enum(["alive", "dead", "missing", "unknown"]).optional(),
      faction: z.string().optional(),
    },
    async ({ status, faction }) => {
      const npcs = dal.list({ status, faction });
      const summary = npcs.map((n) => ({
        name: n.name,
        role: n.role,
        status: n.status,
        location: n.current_location,
        faction: n.faction,
      }));
      return { content: [{ type: "text", text: JSON.stringify(summary, null, 2) }] };
    },
  );

  server.tool(
    "create_npc",
    "Register a new NPC in the campaign.",
    {
      name: z.string(),
      role: z.string().optional(),
      current_location: z.string().optional(),
      faction: z.string().optional(),
      notes_summary: z.string().optional().describe("One-paragraph summary for token-efficient recall"),
      introduced_session: z.number().optional(),
    },
    async (params) => {
      const npc = dal.create(params);
      return { content: [{ type: "text", text: `NPC created: ${npc.name} (${npc.role ?? "no role"})` }] };
    },
  );

  server.tool(
    "update_npc",
    "Update an NPC's status, location, faction, or other fields.",
    {
      name: z.string().describe("NPC name to update"),
      status: z.enum(["alive", "dead", "missing", "unknown"]).optional(),
      current_location: z.string().optional(),
      faction: z.string().optional(),
      notes_summary: z.string().optional(),
    },
    async ({ name, ...fields }) => {
      const npc = dal.getByName(name);
      if (!npc) {
        return { content: [{ type: "text", text: `NPC "${name}" not found.` }] };
      }
      const updated = dal.update(npc.id, fields);
      return { content: [{ type: "text", text: `NPC updated: ${JSON.stringify(updated, null, 2)}` }] };
    },
  );
}

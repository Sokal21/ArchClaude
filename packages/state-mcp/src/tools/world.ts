import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CampaignDB } from "@archclaude/state";
import { LocationDAL, FactionDAL, QuestDAL } from "@archclaude/state";

export function registerWorldTools(server: McpServer, db: CampaignDB) {
  const locationDal = new LocationDAL(db.db);
  const factionDal = new FactionDAL(db.db);
  const questDal = new QuestDAL(db.db);

  // ── Locations ──

  server.registerTool(
    "get_location",
    {
      description: "Get a location by name.",
      inputSchema: { name: z.string() },
    },
    async ({ name }) => {
      const loc = locationDal.getByName(name);
      if (!loc) return { content: [{ type: "text", text: `Location "${name}" not found.` }] };
      return { content: [{ type: "text", text: JSON.stringify(loc, null, 2) }] };
    },
  );

  server.registerTool(
    "list_locations",
    {
      description: "List known locations, optionally filtered by type or status.",
      inputSchema: {
        type: z.enum(["city", "dungeon", "wilderness", "landmark", "building", "room"]).optional(),
        status: z.enum(["unknown", "known", "visited", "cleared", "destroyed"]).optional(),
      },
    },
    async ({ type, status }) => {
      const locs = locationDal.list({ type, status });
      return { content: [{ type: "text", text: JSON.stringify(locs.map((l) => ({ name: l.name, type: l.type, status: l.status })), null, 2) }] };
    },
  );

  server.registerTool(
    "create_location",
    {
      description: "Register a new location in the campaign.",
      inputSchema: {
        name: z.string(),
        type: z.enum(["city", "dungeon", "wilderness", "landmark", "building", "room"]).optional(),
        parent_name: z.string().optional().describe("Parent location name for nesting"),
        status: z.enum(["unknown", "known", "visited", "cleared", "destroyed"]).optional(),
      },
    },
    async ({ name, type, parent_name, status }) => {
      let parent_id: number | undefined;
      if (parent_name) {
        const parent = locationDal.getByName(parent_name);
        if (!parent) return { content: [{ type: "text", text: `Parent location "${parent_name}" not found.` }] };
        parent_id = parent.id;
      }
      const loc = locationDal.create({ name, type, parent_id, status });
      return { content: [{ type: "text", text: `Location created: ${loc.name} (${loc.type ?? "untyped"})` }] };
    },
  );

  server.registerTool(
    "update_location_status",
    {
      description: "Update a location's status (e.g. mark as visited, cleared).",
      inputSchema: {
        name: z.string(),
        status: z.enum(["unknown", "known", "visited", "cleared", "destroyed"]),
      },
    },
    async ({ name, status }) => {
      const loc = locationDal.getByName(name);
      if (!loc) return { content: [{ type: "text", text: `Location "${name}" not found.` }] };
      locationDal.update(loc.id, { status });
      return { content: [{ type: "text", text: `${name} is now ${status}.` }] };
    },
  );

  // ── Factions ──

  server.registerTool(
    "list_factions",
    { description: "List all factions with their reputation scores." },
    async () => {
      const factions = factionDal.list();
      return { content: [{ type: "text", text: JSON.stringify(factions, null, 2) }] };
    },
  );

  server.registerTool(
    "update_faction_reputation",
    {
      description: "Adjust a faction's reputation score (-10 hostile to +10 allied).",
      inputSchema: {
        name: z.string(),
        delta: z.number().describe("Change in reputation (positive = more friendly)"),
      },
    },
    async ({ name, delta }) => {
      const faction = factionDal.getByName(name);
      if (!faction) return { content: [{ type: "text", text: `Faction "${name}" not found.` }] };
      const newRep = Math.max(-10, Math.min(10, faction.reputation + delta));
      factionDal.update(faction.id, { reputation: newRep });
      return { content: [{ type: "text", text: `${name} reputation: ${faction.reputation} → ${newRep}` }] };
    },
  );

  // ── Quests ──

  server.registerTool(
    "list_active_quests",
    { description: "List all active quests." },
    async () => {
      const quests = questDal.listActive();
      return { content: [{ type: "text", text: JSON.stringify(quests, null, 2) }] };
    },
  );

  server.registerTool(
    "create_quest",
    {
      description: "Create a new quest.",
      inputSchema: {
        title: z.string(),
        summary: z.string().optional(),
        giver_npc: z.string().optional().describe("NPC name who gives this quest"),
      },
    },
    async ({ title, summary }) => {
      const quest = questDal.create({ title, summary });
      return { content: [{ type: "text", text: `Quest created: "${quest.title}" (${quest.state})` }] };
    },
  );

  server.registerTool(
    "update_quest_state",
    {
      description: "Update a quest's state.",
      inputSchema: {
        title: z.string().describe("Quest title to find"),
        new_state: z.enum(["active", "completed", "failed", "dormant"]),
      },
    },
    async ({ title, new_state }) => {
      const quests = questDal.list();
      const quest = quests.find((q) => q.title === title);
      if (!quest) return { content: [{ type: "text", text: `Quest "${title}" not found.` }] };
      questDal.update(quest.id, { state: new_state });
      return { content: [{ type: "text", text: `Quest "${title}" is now ${new_state}.` }] };
    },
  );
}

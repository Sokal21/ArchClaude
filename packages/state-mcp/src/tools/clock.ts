import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CampaignDB } from "@archclaude/state";
import { ClockDAL, EventDAL } from "@archclaude/state";
import { EVENT_TYPES } from "@archclaude/shared";

export function registerClockTools(server: McpServer, db: CampaignDB) {
  const dal = new ClockDAL(db.db);
  const eventDal = new EventDAL(db.db);

  server.registerTool(
    "get_clock",
    { description: "Get the current in-world time, date, weather, location, and party state." },
    async () => {
      const clock = dal.get();
      if (!clock) {
        return { content: [{ type: "text", text: "Clock not initialized." }] };
      }
      return { content: [{ type: "text", text: JSON.stringify(clock, null, 2) }] };
    },
  );

  server.registerTool(
    "advance_clock",
    {
      description: "Advance in-world time. Updates time of day, optionally date and weather.",
      inputSchema: {
        time_of_day: z.enum(["dawn", "morning", "midday", "dusk", "night", "midnight"]).optional(),
        in_world_date: z.string().optional().describe("New in-world date string"),
        weather: z.string().optional(),
        party_state: z.enum(["exploring", "traveling", "resting", "in_combat", "social", "downtime"]).optional(),
      },
    },
    async (fields) => {
      const updated = dal.update(fields);
      eventDal.append({
        source: "orchestrator",
        type: EVENT_TYPES.CLOCK_ADVANCED,
        payload: { delta_minutes: 0, new_time_of_day: fields.time_of_day },
      });
      return { content: [{ type: "text", text: `Clock updated: ${JSON.stringify(updated, null, 2)}` }] };
    },
  );

  server.registerTool(
    "set_party_location",
    {
      description: "Update where the party currently is.",
      inputSchema: {
        location_name: z.string(),
      },
    },
    async ({ location_name }) => {
      const { LocationDAL } = await import("@archclaude/state");
      const locDal = new LocationDAL(db.db);
      const loc = locDal.getByName(location_name);
      if (!loc) {
        return { content: [{ type: "text", text: `Location "${location_name}" not found. Create it first.` }] };
      }
      dal.update({ current_location_id: loc.id });

      eventDal.append({
        source: "orchestrator",
        type: EVENT_TYPES.LOCATION_ENTERED,
        payload: { location_id: loc.id },
      });

      return { content: [{ type: "text", text: `Party is now at ${location_name}.` }] };
    },
  );
}

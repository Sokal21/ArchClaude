import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CampaignDB } from "@archclaude/state";
import { EventDAL } from "@archclaude/state";

export function registerEventTools(server: McpServer, db: CampaignDB) {
  const dal = new EventDAL(db.db);

  server.tool(
    "get_recent_events",
    "Get the most recent events from the event log. Useful for understanding what just happened.",
    {
      limit: z.number().optional().describe("Max events to return (default 20)"),
      type: z.string().optional().describe("Filter by event type (e.g. 'damage_dealt')"),
    },
    async ({ limit, type }) => {
      const events = type
        ? dal.listByType(type).slice(-(limit ?? 20))
        : dal.recent(limit ?? 20);

      if (events.length === 0) {
        return { content: [{ type: "text", text: "No events found." }] };
      }

      const formatted = events.map((e) =>
        `[${e.timestamp}] ${e.type} (${e.source}): ${JSON.stringify(e.payload_json)}`,
      );

      return { content: [{ type: "text", text: formatted.join("\n") }] };
    },
  );

  server.tool(
    "get_session_events",
    "Get all events for a specific session. Used for recap generation and session review.",
    {
      session_number: z.number(),
    },
    async ({ session_number }) => {
      // Find session by number
      const { SessionDAL } = await import("@archclaude/state");
      const sessionDal = new SessionDAL(db.db);
      const session = sessionDal.getByNumber(session_number);
      if (!session) {
        return { content: [{ type: "text", text: `Session ${session_number} not found.` }] };
      }

      const events = dal.project(session.id);
      return { content: [{ type: "text", text: JSON.stringify(events, null, 2) }] };
    },
  );

  server.tool(
    "undo_last_event",
    "Revert the most recent non-reverted event. Used for 'wait, redo that' moments at the table.",
    {},
    async () => {
      const recent = dal.recent(1);
      if (recent.length === 0) {
        return { content: [{ type: "text", text: "No events to undo." }] };
      }

      const event = recent[0];
      const success = dal.revert(event.id);
      if (!success) {
        return { content: [{ type: "text", text: "Event already reverted." }] };
      }

      return {
        content: [{
          type: "text",
          text: `Reverted event #${event.id}: ${event.type} (${event.source})\nPayload: ${JSON.stringify(event.payload_json)}\n\nNote: The projected state from this event still needs manual correction.`,
        }],
      };
    },
  );
}

import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CampaignDB } from "@archclaude/state";
import { SessionDAL } from "@archclaude/state";

export function registerSessionTools(server: McpServer, db: CampaignDB) {
  const dal = new SessionDAL(db.db);

  server.tool(
    "get_session",
    "Get a session by number. Returns session metadata including key events.",
    { session_number: z.number().describe("The session number (1-based)") },
    async ({ session_number }) => {
      const session = dal.getByNumber(session_number);
      if (!session) {
        return { content: [{ type: "text", text: `Session ${session_number} not found.` }] };
      }
      return { content: [{ type: "text", text: JSON.stringify(session, null, 2) }] };
    },
  );

  server.tool(
    "list_sessions",
    "List all sessions in chronological order.",
    {},
    async () => {
      const sessions = dal.list();
      return { content: [{ type: "text", text: JSON.stringify(sessions, null, 2) }] };
    },
  );

  server.tool(
    "start_session",
    "Start a new session. Creates a session record with the next sequential number.",
    {},
    async () => {
      const existing = dal.list();
      const nextNumber = existing.length > 0 ? Math.max(...existing.map((s) => s.number)) + 1 : 1;
      const session = dal.create({
        number: nextNumber,
        played_at: new Date().toISOString(),
      });
      return { content: [{ type: "text", text: `Session ${session.number} started.\n${JSON.stringify(session, null, 2)}` }] };
    },
  );

  server.tool(
    "end_session",
    "End the current session. Sets ended_at and optionally records key events.",
    {
      session_number: z.number().describe("Session number to end"),
      key_events: z.array(z.string()).optional().describe("List of key events from this session"),
    },
    async ({ session_number, key_events }) => {
      const session = dal.getByNumber(session_number);
      if (!session) {
        return { content: [{ type: "text", text: `Session ${session_number} not found.` }] };
      }
      const updated = dal.update(session.id, {
        ended_at: new Date().toISOString(),
        key_events_json: key_events,
      });
      return { content: [{ type: "text", text: `Session ${session_number} ended.\n${JSON.stringify(updated, null, 2)}` }] };
    },
  );
}

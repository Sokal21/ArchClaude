import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CampaignDB } from "@archclaude/state";
import { ActionQueueDAL } from "@archclaude/state";

export function registerActionQueueTools(server: McpServer, db: CampaignDB) {
  const dal = new ActionQueueDAL(db.db);

  server.registerTool(
    "get_pending_actions",
    {
      description: "Get all pending player actions from the queue. Call this during PC turns in combat to check if the Player UI has submitted an action.",
    },
    async () => {
      const pending = dal.listPending();
      if (pending.length === 0) {
        return { content: [{ type: "text", text: "No pending actions in queue." }] };
      }
      return { content: [{ type: "text", text: JSON.stringify(pending, null, 2) }] };
    },
  );

  server.registerTool(
    "dequeue_action",
    {
      description: "Get and process the next pending action from the queue. Returns the action and marks it as processed.",
    },
    async () => {
      const action = dal.dequeue();
      if (!action) {
        return { content: [{ type: "text", text: "No pending actions." }] };
      }
      return {
        content: [{
          type: "text",
          text: `Action from ${action.player_id} (${action.action_type}):\n${JSON.stringify(action.payload_json, null, 2)}`,
        }],
      };
    },
  );

  server.registerTool(
    "submit_action",
    {
      description: "Submit a player action to the queue (used by external systems or for testing).",
      inputSchema: {
        player_id: z.string().describe("Player name or ID"),
        action_type: z.string().describe("Action type: attack, cast_spell, use_ability, other, say, roll, dm_inject"),
        payload: z.record(z.string(), z.unknown()).describe("Action details as key-value pairs"),
      },
    },
    async ({ player_id, action_type, payload }) => {
      const action = dal.enqueue({
        player_id,
        action_type,
        payload: payload as Record<string, unknown>,
      });
      return {
        content: [{
          type: "text",
          text: `Action queued (id: ${action.id}): ${action_type} from ${player_id}`,
        }],
      };
    },
  );

  server.registerTool(
    "mark_action_processed",
    {
      description: "Mark a specific queued action as processed.",
      inputSchema: {
        action_id: z.number(),
      },
    },
    async ({ action_id }) => {
      const ok = dal.markProcessed(action_id);
      return {
        content: [{
          type: "text",
          text: ok ? `Action #${action_id} marked processed.` : `Action #${action_id} not found.`,
        }],
      };
    },
  );

  server.registerTool(
    "clear_processed_actions",
    {
      description: "Clean up all processed actions from the queue.",
    },
    async () => {
      const count = dal.clearProcessed();
      return { content: [{ type: "text", text: `Cleared ${count} processed action(s).` }] };
    },
  );
}

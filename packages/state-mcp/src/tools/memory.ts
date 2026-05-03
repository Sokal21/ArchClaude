import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CampaignDB } from "@archclaude/state";
import { MemoryDAL } from "@archclaude/state";

export function registerMemoryTools(server: McpServer, db: CampaignDB) {
  const dal = new MemoryDAL(db.db);

  server.tool(
    "recall_memory",
    "Search campaign memory using full-text search. Returns relevant chunks from session summaries, NPC notes, lore. Use keyword-rich queries for best results.",
    {
      query: z.string().describe("Search query (keywords work best, e.g. 'shadow wolves hollow wood')"),
      tags: z.array(z.string()).optional().describe("Optional entity tags to filter by (e.g. ['npc:vincent_blackwood', 'loc:goldspire'])"),
      limit: z.number().optional().describe("Max results (default 10)"),
    },
    async ({ query, tags, limit }) => {
      const results = tags && tags.length > 0
        ? dal.searchWithTags(query, tags, limit ?? 10)
        : dal.search(query, limit ?? 10);

      if (results.length === 0) {
        return { content: [{ type: "text", text: `No memories found for "${query}".` }] };
      }

      const formatted = results.map((chunk, i) => {
        const source = chunk.source_file ? ` [${chunk.source_file}]` : "";
        const tags = chunk.tags_json ? ` tags: ${chunk.tags_json.join(", ")}` : "";
        return `--- Result ${i + 1}${source}${tags} ---\n${chunk.text}`;
      });

      return { content: [{ type: "text", text: formatted.join("\n\n") }] };
    },
  );

  server.tool(
    "add_memory",
    "Manually add a memory chunk to the campaign (for DM injections, important moments, etc).",
    {
      kind: z.enum(["session_summary", "npc_note", "lore", "dialog", "secret", "seed"]),
      text: z.string(),
      tags: z.array(z.string()).optional(),
      source_session: z.number().optional(),
    },
    async ({ kind, text, tags, source_session }) => {
      const chunk = dal.create({ kind, text, tags_json: tags, source_session });
      return { content: [{ type: "text", text: `Memory added (id: ${chunk.id}, kind: ${kind}).` }] };
    },
  );
}

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CampaignDB } from "@archclaude/state";
import { indexCampaign } from "@archclaude/state";

export function registerIndexerTools(server: McpServer, db: CampaignDB) {
  server.registerTool(
    "reindex_campaign",
    { description: "Re-index all campaign markdown files into the database. Run after DM edits files or at session start." },
    async () => {
      const result = indexCampaign(db);
      let text = `Indexed ${result.files_processed} files, created ${result.chunks_created} memory chunks.`;
      if (result.errors.length > 0) {
        text += `\nErrors:\n${result.errors.join("\n")}`;
      }
      return { content: [{ type: "text", text }] };
    },
  );
}

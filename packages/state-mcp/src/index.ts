#!/usr/bin/env node

/**
 * Campaign State MCP Server
 *
 * Exposes the campaign SQLite database as MCP tools for Cowork.
 * This is how Claude accesses campaign state during a session —
 * every query and mutation goes through these tools.
 *
 * Architecture: The MCP server opens one campaign database (path passed
 * as CLI arg or env var) and registers tools grouped by domain.
 * Tool design follows the "pull, don't push" principle: agents query
 * small slices rather than receiving large state blobs.
 *
 * Usage:
 *   CAMPAIGN_DIR=/path/to/campaign archclaude-state-mcp
 *   archclaude-state-mcp --campaign /path/to/campaign
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CampaignDB, migrate } from "@archclaude/state";
import { registerSessionTools } from "./tools/sessions.js";
import { registerPCTools } from "./tools/pcs.js";
import { registerNPCTools } from "./tools/npcs.js";
import { registerCombatTools } from "./tools/combat.js";
import { registerWorldTools } from "./tools/world.js";
import { registerMemoryTools } from "./tools/memory.js";
import { registerEventTools } from "./tools/events.js";
import { registerClockTools } from "./tools/clock.js";
import { registerInventoryTools } from "./tools/inventory.js";
import { registerSeedSecretTools } from "./tools/seeds-secrets.js";
import { registerIndexerTools } from "./tools/indexer.js";

function getCampaignDir(): string {
  // Check CLI args
  const idx = process.argv.indexOf("--campaign");
  if (idx !== -1 && process.argv[idx + 1]) {
    return process.argv[idx + 1];
  }
  // Check env var
  if (process.env.CAMPAIGN_DIR) {
    return process.env.CAMPAIGN_DIR;
  }
  console.error(
    "Usage: archclaude-state-mcp --campaign /path/to/campaign\n" +
      "   or: CAMPAIGN_DIR=/path/to/campaign archclaude-state-mcp",
  );
  process.exit(1);
}

async function main() {
  const campaignDir = getCampaignDir();
  const campaignDb = new CampaignDB(campaignDir);
  migrate(campaignDb);

  const server = new McpServer({
    name: "archclaude-campaign-state",
    version: "0.1.0",
  });

  // Register all tool groups
  registerSessionTools(server, campaignDb);
  registerPCTools(server, campaignDb);
  registerNPCTools(server, campaignDb);
  registerCombatTools(server, campaignDb);
  registerWorldTools(server, campaignDb);
  registerMemoryTools(server, campaignDb);
  registerEventTools(server, campaignDb);
  registerClockTools(server, campaignDb);
  registerInventoryTools(server, campaignDb);
  registerSeedSecretTools(server, campaignDb);
  registerIndexerTools(server, campaignDb);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Cleanup on exit
  process.on("SIGINT", () => {
    campaignDb.close();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});

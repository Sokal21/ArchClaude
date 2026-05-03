import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CampaignDB } from "@archclaude/state";
import { SeedDAL, SecretDAL } from "@archclaude/state";

export function registerSeedSecretTools(server: McpServer, db: CampaignDB) {
  const seedDal = new SeedDAL(db.db);
  const secretDal = new SecretDAL(db.db);

  // ── Seeds (foreshadowing) ──

  server.registerTool(
    "list_planted_seeds",
    { description: "List all planted (untriggered) foreshadowing seeds. The orchestrator checks these on scene changes." },
    async () => {
      const seeds = seedDal.listPlanted();
      return { content: [{ type: "text", text: JSON.stringify(seeds, null, 2) }] };
    },
  );

  server.registerTool(
    "plant_seed",
    {
      description: "Plant a new foreshadowing seed. Will be surfaced when trigger condition is met.",
      inputSchema: {
        text: z.string().describe("The hint to drop in narration"),
        trigger_condition: z.string().optional().describe("When to trigger (e.g. 'party_at:Goldspire', 'session>=5')"),
        visibility: z.enum(["public", "secret"]).optional(),
      },
    },
    async ({ text, trigger_condition, visibility }) => {
      const seed = seedDal.create({ text, trigger_condition, visibility });
      return { content: [{ type: "text", text: `Seed planted (id: ${seed.id}): "${text}"` }] };
    },
  );

  server.registerTool(
    "trigger_seed",
    {
      description: "Mark a seed as triggered. Called when its condition is met.",
      inputSchema: { seed_id: z.number() },
    },
    async ({ seed_id }) => {
      const seed = seedDal.getById(seed_id);
      if (!seed) return { content: [{ type: "text", text: `Seed #${seed_id} not found.` }] };
      seedDal.update(seed_id, { status: "triggered" });
      return { content: [{ type: "text", text: `Seed #${seed_id} triggered: "${seed.text}"` }] };
    },
  );

  // ── Secrets (DM-only) ──

  server.registerTool(
    "list_hidden_secrets",
    { description: "List all hidden secrets. NEVER reveal these in narration output." },
    async () => {
      const secrets = secretDal.listHidden();
      return { content: [{ type: "text", text: JSON.stringify(secrets, null, 2) }] };
    },
  );

  server.registerTool(
    "inject_dm_secret",
    {
      description: "Add a DM secret that must never leak into player-facing narration.",
      inputSchema: {
        topic: z.string().optional(),
        text: z.string(),
      },
    },
    async ({ topic, text }) => {
      const secret = secretDal.create({ topic, text });
      return { content: [{ type: "text", text: `Secret stored (id: ${secret.id}): "${topic ?? "untitled"}"` }] };
    },
  );

  server.registerTool(
    "reveal_secret",
    {
      description: "Partially or fully reveal a previously hidden secret.",
      inputSchema: {
        secret_id: z.number(),
        status: z.enum(["partial_revealed", "revealed"]),
      },
    },
    async ({ secret_id, status }) => {
      const secret = secretDal.getById(secret_id);
      if (!secret) return { content: [{ type: "text", text: `Secret #${secret_id} not found.` }] };
      secretDal.update(secret_id, { status });
      return { content: [{ type: "text", text: `Secret #${secret_id} is now ${status}.` }] };
    },
  );
}

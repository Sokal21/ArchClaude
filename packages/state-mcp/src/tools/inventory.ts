import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CampaignDB } from "@archclaude/state";
import { InventoryDAL, PCDAL } from "@archclaude/state";

export function registerInventoryTools(server: McpServer, db: CampaignDB) {
  const dal = new InventoryDAL(db.db);
  const pcDal = new PCDAL(db.db);

  server.tool(
    "list_inventory",
    "List inventory for a PC or the party.",
    {
      owner: z.string().describe("PC name or 'party'"),
    },
    async ({ owner }) => {
      if (owner === "party") {
        const items = dal.listByOwner("party");
        return { content: [{ type: "text", text: JSON.stringify(items, null, 2) }] };
      }
      const pc = pcDal.getByName(owner);
      if (!pc) return { content: [{ type: "text", text: `PC "${owner}" not found.` }] };
      const items = dal.listByOwner("pc", pc.id);
      return { content: [{ type: "text", text: JSON.stringify(items, null, 2) }] };
    },
  );

  server.tool(
    "add_item",
    "Add an item to a PC or the party inventory.",
    {
      owner: z.string().describe("PC name or 'party'"),
      name: z.string(),
      kind: z.enum(["magic_item", "key_item", "consumable", "currency"]).optional(),
      description: z.string().optional(),
      qty: z.number().optional(),
    },
    async ({ owner, name, kind, description, qty }) => {
      let ownerKind: "pc" | "party" = "party";
      let ownerId: number | undefined;
      if (owner !== "party") {
        const pc = pcDal.getByName(owner);
        if (!pc) return { content: [{ type: "text", text: `PC "${owner}" not found.` }] };
        ownerKind = "pc";
        ownerId = pc.id;
      }
      const item = dal.create({ owner_kind: ownerKind, owner_id: ownerId, name, kind, description, qty });
      return { content: [{ type: "text", text: `Added ${item.qty}x ${item.name} to ${owner}.` }] };
    },
  );

  server.tool(
    "remove_item",
    "Remove an item from inventory by name.",
    {
      owner: z.string().describe("PC name or 'party'"),
      name: z.string(),
    },
    async ({ owner, name }) => {
      const allItems = dal.listAll();
      const item = allItems.find((i) => i.name === name);
      if (!item) return { content: [{ type: "text", text: `Item "${name}" not found.` }] };
      dal.delete(item.id);
      return { content: [{ type: "text", text: `Removed ${name} from ${owner}.` }] };
    },
  );
}

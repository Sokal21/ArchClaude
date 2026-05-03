import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CampaignDB } from "@archclaude/state";
import { PCDAL, PCEquipmentDAL } from "@archclaude/state";

export function registerEquipmentTools(server: McpServer, db: CampaignDB) {
  const pcDal = new PCDAL(db.db);
  const equipDal = new PCEquipmentDAL(db.db);

  server.registerTool(
    "get_attack_options",
    {
      description: "Get all equipped weapons and their attack stats for a PC. Returns to-hit modifier, damage dice, damage type, properties.",
      inputSchema: { name: z.string().describe("PC name") },
    },
    async ({ name }) => {
      const pc = pcDal.getByName(name);
      if (!pc) return { content: [{ type: "text", text: `PC "${name}" not found.` }] };
      const weapons = equipDal.listWeapons(pc.id);
      if (weapons.length === 0) {
        return { content: [{ type: "text", text: `${name} has no equipped weapons. Use equip_weapon to add one.` }] };
      }
      const summary = weapons.map((w) => ({
        id: w.id,
        name: w.name,
        to_hit: `+${w.to_hit}`,
        damage: `${w.damage_dice}+${w.damage_bonus} ${w.damage_type}`,
        properties: w.properties ?? [],
        range: w.range_normal ? `${w.range_normal}/${w.range_long}ft` : "melee",
        magic: w.is_magic,
      }));
      return { content: [{ type: "text", text: JSON.stringify(summary, null, 2) }] };
    },
  );

  server.registerTool(
    "equip_weapon",
    {
      description: "Add a weapon to a PC's equipped weapons with computed modifiers.",
      inputSchema: {
        pc_name: z.string(),
        name: z.string().describe("Weapon name"),
        slug: z.string().optional().describe("SRD weapon slug for reference"),
        to_hit: z.number().describe("Total attack modifier (ability + proficiency + magic)"),
        damage_dice: z.string().describe("Damage dice (e.g. '1d8', '2d6')"),
        damage_bonus: z.number().describe("Damage modifier (ability mod + magic)"),
        damage_type: z.string().describe("slashing, piercing, bludgeoning, etc."),
        properties: z.array(z.string()).optional().describe("e.g. ['versatile:1d10', 'finesse']"),
        range_normal: z.number().optional(),
        range_long: z.number().optional(),
        is_magic: z.boolean().optional(),
        notes: z.string().optional(),
      },
    },
    async ({ pc_name, ...data }) => {
      const pc = pcDal.getByName(pc_name);
      if (!pc) return { content: [{ type: "text", text: `PC "${pc_name}" not found.` }] };
      const weapon = equipDal.addWeapon({ pc_id: pc.id, ...data });
      return { content: [{ type: "text", text: `Equipped ${weapon.name}: +${weapon.to_hit} to hit, ${weapon.damage_dice}+${weapon.damage_bonus} ${weapon.damage_type}` }] };
    },
  );

  server.registerTool(
    "unequip_weapon",
    {
      description: "Remove a weapon from a PC's equipped weapons.",
      inputSchema: { weapon_id: z.number() },
    },
    async ({ weapon_id }) => {
      const ok = equipDal.removeWeapon(weapon_id);
      return { content: [{ type: "text", text: ok ? "Weapon unequipped." : "Weapon not found." }] };
    },
  );

  server.registerTool(
    "get_pc_armor",
    {
      description: "Get equipped armor for a PC.",
      inputSchema: { name: z.string() },
    },
    async ({ name }) => {
      const pc = pcDal.getByName(name);
      if (!pc) return { content: [{ type: "text", text: `PC "${name}" not found.` }] };
      const armor = equipDal.listArmor(pc.id);
      return { content: [{ type: "text", text: JSON.stringify(armor, null, 2) }] };
    },
  );

  server.registerTool(
    "equip_armor",
    {
      description: "Add armor to a PC's equipment.",
      inputSchema: {
        pc_name: z.string(),
        name: z.string(),
        slug: z.string().optional(),
        base_ac: z.number(),
        ac_bonus: z.number().optional().describe("Magic bonus"),
        type: z.enum(["light", "medium", "heavy", "shield"]),
        notes: z.string().optional(),
      },
    },
    async ({ pc_name, ...data }) => {
      const pc = pcDal.getByName(pc_name);
      if (!pc) return { content: [{ type: "text", text: `PC "${pc_name}" not found.` }] };
      const armor = equipDal.addArmor({ pc_id: pc.id, ...data });
      return { content: [{ type: "text", text: `Equipped ${armor.name}: AC ${armor.base_ac}${armor.ac_bonus ? ` +${armor.ac_bonus} magic` : ""} (${armor.type})` }] };
    },
  );

  server.registerTool(
    "set_ability_scores",
    {
      description: "Set a PC's ability scores and proficiency bonus.",
      inputSchema: {
        name: z.string(),
        str: z.number().optional(),
        dex: z.number().optional(),
        con: z.number().optional(),
        int: z.number().optional(),
        wis: z.number().optional(),
        cha: z.number().optional(),
        proficiency_bonus: z.number().optional(),
      },
    },
    async ({ name, ...scores }) => {
      const pc = pcDal.getByName(name);
      if (!pc) return { content: [{ type: "text", text: `PC "${name}" not found.` }] };
      pcDal.update(pc.id, scores);
      return { content: [{ type: "text", text: `${name} ability scores updated.` }] };
    },
  );

  server.registerTool(
    "add_skill_proficiency",
    {
      description: "Add a skill proficiency (or expertise) to a PC.",
      inputSchema: {
        pc_name: z.string(),
        skill: z.string().describe("Skill name (e.g. 'athletics', 'perception')"),
        ability: z.string().describe("Governing ability (e.g. 'str', 'wis')"),
        expertise: z.boolean().optional().describe("True for double proficiency"),
      },
    },
    async ({ pc_name, skill, ability, expertise }) => {
      const pc = pcDal.getByName(pc_name);
      if (!pc) return { content: [{ type: "text", text: `PC "${pc_name}" not found.` }] };
      equipDal.addSkill(pc.id, skill, ability, expertise ? 2 : 1);
      return { content: [{ type: "text", text: `${pc_name}: ${expertise ? "expertise" : "proficiency"} in ${skill}` }] };
    },
  );

  server.registerTool(
    "add_save_proficiency",
    {
      description: "Add a saving throw proficiency to a PC.",
      inputSchema: {
        pc_name: z.string(),
        ability: z.enum(["str", "dex", "con", "int", "wis", "cha"]),
      },
    },
    async ({ pc_name, ability }) => {
      const pc = pcDal.getByName(pc_name);
      if (!pc) return { content: [{ type: "text", text: `PC "${pc_name}" not found.` }] };
      equipDal.addSaveProficiency(pc.id, ability);
      return { content: [{ type: "text", text: `${pc_name}: proficient in ${ability.toUpperCase()} saves` }] };
    },
  );
}

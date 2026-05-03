import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CampaignDB } from "@archclaude/state";
import { PCDAL } from "@archclaude/state";

export function registerPCTools(server: McpServer, db: CampaignDB) {
  const dal = new PCDAL(db.db);

  server.tool(
    "get_pc",
    "Get a player character by name. Returns full combat stats, conditions, spell slots.",
    { name: z.string().describe("PC name") },
    async ({ name }) => {
      const pc = dal.getByName(name);
      if (!pc) {
        return { content: [{ type: "text", text: `PC "${name}" not found.` }] };
      }
      return { content: [{ type: "text", text: JSON.stringify(pc, null, 2) }] };
    },
  );

  server.tool(
    "list_pcs",
    "List all active player characters with their current HP, AC, and conditions.",
    {},
    async () => {
      const pcs = dal.listActive();
      // Return a compact summary for token efficiency
      const summary = pcs.map((pc) => ({
        id: pc.id,
        name: pc.name,
        player: pc.player_name,
        class: pc.class,
        level: pc.level,
        hp: `${pc.current_hp}/${pc.max_hp}`,
        ac: pc.ac,
        conditions: pc.conditions_json ?? [],
      }));
      return { content: [{ type: "text", text: JSON.stringify(summary, null, 2) }] };
    },
  );

  server.tool(
    "apply_damage",
    "Apply damage to a PC. Reduces current_hp (minimum 0). Returns updated PC state.",
    {
      name: z.string().describe("PC name"),
      amount: z.number().positive().describe("Damage amount"),
      damage_type: z.string().optional().describe("Damage type (slashing, fire, etc)"),
    },
    async ({ name, amount, damage_type }) => {
      const pc = dal.getByName(name);
      if (!pc) {
        return { content: [{ type: "text", text: `PC "${name}" not found.` }] };
      }
      // Apply temp HP first
      let remaining = amount;
      let newTempHp = pc.temp_hp;
      if (newTempHp > 0) {
        const absorbed = Math.min(newTempHp, remaining);
        newTempHp -= absorbed;
        remaining -= absorbed;
      }
      const newHp = Math.max(0, pc.current_hp - remaining);
      const updated = dal.update(pc.id, { current_hp: newHp, temp_hp: newTempHp });
      const dmgInfo = damage_type ? `${amount} ${damage_type} damage` : `${amount} damage`;
      return {
        content: [{
          type: "text",
          text: `${name} takes ${dmgInfo}. HP: ${updated.current_hp}/${updated.max_hp}${newTempHp !== pc.temp_hp ? ` (${pc.temp_hp - newTempHp} absorbed by temp HP)` : ""}`,
        }],
      };
    },
  );

  server.tool(
    "apply_healing",
    "Heal a PC. Increases current_hp (capped at max_hp). Returns updated PC state.",
    {
      name: z.string().describe("PC name"),
      amount: z.number().positive().describe("Healing amount"),
    },
    async ({ name, amount }) => {
      const pc = dal.getByName(name);
      if (!pc) {
        return { content: [{ type: "text", text: `PC "${name}" not found.` }] };
      }
      const newHp = Math.min(pc.max_hp, pc.current_hp + amount);
      const updated = dal.update(pc.id, { current_hp: newHp });
      return {
        content: [{
          type: "text",
          text: `${name} healed for ${amount}. HP: ${updated.current_hp}/${updated.max_hp}`,
        }],
      };
    },
  );

  server.tool(
    "apply_condition",
    "Apply a condition to a PC (e.g. 'poisoned:2' for 2 turns, or 'prone').",
    {
      name: z.string().describe("PC name"),
      condition: z.string().describe("Condition string (e.g. 'poisoned:2', 'prone')"),
    },
    async ({ name, condition }) => {
      const pc = dal.getByName(name);
      if (!pc) {
        return { content: [{ type: "text", text: `PC "${name}" not found.` }] };
      }
      const conditions = [...(pc.conditions_json ?? [])];
      // Replace existing condition of same type
      const condName = condition.split(":")[0];
      const filtered = conditions.filter((c) => c.split(":")[0] !== condName);
      filtered.push(condition);
      const updated = dal.update(pc.id, { conditions_json: filtered });
      return {
        content: [{
          type: "text",
          text: `${name} is now ${condition}. Conditions: ${JSON.stringify(updated.conditions_json)}`,
        }],
      };
    },
  );

  server.tool(
    "remove_condition",
    "Remove a condition from a PC.",
    {
      name: z.string().describe("PC name"),
      condition: z.string().describe("Condition name to remove (e.g. 'poisoned', 'prone')"),
    },
    async ({ name, condition }) => {
      const pc = dal.getByName(name);
      if (!pc) {
        return { content: [{ type: "text", text: `PC "${name}" not found.` }] };
      }
      const conditions = (pc.conditions_json ?? []).filter(
        (c) => c.split(":")[0] !== condition,
      );
      const updated = dal.update(pc.id, { conditions_json: conditions });
      return {
        content: [{
          type: "text",
          text: `Removed ${condition} from ${name}. Conditions: ${JSON.stringify(updated.conditions_json)}`,
        }],
      };
    },
  );

  server.tool(
    "update_spell_slots",
    "Update a PC's spell slot usage. Provide the current slots remaining.",
    {
      name: z.string().describe("PC name"),
      current: z.record(z.string(), z.number()).describe("Current spell slots remaining, e.g. {'1': 2, '2': 1}"),
    },
    async ({ name, current }) => {
      const pc = dal.getByName(name);
      if (!pc) {
        return { content: [{ type: "text", text: `PC "${name}" not found.` }] };
      }
      const slots = pc.spell_slots_json ?? { max: {}, current: {} };
      slots.current = current;
      const updated = dal.update(pc.id, { spell_slots_json: slots });
      return {
        content: [{
          type: "text",
          text: `${name} spell slots updated: ${JSON.stringify(updated.spell_slots_json)}`,
        }],
      };
    },
  );

  // ── Death saves ──

  server.tool(
    "record_death_save",
    "Record a death saving throw for a PC at 0 HP. 3 successes = stabilize, 3 failures = death.",
    {
      name: z.string().describe("PC name"),
      success: z.boolean().describe("true = success, false = failure"),
    },
    async ({ name, success }) => {
      const pc = dal.getByName(name);
      if (!pc) return { content: [{ type: "text", text: `PC "${name}" not found.` }] };
      const updated = dal.recordDeathSave(pc.id, success);
      const s = updated.death_save_successes;
      const f = updated.death_save_failures;
      let status = `${name} death saves: ${s} success, ${f} failure`;
      if (s >= 3) status += " — STABILIZED!";
      if (f >= 3) status += " — DEAD.";
      return { content: [{ type: "text", text: status }] };
    },
  );

  server.tool(
    "reset_death_saves",
    "Reset a PC's death save counters (after stabilizing, healing, or long rest).",
    { name: z.string() },
    async ({ name }) => {
      const pc = dal.getByName(name);
      if (!pc) return { content: [{ type: "text", text: `PC "${name}" not found.` }] };
      dal.resetDeathSaves(pc.id);
      return { content: [{ type: "text", text: `${name} death saves reset.` }] };
    },
  );

  // ── Rest ──

  server.tool(
    "long_rest",
    "Apply long rest to a PC: restore HP to max, reset spell slots, clear conditions, reset death saves.",
    { name: z.string() },
    async ({ name }) => {
      const pc = dal.getByName(name);
      if (!pc) return { content: [{ type: "text", text: `PC "${name}" not found.` }] };
      const updated = dal.longRest(pc.id);
      return {
        content: [{
          type: "text",
          text: `${name} long rest complete. HP: ${updated.current_hp}/${updated.max_hp}. Spell slots restored. Conditions cleared.`,
        }],
      };
    },
  );

  server.tool(
    "short_rest",
    "Apply short rest to a PC: heal using hit dice.",
    {
      name: z.string(),
      hit_dice_healing: z.number().describe("Total HP restored from hit dice rolls"),
    },
    async ({ name, hit_dice_healing }) => {
      const pc = dal.getByName(name);
      if (!pc) return { content: [{ type: "text", text: `PC "${name}" not found.` }] };
      const updated = dal.shortRest(pc.id, hit_dice_healing);
      return {
        content: [{
          type: "text",
          text: `${name} short rest: healed ${hit_dice_healing} HP. Now at ${updated.current_hp}/${updated.max_hp}.`,
        }],
      };
    },
  );

  // ── Condition tick ──

  server.tool(
    "tick_conditions",
    "Decrement duration-based conditions by 1 round for a PC. Removes expired conditions. Call at the start of each round.",
    { name: z.string() },
    async ({ name }) => {
      const pc = dal.getByName(name);
      if (!pc) return { content: [{ type: "text", text: `PC "${name}" not found.` }] };
      const result = dal.tickConditions(pc.id);
      let text = `${name} conditions ticked.`;
      if (result.removed.length > 0) text += ` Expired: ${result.removed.join(", ")}.`;
      if (result.remaining.length > 0) text += ` Active: ${result.remaining.join(", ")}.`;
      else text += " No active conditions.";
      return { content: [{ type: "text", text }] };
    },
  );

  // ── Concentration ──

  server.tool(
    "set_concentration",
    "Set or clear what a PC is concentrating on.",
    {
      name: z.string(),
      spell: z.string().nullable().describe("Spell name, or null to clear concentration"),
    },
    async ({ name, spell }) => {
      const pc = dal.getByName(name);
      if (!pc) return { content: [{ type: "text", text: `PC "${name}" not found.` }] };
      dal.update(pc.id, { concentrating_on: spell });
      return {
        content: [{
          type: "text",
          text: spell ? `${name} is concentrating on ${spell}.` : `${name} concentration cleared.`,
        }],
      };
    },
  );
}

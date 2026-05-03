import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CampaignDB } from "@archclaude/state";
import {
  PCDAL, PCEquipmentDAL,
  resolveAttack, resolveDamage, resolveSave, resolveCheck,
  parseConditions, getAbilityMod,
  CONDITION_EFFECTS, SKILL_ABILITIES,
} from "@archclaude/state";
import type { AbilityName } from "@archclaude/shared";

export function registerRulesTools(server: McpServer, db: CampaignDB) {
  const pcDal = new PCDAL(db.db);
  const equipDal = new PCEquipmentDAL(db.db);

  server.registerTool(
    "resolve_attack",
    {
      description: "Resolve a PC's attack roll. Player provides the d20 result; this tool adds modifiers, checks conditions, and determines hit/miss/crit.",
      inputSchema: {
        attacker_name: z.string().describe("PC name"),
        weapon_id: z.number().describe("Weapon ID from get_attack_options"),
        d20_roll: z.number().min(1).max(20).describe("The player's d20 roll (raw, no modifiers)"),
        target_ac: z.number().describe("Target's armor class"),
        target_conditions: z.array(z.string()).optional().describe("Target's active conditions"),
        advantage: z.boolean().optional(),
        disadvantage: z.boolean().optional(),
      },
    },
    async ({ attacker_name, weapon_id, d20_roll, target_ac, target_conditions, advantage, disadvantage }) => {
      const pc = pcDal.getByName(attacker_name);
      if (!pc) return { content: [{ type: "text", text: `PC "${attacker_name}" not found.` }] };

      const weapons = equipDal.listWeapons(pc.id);
      const weapon = weapons.find((w) => w.id === weapon_id);
      if (!weapon) return { content: [{ type: "text", text: `Weapon #${weapon_id} not found.` }] };

      const attackerConditions = parseConditions(pc.conditions_json);
      const tgtConditions = (target_conditions ?? []).map((c) => c.split(":")[0].toLowerCase());

      const result = resolveAttack({
        d20_roll,
        to_hit_modifier: weapon.to_hit,
        target_ac,
        attacker_conditions: attackerConditions,
        target_conditions: tgtConditions,
        has_advantage: advantage,
        has_disadvantage: disadvantage,
      });

      const lines = [
        `**${attacker_name}** attacks with **${weapon.name}**`,
        `Roll: ${result.roll} + ${result.modifier} = **${result.total}** vs AC ${result.target_ac}`,
      ];
      if (result.critical) lines.push("**CRITICAL HIT!**");
      if (result.critical_miss) lines.push("**Critical miss!**");
      if (!result.critical && !result.critical_miss) lines.push(result.hit ? "**HIT!**" : "**Miss.**");
      if (result.notes.length > 0) lines.push(`Notes: ${result.notes.join("; ")}`);
      if (result.hit) {
        lines.push(`→ Ask player to roll damage: ${weapon.damage_dice}+${weapon.damage_bonus} ${weapon.damage_type}${result.critical ? " (double dice for crit)" : ""}`);
      }

      return { content: [{ type: "text", text: lines.join("\n") }] };
    },
  );

  server.registerTool(
    "resolve_damage",
    {
      description: "Resolve damage after a hit. Player provides the damage roll; this tool adds modifiers and applies resistance/vulnerability.",
      inputSchema: {
        damage_roll: z.number().describe("Player's damage dice total (raw roll, no modifiers)"),
        damage_bonus: z.number().describe("Damage modifier to add"),
        damage_type: z.string(),
        is_critical: z.boolean().optional(),
        target_name: z.string().describe("Target PC or combatant name — used to check resistances"),
      },
    },
    async ({ damage_roll, damage_bonus, damage_type, is_critical, target_name }) => {
      // Try to find target as PC for resistance info
      const pc = pcDal.getByName(target_name);
      const resistances = pc?.resistances_json ?? [];
      const immunities = pc?.immunities_json ?? [];

      const result = resolveDamage({
        damage_roll,
        damage_bonus,
        damage_type,
        is_critical: is_critical ?? false,
        target_resistances: resistances,
        target_immunities: immunities,
      });

      const lines = [
        `Damage: ${result.base_damage} + ${result.modifier} = ${result.total_before_resistance} ${damage_type}`,
      ];
      if (result.resistance_applied) {
        lines.push(`${result.resistance_applied}: → **${result.final_damage} damage**`);
      } else {
        lines.push(`→ **${result.final_damage} damage**`);
      }
      if (result.notes.length > 0) lines.push(result.notes.join("; "));

      return { content: [{ type: "text", text: lines.join("\n") }] };
    },
  );

  server.registerTool(
    "resolve_save",
    {
      description: "Resolve a saving throw. Player provides the d20 roll; this tool adds the save modifier and checks against the DC.",
      inputSchema: {
        pc_name: z.string(),
        ability: z.enum(["str", "dex", "con", "int", "wis", "cha"]),
        d20_roll: z.number().min(1).max(20),
        dc: z.number().describe("Difficulty class to beat"),
      },
    },
    async ({ pc_name, ability, d20_roll, dc }) => {
      const pc = pcDal.getByName(pc_name);
      if (!pc) return { content: [{ type: "text", text: `PC "${pc_name}" not found.` }] };

      const profSaves = equipDal.listSaveProficiencies(pc.id);
      const conditions = parseConditions(pc.conditions_json);

      const result = resolveSave({
        d20_roll,
        ability: ability as AbilityName,
        pc,
        proficient_saves: profSaves,
        dc,
        active_conditions: conditions,
      });

      const lines = [
        `**${pc_name}** ${ability.toUpperCase()} save vs DC ${dc}`,
        `Roll: ${result.roll} + ${result.modifier} = **${result.total}**`,
      ];
      if (result.auto_fail) {
        lines.push("**AUTO-FAIL** (condition effect)");
      } else {
        lines.push(result.success ? "**SUCCESS!**" : "**FAILURE.**");
      }
      if (result.notes.length > 0) lines.push(result.notes.join("; "));

      return { content: [{ type: "text", text: lines.join("\n") }] };
    },
  );

  server.registerTool(
    "resolve_check",
    {
      description: "Resolve a skill or ability check. Player provides the d20 roll; this tool adds the skill modifier.",
      inputSchema: {
        pc_name: z.string(),
        skill: z.string().describe("Skill name (e.g. 'perception', 'athletics') or ability name for raw checks"),
        d20_roll: z.number().min(1).max(20),
      },
    },
    async ({ pc_name, skill, d20_roll }) => {
      const pc = pcDal.getByName(pc_name);
      if (!pc) return { content: [{ type: "text", text: `PC "${pc_name}" not found.` }] };

      const profSkills = equipDal.listSkills(pc.id);
      const conditions = parseConditions(pc.conditions_json);

      const result = resolveCheck({
        d20_roll,
        skill,
        pc,
        proficient_skills: profSkills,
        active_conditions: conditions,
      });

      const ability = SKILL_ABILITIES[skill.toLowerCase()] ?? skill;
      const lines = [
        `**${pc_name}** ${skill} check (${ability.toUpperCase()})`,
        `Roll: ${result.roll} + ${result.ability_mod} (ability)${result.proficiency > 0 ? ` + ${result.proficiency} (prof)` : ""} = **${result.total}**`,
      ];
      if (result.notes.length > 0) lines.push(result.notes.join("; "));

      return { content: [{ type: "text", text: lines.join("\n") }] };
    },
  );

  server.registerTool(
    "get_condition_effects",
    {
      description: "Get the mechanical effects of one or more conditions. Returns what modifiers they apply to attacks, saves, movement, etc.",
      inputSchema: {
        conditions: z.array(z.string()).describe("Condition names (e.g. ['poisoned', 'prone'])"),
      },
    },
    async ({ conditions }) => {
      const results = conditions.map((name) => {
        const key = name.split(":")[0].toLowerCase();
        const effects = CONDITION_EFFECTS[key];
        if (!effects) return { condition: name, known: false, description: "Unknown condition" };
        return {
          condition: name,
          known: true,
          ...effects,
        };
      });
      return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
    },
  );

  server.registerTool(
    "get_pc_modifiers",
    {
      description: "Get a PC's ability modifiers, save bonuses, and skill bonuses — a complete modifier reference sheet.",
      inputSchema: { name: z.string() },
    },
    async ({ name }) => {
      const pc = pcDal.getByName(name);
      if (!pc) return { content: [{ type: "text", text: `PC "${name}" not found.` }] };

      const profSaves = equipDal.listSaveProficiencies(pc.id);
      const skills = equipDal.listSkills(pc.id);
      const weapons = equipDal.listWeapons(pc.id);

      const abilities = (["str", "dex", "con", "int", "wis", "cha"] as AbilityName[]).map((a) => ({
        ability: a.toUpperCase(),
        score: pc[a],
        modifier: getAbilityMod(pc, a),
        save: getAbilityMod(pc, a) + (profSaves.includes(a) ? pc.proficiency_bonus : 0),
        save_proficient: profSaves.includes(a),
      }));

      const skillMods = skills.map((s) => {
        const ability = s.ability as AbilityName;
        const mod = getAbilityMod(pc, ability) + pc.proficiency_bonus * s.proficient;
        return { skill: s.skill, modifier: `+${mod}`, expertise: s.proficient === 2 };
      });

      const attackOptions = weapons.map((w) => ({
        weapon: w.name,
        to_hit: `+${w.to_hit}`,
        damage: `${w.damage_dice}+${w.damage_bonus} ${w.damage_type}`,
      }));

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            name: pc.name,
            level: pc.level,
            proficiency_bonus: `+${pc.proficiency_bonus}`,
            hp: `${pc.current_hp}/${pc.max_hp}`,
            ac: pc.ac,
            abilities,
            skills: skillMods,
            attacks: attackOptions,
            conditions: pc.conditions_json ?? [],
            concentrating_on: pc.concentrating_on,
          }, null, 2),
        }],
      };
    },
  );
}

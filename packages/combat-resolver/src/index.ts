#!/usr/bin/env node

/**
 * Combat Resolver Service
 *
 * Lightweight HTTP API that the Player UI calls directly for structured
 * combat actions. Bypasses Claude entirely for standard attacks/spells —
 * loads PC data, runs the rules calculator, applies state changes, and
 * broadcasts results to the WebSocket bus for the TV display + AI DM.
 *
 * Endpoints:
 *   GET  /api/combat/state      — current combat state + PC weapons
 *   GET  /api/pc/:name          — PC stats + modifiers + weapons
 *   POST /api/attack            — resolve a weapon attack
 *   POST /api/spell             — resolve a spell cast
 *   POST /api/save              — resolve a saving throw
 *   POST /api/check             — resolve a skill check
 *   POST /api/action/free       — free-text action (queued for AI)
 *
 * Usage:
 *   combat-resolver --campaign ./my-campaign [--port 3500] [--ws-port 3100]
 */

import { createServer } from "node:http";
import { resolve } from "node:path";
import { WebSocket } from "ws";
import {
  CampaignDB, migrate,
  PCDAL, CombatDAL, PCEquipmentDAL, ActionQueueDAL, EventDAL,
  resolveAttack, resolveDamage, resolveSave, resolveCheck,
  parseConditions, getAbilityMod,
  CONDITION_EFFECTS, SKILL_ABILITIES,
} from "@archclaude/state";
import type { AbilityName } from "@archclaude/shared";

function getArgs() {
  const args = process.argv.slice(2);
  let campaignDir = "";
  let port = 3500;
  let wsPort = 3100;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--campaign" && args[i + 1]) campaignDir = resolve(args[i + 1]);
    if (args[i] === "--port" && args[i + 1]) port = parseInt(args[i + 1], 10);
    if (args[i] === "--ws-port" && args[i + 1]) wsPort = parseInt(args[i + 1], 10);
  }
  if (process.env.CAMPAIGN_DIR) campaignDir = resolve(process.env.CAMPAIGN_DIR);
  if (!campaignDir) {
    console.error("Usage: combat-resolver --campaign <path>");
    process.exit(1);
  }
  return { campaignDir, port, wsPort };
}

async function main() {
  const { campaignDir, port, wsPort } = getArgs();

  const db = new CampaignDB(campaignDir);
  migrate(db);

  const pcDal = new PCDAL(db.db);
  const combatDal = new CombatDAL(db.db);
  const equipDal = new PCEquipmentDAL(db.db);
  const queueDal = new ActionQueueDAL(db.db);
  const eventDal = new EventDAL(db.db);

  // Connect to map WebSocket to broadcast results
  let mapWs: WebSocket | null = null;
  function connectWs() {
    mapWs = new WebSocket(`ws://localhost:${wsPort}`);
    mapWs.on("close", () => setTimeout(connectWs, 3000));
    mapWs.on("error", () => mapWs?.close());
  }
  connectWs();

  function broadcast(type: string, payload: Record<string, unknown>) {
    if (mapWs?.readyState === WebSocket.OPEN) {
      mapWs.send(JSON.stringify({ type, timestamp: new Date().toISOString(), payload }));
    }
  }

  // HTTP server
  const server = createServer(async (req, res) => {
    // CORS
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }

    const url = new URL(req.url!, `http://localhost:${port}`);
    const path = url.pathname;

    try {
      // Parse JSON body for POST
      let body: Record<string, unknown> = {};
      if (req.method === "POST") {
        const chunks: Buffer[] = [];
        for await (const chunk of req) chunks.push(chunk as Buffer);
        body = JSON.parse(Buffer.concat(chunks).toString());
      }

      const json = (data: unknown) => {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(data));
      };

      // ── GET /api/combat/state ──
      if (path === "/api/combat/state" && req.method === "GET") {
        const combat = combatDal.getActive();
        if (!combat) return json({ active: false });

        const pcs = pcDal.listActive().map((pc) => {
          const weapons = equipDal.listWeapons(pc.id);
          return {
            id: pc.id, name: pc.name, class: pc.class, level: pc.level,
            hp: pc.current_hp, max_hp: pc.max_hp, ac: pc.ac,
            conditions: pc.conditions_json ?? [],
            concentrating_on: pc.concentrating_on,
            weapons: weapons.map((w) => ({
              id: w.id, name: w.name, to_hit: w.to_hit,
              damage_dice: w.damage_dice, damage_bonus: w.damage_bonus,
              damage_type: w.damage_type, properties: w.properties,
              range_normal: w.range_normal, range_long: w.range_long,
            })),
          };
        });

        const instances = combatDal.listInstances(combat.id).map((inst) => ({
          id: inst.id, name: inst.display_name, hp: inst.current_hp,
          max_hp: inst.max_hp, ac: inst.ac, defeated: inst.defeated,
          conditions: inst.conditions_json ?? [],
        }));

        return json({
          active: true,
          combat_id: combat.id,
          round: combat.round_number,
          current_turn: combat.current_turn,
          initiative: combat.initiative_json,
          intensity: combat.intensity,
          pcs,
          enemies: instances.filter((i) => !i.defeated),
        });
      }

      // ── GET /api/pc/:name ──
      if (path.startsWith("/api/pc/") && req.method === "GET") {
        const name = decodeURIComponent(path.slice(8));
        const pc = pcDal.getByName(name);
        if (!pc) return json({ error: "PC not found" });

        const weapons = equipDal.listWeapons(pc.id);
        const skills = equipDal.listSkills(pc.id);
        const saves = equipDal.listSaveProficiencies(pc.id);

        const abilities = (["str", "dex", "con", "int", "wis", "cha"] as AbilityName[]).map((a) => ({
          name: a, score: pc[a], mod: getAbilityMod(pc, a),
          save: getAbilityMod(pc, a) + (saves.includes(a) ? pc.proficiency_bonus : 0),
          save_prof: saves.includes(a),
        }));

        return json({
          ...pc,
          abilities,
          weapons: weapons.map((w) => ({
            id: w.id, name: w.name, to_hit: w.to_hit,
            damage: `${w.damage_dice}+${w.damage_bonus}`, damage_type: w.damage_type,
            properties: w.properties,
          })),
          skills: skills.map((s) => ({
            skill: s.skill, ability: s.ability,
            mod: getAbilityMod(pc, s.ability as AbilityName) + pc.proficiency_bonus * s.proficient,
            expertise: s.proficient === 2,
          })),
          save_proficiencies: saves,
        });
      }

      // ── POST /api/attack ──
      if (path === "/api/attack" && req.method === "POST") {
        const { pc_name, weapon_id, d20_roll, target_id, target_type, advantage, disadvantage } = body as {
          pc_name: string; weapon_id: number; d20_roll: number;
          target_id: number; target_type: "npc_instance" | "pc";
          advantage?: boolean; disadvantage?: boolean;
        };

        const pc = pcDal.getByName(pc_name as string);
        if (!pc) return json({ error: "PC not found" });

        const weapons = equipDal.listWeapons(pc.id);
        const weapon = weapons.find((w) => w.id === weapon_id);
        if (!weapon) return json({ error: "Weapon not found" });

        // Get target AC and conditions
        let targetAc: number;
        let targetConditions: string[] = [];
        if (target_type === "npc_instance") {
          const inst = combatDal.getInstance(target_id);
          if (!inst) return json({ error: "Target not found" });
          targetAc = inst.ac;
          targetConditions = parseConditions(inst.conditions_json);
        } else {
          const targetPc = pcDal.getById(target_id);
          if (!targetPc) return json({ error: "Target PC not found" });
          targetAc = targetPc.ac;
          targetConditions = parseConditions(targetPc.conditions_json);
        }

        const attackerConditions = parseConditions(pc.conditions_json);

        const attackResult = resolveAttack({
          d20_roll: d20_roll as number,
          to_hit_modifier: weapon.to_hit,
          target_ac: targetAc,
          attacker_conditions: attackerConditions,
          target_conditions: targetConditions,
          has_advantage: advantage as boolean,
          has_disadvantage: disadvantage as boolean,
        });

        const result: Record<string, unknown> = {
          attack: attackResult,
          weapon: { name: weapon.name, damage_dice: weapon.damage_dice, damage_bonus: weapon.damage_bonus, damage_type: weapon.damage_type },
          needs_damage_roll: attackResult.hit,
        };

        // Broadcast attack result to TV + AI
        broadcast("combat_action_resolved", {
          type: "attack",
          attacker: pc_name,
          weapon: weapon.name,
          result: attackResult,
        });

        return json(result);
      }

      // ── POST /api/damage ──
      if (path === "/api/damage" && req.method === "POST") {
        const { damage_roll, damage_bonus, damage_type, is_critical, target_id, target_type } = body as {
          damage_roll: number; damage_bonus: number; damage_type: string;
          is_critical?: boolean; target_id: number; target_type: "npc_instance" | "pc";
        };

        let resistances: string[] = [];
        let immunities: string[] = [];
        if (target_type === "pc") {
          const targetPc = pcDal.getById(target_id);
          resistances = targetPc?.resistances_json ?? [];
          immunities = targetPc?.immunities_json ?? [];
        }

        const dmgResult = resolveDamage({
          damage_roll: damage_roll as number,
          damage_bonus: damage_bonus as number,
          damage_type: damage_type as string,
          is_critical: is_critical ?? false,
          target_resistances: resistances,
          target_immunities: immunities,
        });

        // Apply damage to target
        if (target_type === "npc_instance") {
          const inst = combatDal.getInstance(target_id);
          if (inst) {
            const newHp = Math.max(0, inst.current_hp - dmgResult.final_damage);
            combatDal.updateInstance(target_id, { current_hp: newHp, defeated: newHp === 0 });
          }
        } else {
          const targetPc = pcDal.getById(target_id);
          if (targetPc) {
            const newHp = Math.max(0, targetPc.current_hp - dmgResult.final_damage);
            pcDal.update(target_id, { current_hp: newHp });
          }
        }

        broadcast("combat_action_resolved", {
          type: "damage",
          target_id,
          target_type,
          damage: dmgResult,
        });

        return json({ damage: dmgResult });
      }

      // ── POST /api/save ──
      if (path === "/api/save" && req.method === "POST") {
        const { pc_name, ability, d20_roll, dc } = body as {
          pc_name: string; ability: string; d20_roll: number; dc: number;
        };

        const pc = pcDal.getByName(pc_name as string);
        if (!pc) return json({ error: "PC not found" });

        const profSaves = equipDal.listSaveProficiencies(pc.id);
        const conditions = parseConditions(pc.conditions_json);

        const result = resolveSave({
          d20_roll: d20_roll as number,
          ability: ability as AbilityName,
          pc,
          proficient_saves: profSaves,
          dc: dc as number,
          active_conditions: conditions,
        });

        broadcast("combat_action_resolved", {
          type: "save",
          pc: pc_name,
          ability,
          result,
        });

        return json({ save: result });
      }

      // ── POST /api/check ──
      if (path === "/api/check" && req.method === "POST") {
        const { pc_name, skill, d20_roll } = body as {
          pc_name: string; skill: string; d20_roll: number;
        };

        const pc = pcDal.getByName(pc_name as string);
        if (!pc) return json({ error: "PC not found" });

        const profSkills = equipDal.listSkills(pc.id);
        const conditions = parseConditions(pc.conditions_json);

        const result = resolveCheck({
          d20_roll: d20_roll as number,
          skill: skill as string,
          pc,
          proficient_skills: profSkills,
          active_conditions: conditions,
        });

        broadcast("combat_action_resolved", { type: "check", pc: pc_name, skill, result });
        return json({ check: result });
      }

      // ── POST /api/action/free ──
      if (path === "/api/action/free" && req.method === "POST") {
        const { pc_name, description } = body as { pc_name: string; description: string };
        queueDal.enqueue({
          player_id: pc_name as string,
          action_type: "creative",
          payload: { description },
        });
        broadcast("player_action_submitted", {
          type: "creative",
          pc: pc_name,
          description,
        });
        return json({ queued: true, message: "Creative action queued for AI DM." });
      }

      // ── GET /api/conditions ──
      if (path === "/api/conditions" && req.method === "GET") {
        return json(CONDITION_EFFECTS);
      }

      // ── GET /api/skills ──
      if (path === "/api/skills" && req.method === "GET") {
        return json(SKILL_ABILITIES);
      }

      // 404
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Not found" }));
    } catch (err) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: (err as Error).message }));
    }
  });

  server.listen(port, () => {
    console.log(`Combat Resolver API: http://localhost:${port}`);
    console.log(`Campaign: ${campaignDir}`);
  });

  process.on("SIGINT", () => {
    db.close();
    mapWs?.close();
    server.close();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});

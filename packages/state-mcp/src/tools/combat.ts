import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CampaignDB } from "@archclaude/state";
import { CombatDAL, SessionDAL, PCDAL, EventDAL } from "@archclaude/state";
import { EVENT_TYPES } from "@archclaude/shared";
import type { InitiativeEntry, CombatIntensity } from "@archclaude/shared";

export function registerCombatTools(server: McpServer, db: CampaignDB) {
  const combatDal = new CombatDAL(db.db);
  const sessionDal = new SessionDAL(db.db);
  const pcDal = new PCDAL(db.db);
  const eventDal = new EventDAL(db.db);

  server.tool(
    "start_combat",
    "Start a new combat encounter. Creates a combat record and returns its ID. Call set_initiative next.",
    {
      intensity: z.enum(["terse", "normal", "tense", "climax"]).optional()
        .describe("Narration verbosity: terse (quick), normal, tense (dramatic), climax (boss fight)"),
      difficulty: z.enum(["easy", "medium", "hard", "deadly"]).optional(),
      narrative_context: z.string().optional().describe("What led to this fight"),
    },
    async ({ intensity, difficulty, narrative_context }) => {
      const sessions = sessionDal.list();
      const currentSession = sessions[sessions.length - 1];
      if (!currentSession) {
        return { content: [{ type: "text", text: "No active session. Call start_session first." }] };
      }

      const combat = combatDal.createCombat({
        session_id: currentSession.id,
        intensity: intensity as CombatIntensity,
        difficulty,
        narrative_context,
      });

      eventDal.append({
        session_id: currentSession.id,
        source: "orchestrator",
        type: EVENT_TYPES.COMBAT_STARTED,
        payload: { combat_id: combat.id },
      });

      return {
        content: [{
          type: "text",
          text: `Combat #${combat.id} started (${combat.intensity}, ${combat.difficulty ?? "unrated"}).\nContext: ${narrative_context ?? "none"}\n\nNext: add monsters with add_combatant, then set_initiative.`,
        }],
      };
    },
  );

  server.tool(
    "add_combatant",
    "Add a monster/NPC to the active combat. Returns the instance ID for initiative tracking.",
    {
      display_name: z.string().describe("Display name (e.g. 'Goblin 1', 'Mordax the Cruel')"),
      max_hp: z.number().positive(),
      ac: z.number().positive(),
      template_key: z.string().optional().describe("SRD key like 'srd:goblin' or 'homebrew:bbeg_v2'"),
      npc_id: z.number().optional().describe("Link to a recurring NPC if applicable"),
    },
    async ({ display_name, max_hp, ac, template_key, npc_id }) => {
      const combat = combatDal.getActive();
      if (!combat) {
        return { content: [{ type: "text", text: "No active combat. Call start_combat first." }] };
      }

      const instance = combatDal.createInstance({
        combat_id: combat.id,
        display_name,
        max_hp,
        current_hp: max_hp,
        ac,
        template_key,
        npc_id,
      });

      return {
        content: [{
          type: "text",
          text: `Added ${display_name} (HP: ${max_hp}, AC: ${ac}, ID: ${instance.id})`,
        }],
      };
    },
  );

  server.tool(
    "set_initiative",
    "Set the initiative order for the current combat. Provide an ordered list of combatants.",
    {
      order: z.array(z.object({
        actor_kind: z.enum(["pc", "npc_instance"]),
        actor_id: z.number(),
        init: z.number().describe("Initiative roll result"),
      })).describe("Initiative order, highest first"),
    },
    async ({ order }) => {
      const combat = combatDal.getActive();
      if (!combat) {
        return { content: [{ type: "text", text: "No active combat." }] };
      }

      // Sort by initiative (highest first)
      const sorted = [...order].sort((a, b) => b.init - a.init) as InitiativeEntry[];
      combatDal.updateCombat(combat.id, { initiative_json: sorted, current_turn: 0 });

      // Build a readable initiative list
      const lines = sorted.map((entry, i) => {
        const prefix = i === 0 ? ">>>" : "   ";
        if (entry.actor_kind === "pc") {
          const pc = pcDal.getById(entry.actor_id);
          return `${prefix} ${entry.init}: ${pc?.name ?? `PC#${entry.actor_id}`}`;
        } else {
          const inst = combatDal.getInstance(entry.actor_id);
          return `${prefix} ${entry.init}: ${inst?.display_name ?? `NPC#${entry.actor_id}`}`;
        }
      });

      return {
        content: [{
          type: "text",
          text: `Initiative set (Round 1):\n${lines.join("\n")}`,
        }],
      };
    },
  );

  server.tool(
    "get_combat_state",
    "Get the full state of the active combat: initiative order, round, current turn, all combatants with HP/conditions.",
    {},
    async () => {
      const combat = combatDal.getActive();
      if (!combat) {
        return { content: [{ type: "text", text: "No active combat." }] };
      }

      const instances = combatDal.listInstances(combat.id);
      const pcs = pcDal.listActive();

      const combatantSummary = [
        ...pcs.map((pc) => ({
          kind: "pc" as const,
          id: pc.id,
          name: pc.name,
          hp: `${pc.current_hp}/${pc.max_hp}`,
          ac: pc.ac,
          conditions: pc.conditions_json ?? [],
        })),
        ...instances.map((inst) => ({
          kind: "npc_instance" as const,
          id: inst.id,
          name: inst.display_name,
          hp: `${inst.current_hp}/${inst.max_hp}`,
          ac: inst.ac,
          conditions: inst.conditions_json ?? [],
          defeated: inst.defeated,
        })),
      ];

      return {
        content: [{
          type: "text",
          text: JSON.stringify({
            combat_id: combat.id,
            round: combat.round_number,
            current_turn: combat.current_turn,
            intensity: combat.intensity,
            initiative: combat.initiative_json,
            combatants: combatantSummary,
          }, null, 2),
        }],
      };
    },
  );

  server.tool(
    "advance_turn",
    "Advance to the next turn in initiative order. Wraps to round+1 when the order cycles.",
    {},
    async () => {
      const combat = combatDal.getActive();
      if (!combat || !combat.initiative_json) {
        return { content: [{ type: "text", text: "No active combat or initiative not set." }] };
      }

      const order = combat.initiative_json;
      let nextTurn = combat.current_turn + 1;
      let round = combat.round_number;

      if (nextTurn >= order.length) {
        nextTurn = 0;
        round += 1;
      }

      combatDal.updateCombat(combat.id, { current_turn: nextTurn, round_number: round });
      const current = order[nextTurn];

      let actorName: string;
      if (current.actor_kind === "pc") {
        const pc = pcDal.getById(current.actor_id);
        actorName = pc?.name ?? `PC#${current.actor_id}`;
      } else {
        const inst = combatDal.getInstance(current.actor_id);
        actorName = inst?.display_name ?? `NPC#${current.actor_id}`;
      }

      const sessions = sessionDal.list();
      const sessionId = sessions[sessions.length - 1]?.id;
      eventDal.append({
        session_id: sessionId,
        source: "combat",
        type: EVENT_TYPES.TURN_STARTED,
        payload: { combat_id: combat.id, actor_kind: current.actor_kind, actor_id: current.actor_id },
      });

      return {
        content: [{
          type: "text",
          text: `Round ${round}, Turn: ${actorName} (${current.actor_kind} #${current.actor_id}, init ${current.init})`,
        }],
      };
    },
  );

  server.tool(
    "damage_combatant",
    "Apply damage to a monster/NPC instance in combat. Marks as defeated at 0 HP.",
    {
      instance_id: z.number().describe("NPC instance ID"),
      amount: z.number().positive(),
      damage_type: z.string().optional(),
    },
    async ({ instance_id, amount, damage_type }) => {
      const inst = combatDal.getInstance(instance_id);
      if (!inst) {
        return { content: [{ type: "text", text: `Instance #${instance_id} not found.` }] };
      }

      const newHp = Math.max(0, inst.current_hp - amount);
      const defeated = newHp === 0;
      const updated = combatDal.updateInstance(instance_id, { current_hp: newHp, defeated });

      const dmgInfo = damage_type ? `${amount} ${damage_type}` : `${amount}`;
      let text = `${inst.display_name} takes ${dmgInfo} damage. HP: ${updated.current_hp}/${updated.max_hp}`;
      if (defeated) text += ` — DEFEATED!`;

      return { content: [{ type: "text", text }] };
    },
  );

  server.tool(
    "apply_combatant_condition",
    "Apply a condition to a monster/NPC instance.",
    {
      instance_id: z.number(),
      condition: z.string().describe("Condition (e.g. 'stunned:1', 'prone')"),
    },
    async ({ instance_id, condition }) => {
      const inst = combatDal.getInstance(instance_id);
      if (!inst) {
        return { content: [{ type: "text", text: `Instance #${instance_id} not found.` }] };
      }
      const conditions = [...(inst.conditions_json ?? [])];
      const condName = condition.split(":")[0];
      const filtered = conditions.filter((c) => c.split(":")[0] !== condName);
      filtered.push(condition);
      combatDal.updateInstance(instance_id, { conditions_json: filtered });
      return {
        content: [{
          type: "text",
          text: `${inst.display_name} is now ${condition}. Conditions: [${filtered.join(", ")}]`,
        }],
      };
    },
  );

  server.tool(
    "end_combat",
    "End the active combat with an outcome.",
    {
      outcome: z.enum(["victory", "defeat", "fled", "negotiated", "aborted"]),
    },
    async ({ outcome }) => {
      const combat = combatDal.getActive();
      if (!combat) {
        return { content: [{ type: "text", text: "No active combat." }] };
      }

      combatDal.updateCombat(combat.id, {
        ended_at: new Date().toISOString(),
        outcome,
      });

      const sessions = sessionDal.list();
      const sessionId = sessions[sessions.length - 1]?.id;
      eventDal.append({
        session_id: sessionId,
        source: "orchestrator",
        type: EVENT_TYPES.COMBAT_ENDED,
        payload: { combat_id: combat.id, outcome },
      });

      return {
        content: [{
          type: "text",
          text: `Combat #${combat.id} ended: ${outcome}. Rounds: ${combat.round_number}.`,
        }],
      };
    },
  );
}

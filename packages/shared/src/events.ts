/**
 * Event type constants and payload definitions for the append-only event log.
 *
 * Every meaningful state change emits an event. This file defines the catalog
 * from campaign-state-schema.md section 4. The event log is the single source
 * of truth; tables are projections.
 *
 * Architecture note: Events flow one way — into the log via the DAL's
 * appendEvent(). Projections (table updates) happen in the same transaction.
 * The Combat Director, Orchestrator, Map MCP, and Player UI all emit events
 * through their respective MCP tool calls, which route through the DAL.
 */

import type { EventSource, CombatOutcome, QuestState } from "./types.js";

// ── Event type string constants ──────────────────────────────────────

export const EVENT_TYPES = {
  // Session lifecycle
  SESSION_STARTED: "session_started",
  SESSION_ENDED: "session_ended",

  // Combat lifecycle
  COMBAT_STARTED: "combat_started",
  COMBAT_ENDED: "combat_ended",
  TURN_STARTED: "turn_started",
  TURN_ENDED: "turn_ended",

  // Actions
  PC_ACTION_SUBMITTED: "pc_action_submitted",
  NPC_ACTION_RESOLVED: "npc_action_resolved",

  // HP & conditions
  DAMAGE_DEALT: "damage_dealt",
  HEALING_APPLIED: "healing_applied",
  CONDITION_APPLIED: "condition_applied",
  CONDITION_REMOVED: "condition_removed",

  // NPCs
  NPC_INTRODUCED: "npc_introduced",
  NPC_DIED: "npc_died",

  // World
  LOCATION_ENTERED: "location_entered",
  LOCATION_DISCOVERED: "location_discovered",
  QUEST_STARTED: "quest_started",
  QUEST_STATE_CHANGED: "quest_state_changed",

  // Inventory
  INVENTORY_ADDED: "inventory_added",
  INVENTORY_REMOVED: "inventory_removed",

  // Clock
  CLOCK_ADVANCED: "clock_advanced",

  // DM injections
  DM_INJECT_PUBLIC: "dm_inject_public",
  DM_INJECT_SECRET: "dm_inject_secret",
  DM_INJECT_OVERRIDE: "dm_inject_override",

  // Seeds
  SEED_PLANTED: "seed_planted",
  SEED_TRIGGERED: "seed_triggered",

  // Generated content
  RECAP_GENERATED: "recap_generated",
  SUMMARY_GENERATED: "summary_generated",

  // Rest & level
  LEVEL_UP: "level_up",
  LONG_REST: "long_rest",
  SHORT_REST: "short_rest",
} as const;

export type EventType = (typeof EVENT_TYPES)[keyof typeof EVENT_TYPES];

// ── Payload types per event ──────────────────────────────────────────

export interface SessionStartedPayload {
  session_id: number;
}

export interface SessionEndedPayload {
  session_id: number;
}

export interface CombatStartedPayload {
  combat_id: number;
}

export interface CombatEndedPayload {
  combat_id: number;
  outcome: CombatOutcome;
}

export interface TurnPayload {
  combat_id: number;
  actor_kind: "pc" | "npc_instance";
  actor_id: number;
}

export interface PCActionPayload {
  pc_id: number;
  action: string;
  target?: string;
  attack_roll?: number;
  damage?: number;
}

export interface NPCActionPayload {
  instance_id: number;
  action: string;
  target: string;
  result: string;
}

export interface DamagePayload {
  source: string;
  target_kind: "pc" | "npc_instance";
  target_id: number;
  amount: number;
  damage_type: string;
}

export interface HealingPayload {
  target_kind: "pc" | "npc_instance";
  target_id: number;
  amount: number;
}

export interface ConditionPayload {
  target_kind: "pc" | "npc_instance";
  target_id: number;
  condition: string;
  duration?: number;
}

export interface NPCIntroducedPayload {
  npc_id: number;
  name: string;
  role: string;
}

export interface NPCDiedPayload {
  npc_id?: number;
  instance_id?: number;
}

export interface LocationPayload {
  location_id: number;
}

export interface QuestStartedPayload {
  quest_id: number;
}

export interface QuestStateChangedPayload {
  quest_id: number;
  new_state: QuestState;
}

export interface InventoryPayload {
  owner_kind: "pc" | "party";
  owner_id?: number;
  name: string;
  qty: number;
}

export interface ClockAdvancedPayload {
  delta_minutes: number;
  new_time_of_day?: string;
}

export interface DMInjectPublicPayload {
  text: string;
}

export interface DMInjectSecretPayload {
  text: string;
  related_npc?: string;
  related_location?: string;
}

export interface DMInjectOverridePayload {
  directive: string;
}

export interface SeedPayload {
  seed_id: number;
}

export interface ContentGeneratedPayload {
  session_id: number;
  file: string;
}

export interface LevelUpPayload {
  pc_id: number;
  new_level: number;
}

// Empty payload for rest events
export type RestPayload = Record<string, never>;

// ── Union of all event payloads (for type-safe event creation) ───────

export type EventPayloadMap = {
  [EVENT_TYPES.SESSION_STARTED]: SessionStartedPayload;
  [EVENT_TYPES.SESSION_ENDED]: SessionEndedPayload;
  [EVENT_TYPES.COMBAT_STARTED]: CombatStartedPayload;
  [EVENT_TYPES.COMBAT_ENDED]: CombatEndedPayload;
  [EVENT_TYPES.TURN_STARTED]: TurnPayload;
  [EVENT_TYPES.TURN_ENDED]: TurnPayload;
  [EVENT_TYPES.PC_ACTION_SUBMITTED]: PCActionPayload;
  [EVENT_TYPES.NPC_ACTION_RESOLVED]: NPCActionPayload;
  [EVENT_TYPES.DAMAGE_DEALT]: DamagePayload;
  [EVENT_TYPES.HEALING_APPLIED]: HealingPayload;
  [EVENT_TYPES.CONDITION_APPLIED]: ConditionPayload;
  [EVENT_TYPES.CONDITION_REMOVED]: ConditionPayload;
  [EVENT_TYPES.NPC_INTRODUCED]: NPCIntroducedPayload;
  [EVENT_TYPES.NPC_DIED]: NPCDiedPayload;
  [EVENT_TYPES.LOCATION_ENTERED]: LocationPayload;
  [EVENT_TYPES.LOCATION_DISCOVERED]: LocationPayload;
  [EVENT_TYPES.QUEST_STARTED]: QuestStartedPayload;
  [EVENT_TYPES.QUEST_STATE_CHANGED]: QuestStateChangedPayload;
  [EVENT_TYPES.INVENTORY_ADDED]: InventoryPayload;
  [EVENT_TYPES.INVENTORY_REMOVED]: InventoryPayload;
  [EVENT_TYPES.CLOCK_ADVANCED]: ClockAdvancedPayload;
  [EVENT_TYPES.DM_INJECT_PUBLIC]: DMInjectPublicPayload;
  [EVENT_TYPES.DM_INJECT_SECRET]: DMInjectSecretPayload;
  [EVENT_TYPES.DM_INJECT_OVERRIDE]: DMInjectOverridePayload;
  [EVENT_TYPES.SEED_PLANTED]: SeedPayload;
  [EVENT_TYPES.SEED_TRIGGERED]: SeedPayload;
  [EVENT_TYPES.RECAP_GENERATED]: ContentGeneratedPayload;
  [EVENT_TYPES.SUMMARY_GENERATED]: ContentGeneratedPayload;
  [EVENT_TYPES.LEVEL_UP]: LevelUpPayload;
  [EVENT_TYPES.LONG_REST]: RestPayload;
  [EVENT_TYPES.SHORT_REST]: RestPayload;
};

/** Helper to create a typed event input (before it gets an id/timestamp from the DAL). */
export interface EventInput<T extends EventType = EventType> {
  session_id?: number | null;
  source: EventSource;
  type: T;
  payload: T extends keyof EventPayloadMap ? EventPayloadMap[T] : Record<string, unknown>;
}

/**
 * Core domain types matching the campaign-state-schema.md contract.
 *
 * These types are the TypeScript representation of every SQLite table.
 * The DAL (@archclaude/state) reads/writes these; MCPs and skills consume them.
 *
 * JSON columns (e.g. conditions_json, senses_json) are stored as TEXT in SQLite
 * but typed here as their parsed form. The DAL handles serialization.
 */

// ── Metadata & sessions ──────────────────────────────────────────────

export interface Campaign {
  id: 1;
  name: string;
  system: string;
  schema_version: number;
  created_at: string;
}

export interface Session {
  id: number;
  number: number;
  played_at: string | null;
  ended_at: string | null;
  summary_file: string | null;
  recap_file: string | null;
  key_events_json: string[] | null;
}

// ── Player characters ────────────────────────────────────────────────

export interface Senses {
  darkvision?: number;
  passive_perception?: number;
  blindsight?: number;
  tremorsense?: number;
  truesight?: number;
}

export interface Saves {
  str?: number;
  dex?: number;
  con?: number;
  int?: number;
  wis?: number;
  cha?: number;
}

export interface SpellSlots {
  max: Record<string, number>;
  current: Record<string, number>;
}

export interface PC {
  id: number;
  name: string;
  player_name: string | null;
  class: string | null;
  subclass: string | null;
  level: number;
  max_hp: number;
  current_hp: number;
  temp_hp: number;
  ac: number;
  initiative_bonus: number;
  speed_walk: number;
  speed_fly: number;
  speed_swim: number;
  senses_json: Senses | null;
  saves_json: Saves | null;
  spell_slots_json: SpellSlots | null;
  resistances_json: string[] | null;
  immunities_json: string[] | null;
  conditions_json: string[] | null;
  dossier_file: string | null;
  voice_profile: string | null;
  active: boolean;
  notes: string | null;
  death_save_successes: number;
  death_save_failures: number;
  concentrating_on: string | null;
}

// ── NPCs ─────────────────────────────────────────────────────────────

export type NPCStatus = "alive" | "dead" | "missing" | "unknown";

export interface NPC {
  id: number;
  name: string;
  role: string | null;
  status: NPCStatus;
  current_location: string | null;
  faction: string | null;
  voice_profile: string | null;
  dossier_file: string | null;
  introduced_session: number | null;
  notes_summary: string | null;
}

// ── Combat ───────────────────────────────────────────────────────────

export type CombatOutcome = "victory" | "defeat" | "fled" | "negotiated" | "aborted";
export type CombatIntensity = "terse" | "normal" | "tense" | "climax";
export type CombatDifficulty = "easy" | "medium" | "hard" | "deadly";

export interface InitiativeEntry {
  actor_kind: "pc" | "npc_instance";
  actor_id: number;
  init: number;
}

export interface Combat {
  id: number;
  session_id: number;
  started_at: string;
  ended_at: string | null;
  outcome: CombatOutcome | null;
  initiative_json: InitiativeEntry[] | null;
  current_turn: number;
  round_number: number;
  intensity: CombatIntensity;
  difficulty: CombatDifficulty | null;
  narrative_context: string | null;
}

export interface NPCInstance {
  id: number;
  combat_id: number;
  npc_id: number | null;
  template_key: string | null;
  display_name: string;
  max_hp: number;
  current_hp: number;
  ac: number;
  conditions_json: string[] | null;
  map_token_id: string | null;
  defeated: boolean;
}

// ── World ────────────────────────────────────────────────────────────

export type LocationType = "city" | "dungeon" | "wilderness" | "landmark" | "building" | "room";
export type LocationStatus = "unknown" | "known" | "visited" | "cleared" | "destroyed";

export interface Location {
  id: number;
  name: string;
  type: LocationType | null;
  parent_id: number | null;
  status: LocationStatus;
  dossier_file: string | null;
  introduced_session: number | null;
}

export interface Faction {
  id: number;
  name: string;
  reputation: number;
  status: string | null;
  dossier_file: string | null;
}

export type QuestState = "active" | "completed" | "failed" | "dormant";

export interface Quest {
  id: number;
  title: string;
  state: QuestState;
  summary: string | null;
  giver_npc_id: number | null;
  related_location_id: number | null;
  introduced_session: number | null;
  resolved_session: number | null;
  notes_file: string | null;
}

export type TimeOfDay = "dawn" | "morning" | "midday" | "dusk" | "night" | "midnight";
export type PartyState = "exploring" | "traveling" | "resting" | "in_combat" | "social" | "downtime";

export interface Clock {
  id: 1;
  in_world_date: string | null;
  time_of_day: TimeOfDay | null;
  weather: string | null;
  current_location_id: number | null;
  party_state: PartyState | null;
}

// ── Inventory ────────────────────────────────────────────────────────

export type ItemKind = "magic_item" | "key_item" | "consumable" | "currency";

export interface InventoryItem {
  id: number;
  owner_kind: "pc" | "party";
  owner_id: number | null;
  name: string;
  kind: ItemKind | null;
  description: string | null;
  qty: number;
  notes: string | null;
}

// ── Seeds & secrets ──────────────────────────────────────────────────

export type SeedStatus = "planted" | "triggered" | "expired";
export type SeedVisibility = "public" | "secret";

export interface Seed {
  id: number;
  text: string;
  trigger_condition: string | null;
  status: SeedStatus;
  visibility: SeedVisibility;
  planted_session: number | null;
  triggered_session: number | null;
}

export type SecretStatus = "hidden" | "partial_revealed" | "revealed";

export interface Secret {
  id: number;
  topic: string | null;
  text: string;
  related_npc_id: number | null;
  related_location_id: number | null;
  status: SecretStatus;
  added_session: number | null;
}

// ── Memory chunks ────────────────────────────────────────────────────

export type MemoryKind = "session_summary" | "npc_note" | "lore" | "dialog" | "secret" | "seed";

export interface MemoryChunk {
  id: number;
  kind: MemoryKind;
  text: string;
  source_file: string | null;
  source_session: number | null;
  tags_json: string[] | null;
  created_at: string;
}

// ── Event log ────────────────────────────────────────────────────────

export type EventSource = "orchestrator" | "combat" | "map" | "player" | "dm" | "system";

export interface GameEvent {
  id: number;
  timestamp: string;
  session_id: number | null;
  source: EventSource;
  type: string;
  payload_json: Record<string, unknown>;
  reverted: boolean;
}

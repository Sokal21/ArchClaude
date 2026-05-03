/**
 * Types for the Bestiary MCP — monster stat blocks, spells, conditions.
 *
 * These mirror the Open5e API response shapes but are simplified to
 * what the encounter builder and combat director actually need.
 * Full stat blocks are fetched on demand; search results are compact.
 */

export interface MonsterSummary {
  slug: string;
  name: string;
  cr: string;
  type: string;
  size: string;
  alignment: string;
  hit_points: number;
  armor_class: number;
  source: string;
}

export interface MonsterStatBlock {
  slug: string;
  name: string;
  size: string;
  type: string;
  subtype: string;
  alignment: string;
  armor_class: number;
  armor_desc: string;
  hit_points: number;
  hit_dice: string;
  speed: Record<string, number>;
  strength: number;
  dexterity: number;
  constitution: number;
  intelligence: number;
  wisdom: number;
  charisma: number;
  strength_save: number | null;
  dexterity_save: number | null;
  constitution_save: number | null;
  intelligence_save: number | null;
  wisdom_save: number | null;
  charisma_save: number | null;
  perception: number | null;
  damage_vulnerabilities: string;
  damage_resistances: string;
  damage_immunities: string;
  condition_immunities: string;
  senses: string;
  languages: string;
  challenge_rating: string;
  cr: number;
  actions: MonsterAction[];
  special_abilities: MonsterAbility[];
  legendary_actions: MonsterAction[];
  reactions: MonsterAction[];
  environments: string[];
  source: string;
}

export interface MonsterAction {
  name: string;
  desc: string;
  attack_bonus?: number;
  damage_dice?: string;
  damage_bonus?: number;
}

export interface MonsterAbility {
  name: string;
  desc: string;
}

export interface SpellSummary {
  slug: string;
  name: string;
  level: string;
  school: string;
  casting_time: string;
  range: string;
  duration: string;
  concentration: string;
  source: string;
}

export interface SpellDetail {
  slug: string;
  name: string;
  desc: string;
  higher_level: string;
  level: string;
  school: string;
  casting_time: string;
  range: string;
  duration: string;
  concentration: string;
  components: string;
  material: string;
  source: string;
}

export interface ConditionDetail {
  slug: string;
  name: string;
  desc: string;
}

export interface SearchFilters {
  cr_min?: number;
  cr_max?: number;
  type?: string;
  size?: string;
  environment?: string;
  name?: string;
}

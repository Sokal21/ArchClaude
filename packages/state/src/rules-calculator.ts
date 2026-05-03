/**
 * D&D 5e Rules Calculator
 *
 * Pure functions for resolving attacks, damage, saves, and checks.
 * Takes player dice results + character data and computes the outcome
 * with all modifiers, conditions, and resistances applied.
 *
 * Design: The player always rolls. This calculator does the math.
 * It never generates random numbers — it only computes totals from
 * the player's stated roll + the character's modifiers.
 */

import type { PC, AbilityName } from "@archclaude/shared";

// ── Ability modifier ──

export function abilityModifier(score: number): number {
  return Math.floor((score - 10) / 2);
}

export function getAbilityScore(pc: PC, ability: AbilityName): number {
  return pc[ability];
}

export function getAbilityMod(pc: PC, ability: AbilityName): number {
  return abilityModifier(pc[ability]);
}

// ── Condition effects ──

/** Mechanical effects of D&D 5e conditions. */
export const CONDITION_EFFECTS: Record<string, {
  attack_disadvantage?: boolean;
  attacks_against_advantage?: boolean;
  save_disadvantage?: string[];    // ability saves with disadvantage
  auto_fail_saves?: string[];      // ability saves that auto-fail
  speed_zero?: boolean;
  cant_attack?: boolean;
  cant_take_actions?: boolean;
  description: string;
}> = {
  blinded: {
    attack_disadvantage: true,
    attacks_against_advantage: true,
    description: "Can't see. Attack rolls have disadvantage. Attacks against have advantage.",
  },
  charmed: {
    cant_attack: true, // can't attack the charmer specifically
    description: "Can't attack the charmer. Charmer has advantage on social checks.",
  },
  deafened: {
    description: "Can't hear. Auto-fails checks requiring hearing.",
  },
  frightened: {
    attack_disadvantage: true, // while source of fear is in line of sight
    description: "Disadvantage on ability checks and attack rolls while source of fear is in sight. Can't willingly move closer.",
  },
  grappled: {
    speed_zero: true,
    description: "Speed is 0. Can't benefit from bonus to speed.",
  },
  incapacitated: {
    cant_take_actions: true,
    description: "Can't take actions or reactions.",
  },
  invisible: {
    attack_disadvantage: false, // attacker has disadvantage against invisible
    attacks_against_advantage: false,
    description: "Impossible to see. Attack rolls against have disadvantage. Creature's attacks have advantage.",
  },
  paralyzed: {
    cant_take_actions: true,
    speed_zero: true,
    auto_fail_saves: ["str", "dex"],
    attacks_against_advantage: true,
    description: "Incapacitated. Can't move or speak. Auto-fails STR/DEX saves. Attacks from within 5ft are auto-crits.",
  },
  petrified: {
    cant_take_actions: true,
    speed_zero: true,
    auto_fail_saves: ["str", "dex"],
    attacks_against_advantage: true,
    description: "Transformed to stone. Weight x10. Resistant to all damage. Immune to poison/disease.",
  },
  poisoned: {
    attack_disadvantage: true,
    save_disadvantage: [], // ability checks, not saves
    description: "Disadvantage on attack rolls and ability checks.",
  },
  prone: {
    attack_disadvantage: true,
    description: "Disadvantage on attack rolls. Melee attacks within 5ft have advantage, ranged have disadvantage.",
  },
  restrained: {
    attack_disadvantage: true,
    attacks_against_advantage: true,
    speed_zero: true,
    save_disadvantage: ["dex"],
    description: "Speed 0. Disadvantage on DEX saves. Attack rolls have disadvantage. Attacks against have advantage.",
  },
  stunned: {
    cant_take_actions: true,
    auto_fail_saves: ["str", "dex"],
    attacks_against_advantage: true,
    description: "Incapacitated. Can't move. Auto-fails STR/DEX saves. Attacks against have advantage.",
  },
  unconscious: {
    cant_take_actions: true,
    speed_zero: true,
    auto_fail_saves: ["str", "dex"],
    attacks_against_advantage: true,
    description: "Incapacitated, drops held items, falls prone. Auto-fails STR/DEX saves. Attacks have advantage. Melee within 5ft auto-crit.",
  },
};

/** Get active condition names from a conditions_json array (strip durations). */
export function parseConditions(conditions: string[] | null): string[] {
  if (!conditions) return [];
  return conditions.map((c) => c.split(":")[0].toLowerCase());
}

/** Check if active conditions cause attack disadvantage. */
export function hasAttackDisadvantage(conditions: string[]): boolean {
  return conditions.some((c) => CONDITION_EFFECTS[c]?.attack_disadvantage);
}

/** Check if attacks against this target have advantage. */
export function hasAttacksAgainstAdvantage(conditions: string[]): boolean {
  return conditions.some((c) => CONDITION_EFFECTS[c]?.attacks_against_advantage);
}

// ── Attack resolution ──

export interface AttackResult {
  roll: number;
  modifier: number;
  total: number;
  target_ac: number;
  hit: boolean;
  critical: boolean;
  critical_miss: boolean;
  advantage: boolean;
  disadvantage: boolean;
  notes: string[];
}

export function resolveAttack(params: {
  d20_roll: number;
  to_hit_modifier: number;
  target_ac: number;
  attacker_conditions: string[];
  target_conditions: string[];
  has_advantage?: boolean;
  has_disadvantage?: boolean;
}): AttackResult {
  const notes: string[] = [];
  let advantage = params.has_advantage ?? false;
  let disadvantage = params.has_disadvantage ?? false;

  // Condition-based modifiers
  if (hasAttackDisadvantage(params.attacker_conditions)) {
    disadvantage = true;
    notes.push(`Disadvantage (${params.attacker_conditions.filter((c) => CONDITION_EFFECTS[c]?.attack_disadvantage).join(", ")})`);
  }
  if (hasAttacksAgainstAdvantage(params.target_conditions)) {
    advantage = true;
    notes.push(`Advantage (target: ${params.target_conditions.filter((c) => CONDITION_EFFECTS[c]?.attacks_against_advantage).join(", ")})`);
  }

  // Advantage and disadvantage cancel out
  if (advantage && disadvantage) {
    advantage = false;
    disadvantage = false;
    notes.push("Advantage and disadvantage cancel out → straight roll");
  }

  const critical = params.d20_roll === 20;
  const critical_miss = params.d20_roll === 1;
  const total = params.d20_roll + params.to_hit_modifier;
  const hit = critical || (!critical_miss && total >= params.target_ac);

  return {
    roll: params.d20_roll,
    modifier: params.to_hit_modifier,
    total,
    target_ac: params.target_ac,
    hit,
    critical,
    critical_miss,
    advantage,
    disadvantage,
    notes,
  };
}

// ── Damage resolution ──

export interface DamageResult {
  base_damage: number;
  modifier: number;
  total_before_resistance: number;
  resistance_applied: string | null;
  final_damage: number;
  notes: string[];
}

export function resolveDamage(params: {
  damage_roll: number;
  damage_bonus: number;
  damage_type: string;
  is_critical: boolean;
  target_resistances: string[] | null;
  target_immunities: string[] | null;
  target_vulnerabilities?: string[] | null;
}): DamageResult {
  const notes: string[] = [];
  let total = params.damage_roll + params.damage_bonus;
  if (params.is_critical) {
    notes.push("Critical hit! (extra dice already included in damage_roll)");
  }

  let resistance_applied: string | null = null;
  let final = total;

  const resistances = (params.target_resistances ?? []).map((r) => r.toLowerCase());
  const immunities = (params.target_immunities ?? []).map((r) => r.toLowerCase());
  const vulnerabilities = (params.target_vulnerabilities ?? []).map((r) => r.toLowerCase());
  const dmgType = params.damage_type.toLowerCase();

  if (immunities.includes(dmgType)) {
    final = 0;
    resistance_applied = "immune";
    notes.push(`Target is IMMUNE to ${params.damage_type} → 0 damage`);
  } else if (resistances.includes(dmgType)) {
    final = Math.floor(total / 2);
    resistance_applied = "resistant";
    notes.push(`Target is RESISTANT to ${params.damage_type} → half damage (${total} → ${final})`);
  } else if (vulnerabilities.includes(dmgType)) {
    final = total * 2;
    resistance_applied = "vulnerable";
    notes.push(`Target is VULNERABLE to ${params.damage_type} → double damage (${total} → ${final})`);
  }

  return {
    base_damage: params.damage_roll,
    modifier: params.damage_bonus,
    total_before_resistance: total,
    resistance_applied,
    final_damage: final,
    notes,
  };
}

// ── Save resolution ──

export interface SaveResult {
  roll: number;
  modifier: number;
  total: number;
  dc: number;
  success: boolean;
  auto_fail: boolean;
  notes: string[];
}

export function resolveSave(params: {
  d20_roll: number;
  ability: AbilityName;
  pc: PC;
  proficient_saves: string[];
  dc: number;
  active_conditions: string[];
}): SaveResult {
  const notes: string[] = [];
  const mod = getAbilityMod(params.pc, params.ability);
  const proficient = params.proficient_saves.includes(params.ability);
  const totalMod = mod + (proficient ? params.pc.proficiency_bonus : 0);

  // Check for auto-fail from conditions
  const autoFail = params.active_conditions.some((c) => {
    const effects = CONDITION_EFFECTS[c];
    return effects?.auto_fail_saves?.includes(params.ability);
  });

  if (autoFail) {
    notes.push(`Auto-fail ${params.ability.toUpperCase()} save (${params.active_conditions.join(", ")})`);
    return {
      roll: params.d20_roll,
      modifier: totalMod,
      total: params.d20_roll + totalMod,
      dc: params.dc,
      success: false,
      auto_fail: true,
      notes,
    };
  }

  if (proficient) notes.push(`Proficient in ${params.ability.toUpperCase()} saves (+${params.pc.proficiency_bonus})`);

  const total = params.d20_roll + totalMod;
  return {
    roll: params.d20_roll,
    modifier: totalMod,
    total,
    dc: params.dc,
    success: total >= params.dc,
    auto_fail: false,
    notes,
  };
}

// ── Skill check resolution ──

export interface CheckResult {
  roll: number;
  ability_mod: number;
  proficiency: number;
  total: number;
  notes: string[];
}

/** Standard 5e skill → ability mapping. */
export const SKILL_ABILITIES: Record<string, AbilityName> = {
  athletics: "str",
  acrobatics: "dex",
  sleight_of_hand: "dex",
  stealth: "dex",
  arcana: "int",
  history: "int",
  investigation: "int",
  nature: "int",
  religion: "int",
  animal_handling: "wis",
  insight: "wis",
  medicine: "wis",
  perception: "wis",
  survival: "wis",
  deception: "cha",
  intimidation: "cha",
  performance: "cha",
  persuasion: "cha",
};

export function resolveCheck(params: {
  d20_roll: number;
  skill: string;
  pc: PC;
  proficient_skills: Array<{ skill: string; ability: string; proficient: number }>;
  active_conditions: string[];
}): CheckResult {
  const notes: string[] = [];
  const ability = SKILL_ABILITIES[params.skill.toLowerCase()] ?? "str";
  const abilityMod = getAbilityMod(params.pc, ability);

  const skillProf = params.proficient_skills.find(
    (s) => s.skill.toLowerCase() === params.skill.toLowerCase(),
  );
  let profBonus = 0;
  if (skillProf) {
    profBonus = params.pc.proficiency_bonus * skillProf.proficient;
    notes.push(
      skillProf.proficient === 2
        ? `Expertise in ${params.skill} (+${profBonus})`
        : `Proficient in ${params.skill} (+${profBonus})`,
    );
  }

  // Poisoned gives disadvantage on ability checks (not computed here — just noted)
  if (params.active_conditions.includes("poisoned")) {
    notes.push("Poisoned: disadvantage on ability checks");
  }

  const total = params.d20_roll + abilityMod + profBonus;
  return {
    roll: params.d20_roll,
    ability_mod: abilityMod,
    proficiency: profBonus,
    total,
    notes,
  };
}

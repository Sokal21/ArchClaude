/**
 * Seed evaluator — checks planted seeds against current game state.
 *
 * Phase 5 feature. On scene changes (location entry, session milestones),
 * the orchestrator calls this to find seeds whose trigger conditions
 * are now met.
 *
 * Trigger condition syntax (free-text, matched by pattern):
 * - "party_at:<LocationName>" — party is at the specified location
 * - "session>=<N>" — current session number is >= N
 * - "scene:<tag>" — a specific scene tag (manual trigger)
 * - Compound: "party_at:Goldspire AND session>=4"
 *
 * The evaluator is deliberately simple. Complex trigger logic is
 * handled by the orchestrator's judgment, not by this module.
 */

import type { Database } from "better-sqlite3";
import type { Seed } from "@archclaude/shared";

interface GameContext {
  current_location?: string;
  session_number?: number;
  scene_tag?: string;
}

/**
 * Evaluate a single trigger condition against the current game context.
 */
function evaluateCondition(condition: string, context: GameContext): boolean {
  const trimmed = condition.trim();

  // party_at:<location>
  const partyAtMatch = trimmed.match(/^party_at:(.+)$/i);
  if (partyAtMatch) {
    const target = partyAtMatch[1].trim().toLowerCase();
    return (context.current_location ?? "").toLowerCase() === target;
  }

  // session>=<N>
  const sessionMatch = trimmed.match(/^session\s*>=\s*(\d+)$/i);
  if (sessionMatch) {
    const target = parseInt(sessionMatch[1], 10);
    return (context.session_number ?? 0) >= target;
  }

  // session=<N>
  const sessionExact = trimmed.match(/^session\s*=\s*(\d+)$/i);
  if (sessionExact) {
    const target = parseInt(sessionExact[1], 10);
    return context.session_number === target;
  }

  // scene:<tag>
  const sceneMatch = trimmed.match(/^scene:(.+)$/i);
  if (sceneMatch) {
    const target = sceneMatch[1].trim().toLowerCase();
    return (context.scene_tag ?? "").toLowerCase() === target;
  }

  // Free-text conditions can't be auto-evaluated — return false
  // (the orchestrator should check these manually)
  return false;
}

/**
 * Evaluate a compound trigger condition (supports AND).
 */
function evaluateTrigger(trigger: string, context: GameContext): boolean {
  // Split on AND
  const parts = trigger.split(/\s+AND\s+/i);
  return parts.every((part) => evaluateCondition(part, context));
}

/**
 * Find all planted seeds whose trigger conditions are met.
 */
export function evaluateSeeds(db: Database, context: GameContext): Seed[] {
  const seeds = db
    .prepare("SELECT * FROM seeds WHERE status = 'planted' AND trigger_condition IS NOT NULL")
    .all() as Seed[];

  return seeds.filter((seed) => {
    if (!seed.trigger_condition) return false;
    return evaluateTrigger(seed.trigger_condition, context);
  });
}

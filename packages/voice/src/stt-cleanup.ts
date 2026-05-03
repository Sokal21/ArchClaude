/**
 * STT cleanup pass.
 *
 * Transforms verbose audio transcripts into clean, structured player
 * turns before they reach the orchestrator. This saves tokens by
 * stripping filler words, false starts, and STT artifacts.
 *
 * The cleanup is rule-based for now. A small local model could
 * replace this in a future iteration.
 */

import type { STTResult } from "./types.js";

/** Common filler words and STT artifacts to strip. */
const FILLER_PATTERNS = [
  /\b(um+|uh+|er+|ah+|like|you know|I mean|basically|actually|so+|well)\b/gi,
  /\b(hmm+|hm+|okay so|right so)\b/gi,
];

/** False start patterns (repeated/corrected words). */
const FALSE_START_PATTERN = /\b(\w+)\s+\1\b/gi;

/** Normalize whitespace and punctuation. */
function normalizeWhitespace(text: string): string {
  return text
    .replace(/\s+/g, " ")
    .replace(/\s+([.,!?])/g, "$1")
    .trim();
}

/**
 * Clean up raw STT transcript.
 * Returns the cleaned text and whether it looks like a game command.
 */
export function cleanupTranscript(raw: string): {
  clean: string;
  is_command: boolean;
  command_type?: "action" | "say" | "roll" | "dm";
} {
  let text = raw;

  // Strip filler words
  for (const pattern of FILLER_PATTERNS) {
    text = text.replace(pattern, "");
  }

  // Fix false starts
  text = text.replace(FALSE_START_PATTERN, "$1");

  // Normalize
  text = normalizeWhitespace(text);

  // Detect game commands from speech
  const lower = text.toLowerCase();

  if (lower.startsWith("i attack") || lower.startsWith("i cast") ||
      lower.startsWith("i use") || lower.startsWith("i move") ||
      lower.startsWith("i want to") || lower.startsWith("i try to") ||
      lower.startsWith("i'd like to")) {
    return { clean: text, is_command: true, command_type: "action" };
  }

  if (lower.startsWith("i say") || lower.startsWith("i tell") ||
      lower.includes("speaking in character")) {
    return { clean: text, is_command: true, command_type: "say" };
  }

  if (lower.includes("roll") && (lower.includes("d20") || lower.includes("dice") ||
      lower.includes("check") || lower.includes("save"))) {
    return { clean: text, is_command: true, command_type: "roll" };
  }

  if (lower.startsWith("dm ") || lower.startsWith("dungeon master")) {
    return { clean: text, is_command: true, command_type: "dm" };
  }

  return { clean: text, is_command: false };
}

/** Format a cleaned transcript as a structured player input event. */
export function formatPlayerInput(
  result: STTResult,
  cleanup: ReturnType<typeof cleanupTranscript>,
): {
  player_id: string;
  text: string;
  command_type: string | null;
  confidence: number;
} {
  return {
    player_id: result.player_id,
    text: cleanup.clean,
    command_type: cleanup.command_type ?? null,
    confidence: result.confidence,
  };
}

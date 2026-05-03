/**
 * Secret filter — prevents accidental leakage of DM secrets in narration.
 *
 * Phase 5 safety layer. Every narration-bound output runs through this
 * filter before reaching players. It flags text that accidentally
 * contains content from `dm_inject_secret` entries.
 *
 * Architecture: The filter maintains a list of secret phrases/keywords.
 * Before narration is sent to the TV display or TTS, it checks for
 * matches. If found, it returns a warning so the orchestrator can
 * rephrase.
 */

import type { Database } from "better-sqlite3";

interface SecretEntry {
  id: number;
  topic: string | null;
  text: string;
}

/**
 * Build a secret filter from the current secrets in the database.
 * Returns a function that checks text for secret leakage.
 */
export function buildSecretFilter(db: Database): (narration: string) => {
  safe: boolean;
  leaked_topics: string[];
  leaked_phrases: string[];
} {
  const secrets = db
    .prepare("SELECT id, topic, text FROM secrets WHERE status = 'hidden'")
    .all() as SecretEntry[];

  // Extract key phrases from each secret (sentences > 5 words)
  const secretPhrases: Array<{ topic: string; phrase: string }> = [];
  for (const secret of secrets) {
    const sentences = secret.text.split(/[.!?]+/).filter((s) => s.trim().length > 20);
    for (const sentence of sentences) {
      secretPhrases.push({
        topic: secret.topic ?? `secret_${secret.id}`,
        phrase: sentence.trim().toLowerCase(),
      });
    }

    // Also check for specific proper nouns in the secret text
    // (names, places that shouldn't appear in narration)
    const words = secret.text.split(/\s+/);
    for (const word of words) {
      // Proper nouns: capitalized, > 3 chars, not sentence-start common words
      if (word.length > 3 && /^[A-Z]/.test(word) &&
          !["The", "This", "That", "When", "Where", "What", "They", "Their", "There"].includes(word)) {
        secretPhrases.push({
          topic: secret.topic ?? `secret_${secret.id}`,
          phrase: word.toLowerCase(),
        });
      }
    }
  }

  return function checkForLeaks(narration: string) {
    const lower = narration.toLowerCase();
    const leakedTopics: string[] = [];
    const leakedPhrases: string[] = [];

    for (const { topic, phrase } of secretPhrases) {
      // For short phrases (proper nouns), require word boundary match
      if (phrase.split(/\s+/).length <= 2) {
        const regex = new RegExp(`\\b${phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
        if (regex.test(narration)) {
          leakedTopics.push(topic);
          leakedPhrases.push(phrase);
        }
      } else {
        // For longer phrases, check substring containment
        if (lower.includes(phrase)) {
          leakedTopics.push(topic);
          leakedPhrases.push(phrase);
        }
      }
    }

    return {
      safe: leakedTopics.length === 0,
      leaked_topics: [...new Set(leakedTopics)],
      leaked_phrases: [...new Set(leakedPhrases)],
    };
  };
}

/**
 * Query rewrite for FTS5 recall.
 *
 * Phase 5 enhancement. Claude rephrases natural-language recall queries
 * into multiple keyword variants before searching — this covers most of
 * the ground embeddings would.
 *
 * This module provides utilities for the Lore Memory skill to generate
 * better FTS5 queries from natural language.
 */

/**
 * Generate keyword variants from a natural language query.
 * Returns an array of FTS5-compatible search strings.
 *
 * Example:
 *   "what happened at the inn with Vincent" →
 *   ["inn Vincent", "tavern Vincent Blackwood", "Sleeping Fox"]
 */
export function generateQueryVariants(query: string): string[] {
  const variants: string[] = [];

  // Original query (cleaned)
  const cleaned = query
    .replace(/\b(what|when|where|who|how|did|was|were|the|a|an|is|it|in|at|with|to|of|for|on)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();

  if (cleaned) variants.push(cleaned);

  // Synonym expansion for common D&D terms
  const synonyms: Record<string, string[]> = {
    inn: ["tavern", "pub", "bar", "Sleeping Fox"],
    fight: ["combat", "battle", "encounter", "attack"],
    dungeon: ["vault", "crypt", "tomb", "underground"],
    forest: ["wood", "woods", "grove", "Hollow Wood"],
    town: ["village", "city", "settlement", "Millhaven"],
    monster: ["creature", "beast", "enemy"],
    quest: ["mission", "task", "objective"],
    killed: ["died", "defeated", "slain", "dead"],
    merchant: ["trader", "shopkeeper", "vendor"],
    treasure: ["loot", "gold", "reward", "item"],
  };

  const words = cleaned.toLowerCase().split(/\s+/);
  for (const word of words) {
    if (synonyms[word]) {
      for (const syn of synonyms[word]) {
        const variant = cleaned.replace(new RegExp(`\\b${word}\\b`, "i"), syn);
        if (variant !== cleaned) variants.push(variant);
      }
    }
  }

  return [...new Set(variants)].slice(0, 5); // cap at 5 variants
}

/**
 * Build an FTS5 OR query from multiple variants.
 * FTS5 supports OR between terms.
 */
export function buildFTS5Query(variants: string[]): string {
  if (variants.length === 0) return "";
  if (variants.length === 1) return variants[0];

  // FTS5 supports OR between quoted phrases
  return variants.map((v) => `"${v}"`).join(" OR ");
}

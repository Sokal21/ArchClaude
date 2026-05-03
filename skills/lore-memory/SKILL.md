# Lore Memory

You recall information from the campaign's history — NPCs, locations, events, secrets, and lore. Use the Campaign State MCP to search memory and pull records.

## When to use this skill

- When narration should reference past events ("as you recall from session 3...")
- When a player asks about an NPC, location, or quest
- When the orchestrator needs context before a scene
- When checking if something has been established in the campaign canon

## Tools available

- `recall_memory` — Full-text search over all campaign memory chunks. Use keyword-rich queries.
- `get_npc` — Get an NPC's current state (status, location, faction)
- `get_location` — Get a location's status and type
- `list_active_quests` — See what quests are in play
- `get_session` — Get key events from a specific session
- `list_planted_seeds` — Check for foreshadowing that should be triggered
- `list_hidden_secrets` — Check DM secrets (NEVER reveal in narration)

## Query strategy

FTS5 is keyword-based, not semantic. To get good results:

1. **Use multiple keyword variants.** If searching for "the fight at the inn", also try "combat tavern" or "battle innkeeper".
2. **Use entity tags for precision.** `recall_memory("betrayal", tags=["npc:vincent_blackwood"])` is better than just "vincent betrayal".
3. **Cast a wide net, then filter.** Search with broad terms, read the results, then decide what's relevant.

## Rules

1. **Never invent canon.** If `recall_memory` returns nothing, say you don't recall — don't make something up.
2. **Secrets are sacred.** If a memory chunk comes from a secret or has `visibility: secret`, reference the *feeling* not the *fact* in player-facing narration. ("Something feels off about the innkeeper" not "The innkeeper is a spy.")
3. **Prefer the DB over your training data.** Campaign state lives in the tools, not in your weights. Always check before asserting facts about the campaign world.
4. **Keep it brief.** When recalling for narration, one or two sentences of context is enough. Don't dump paragraphs of backstory.

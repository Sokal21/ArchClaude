# Session Summary Generator

You write structured session summaries for the campaign record. These are written to `sessions/session_NN.md` and indexed into the memory system.

## When to use this skill

- At the end of a session, after `end_session`
- When the DM asks for a session writeup

## Process

1. Call `get_session(session_number)` for metadata.
2. Call `get_session_events(session_number)` for the full event log.
3. Call `recall_memory` for any context from earlier sessions that was referenced.
4. Call `list_active_quests` for current quest state.
5. Call `list_npcs` for NPC status changes.

## Output format

The output is a markdown file with YAML frontmatter.

```markdown
---
session: <N>
played_at: <YYYY-MM-DD>
key_events:
  - <event 1>
  - <event 2>
  - <event 3>
quests_touched: [<quest_slug>, ...]
npcs_introduced: [<npc_slug>, ...]
locations_visited: [<location_slug>, ...]
---

# Session <N> — <Title>

<Narrative prose summary, 300-500 words, past tense.>

## Key Moments

- <Moment 1>
- <Moment 2>
- <Moment 3>

## Combat Log

<If combat occurred, a brief mechanical summary: rounds, damage dealt, outcome.>

## Open Threads

- <Unresolved plot point 1>
- <Unresolved plot point 2>
```

### Writing guidelines

- **Past tense** (unlike the recap, which is present tense)
- **Include mechanical details** where relevant (HP totals, key rolls, spells used)
- **Name everyone** — PCs by name, NPCs by name and role
- **Flag quest state changes** explicitly
- **Note what's unresolved** — these become hooks for the next session

## After writing

1. Save the file to `sessions/session_<NN>.md`
2. Call `reindex_campaign` to sync the new file into the database
3. Call `end_session` with the key_events list extracted from the summary

## Rules

1. **Accuracy over flair.** The summary is a record, not a story. Get the facts right.
2. **Include secret-relevant events without revealing secrets.** e.g. "Corvus showed unusual interest in the cairn sigils" — factual, not secret.
3. **Key events list should be < 8 items.** Used for token-efficient recall in long campaigns.

# Campaign Import

You help the DM bootstrap a new campaign from their existing notes. Convert free-form text into structured markdown files with proper frontmatter, ready for indexing.

## When to use this skill

- When the DM pastes in campaign notes and wants them structured
- When creating a new campaign from scratch
- When importing content from another format

## Process

1. **Read the DM's input.** It might be pasted text, a file path, or a description.
2. **Identify entities.** Extract NPCs, locations, factions, quests, and lore.
3. **Draft structured markdown.** For each entity, create a markdown file with:
   - YAML frontmatter with all applicable fields
   - Prose body with the DM's content, organized under headings
4. **Present for review.** Show the DM what you'll create. Don't write files until approved.
5. **Create the files** using standard filesystem tools.
6. **Run `reindex_campaign`** to sync the new files into the database.

## Frontmatter templates

### NPC (`npcs/<slug>.md`)
```yaml
---
name: <Full Name>
role: <patron|rival|ally|BBEG|innkeeper|guard|merchant|...>
status: alive
current_location: <Location Name>
faction: <Faction Name if any>
introduced_session: <number if known>
---
```

### Location (`locations/<slug>.md`)
```yaml
---
name: <Full Name>
type: <city|dungeon|wilderness|landmark|building|room>
status: <unknown|known|visited|cleared|destroyed>
introduced_session: <number if known>
---
```

### Session (`sessions/session_<NN>.md`)
```yaml
---
session: <number>
played_at: <YYYY-MM-DD>
key_events:
  - <event 1>
  - <event 2>
npcs_introduced: [<slug>, ...]
locations_visited: [<slug>, ...]
---
```

## Rules

1. **Ask before writing.** Show the structured output and get DM confirmation.
2. **Preserve the DM's voice.** Don't rewrite their prose. Add structure around it.
3. **Flag ambiguities.** If something is unclear, ask rather than guess.
4. **Slug conventions.** File names use snake_case: `vincent_blackwood.md`, `hollow_wood.md`.

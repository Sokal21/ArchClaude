# MCP Server Setup

> How to wire ArchClaude's MCP servers into Claude Code / Cowork.

## Prerequisites

1. Build all packages: `pnpm build`
2. Pull the SRD cache: `pnpm --filter @archclaude/bestiary cache:pull`
3. Initialize a campaign: `node packages/cli/dist/index.js init ./my-campaign`

## MCP Server Configuration

Add to your `.claude/settings.json` or Cowork MCP configuration:

```json
{
  "mcpServers": {
    "archclaude-campaign-state": {
      "command": "node",
      "args": ["<repo>/packages/state-mcp/dist/index.js", "--campaign", "<campaign-dir>"],
      "env": {}
    },
    "archclaude-bestiary": {
      "command": "node",
      "args": ["<repo>/packages/bestiary/dist/index.js"],
      "env": {
        "CAMPAIGN_DIR": "<campaign-dir>"
      }
    }
  }
}
```

Replace:
- `<repo>` with the absolute path to this repository
- `<campaign-dir>` with the absolute path to the campaign folder

## Available Tools

### Campaign State MCP (archclaude-campaign-state)

| Tool | Purpose | Used by |
|------|---------|---------|
| `start_session` / `end_session` | Session lifecycle | Orchestrator |
| `get_session` / `list_sessions` | Session info | Orchestrator, Lore Memory |
| `get_pc` / `list_pcs` | PC stats & conditions | Combat Director, Orchestrator |
| `apply_damage` / `apply_healing` | PC HP changes | Combat Director |
| `apply_condition` / `remove_condition` | PC status effects | Combat Director |
| `update_spell_slots` | Spell tracking | Combat Director |
| `get_npc` / `list_npcs` / `create_npc` / `update_npc` | NPC management | Orchestrator |
| `start_combat` / `end_combat` | Combat lifecycle | Orchestrator |
| `add_combatant` / `damage_combatant` | Monster management | Combat Director |
| `set_initiative` / `advance_turn` | Turn tracking | Combat Director |
| `get_combat_state` | Full combat snapshot | Combat Director |
| `apply_combatant_condition` | Monster conditions | Combat Director |
| `get_location` / `list_locations` / `create_location` | World map | Orchestrator |
| `update_location_status` | Location discovery | Orchestrator |
| `list_factions` / `update_faction_reputation` | Faction relations | Orchestrator |
| `list_active_quests` / `create_quest` / `update_quest_state` | Quest tracker | Orchestrator |
| `get_clock` / `advance_clock` / `set_party_location` | Time & position | Orchestrator |
| `list_inventory` / `add_item` / `remove_item` | Gear tracking | Orchestrator |
| `list_planted_seeds` / `plant_seed` / `trigger_seed` | Foreshadowing | Orchestrator |
| `list_hidden_secrets` / `inject_dm_secret` / `reveal_secret` | DM secrets | Orchestrator, DM |
| `recall_memory` / `add_memory` | Campaign memory FTS | Lore Memory |
| `get_recent_events` / `get_session_events` / `undo_last_event` | Event log | All agents |
| `reindex_campaign` | Markdown → DB sync | Session start |

### Bestiary MCP (archclaude-bestiary)

| Tool | Purpose | Used by |
|------|---------|---------|
| `find_monsters` | Search SRD by CR/type/env | Encounter Builder |
| `get_stat_block` | Full monster stat block | Combat Director |
| `find_spells` | Search spells | Combat Director |
| `get_spell` | Full spell description | Combat Director |
| `get_condition` | Condition rules | Combat Director |
| `list_homebrew` | Campaign homebrew | Encounter Builder |

## Data Flow

```
Player input → Orchestrator → [mode detection]
                  ↓
    ┌─────────────┼──────────────┐
    ↓             ↓              ↓
 Exploration   Roleplay     Combat
    ↓             ↓              ↓
 State MCP    State MCP    Combat Director
 (locations,  (NPCs,       (sub-agent)
  clock,       quests,          ↓
  memory)      secrets)    State MCP + Bestiary MCP
                           (damage, conditions,
                            stat blocks, spells)
```

## System Boundaries

| What | Where | Why |
|------|-------|-----|
| All "thinking" (narration, tactics, mode detection) | Claude via Cowork | Uses the user's subscription, no API keys |
| Persistent campaign state | SQLite via State MCP | Cowork can't do queryable persistent state |
| SRD reference data | Local cache via Bestiary MCP | Offline, fast, no API dependency |
| Human-readable content | Markdown files | DM can hand-edit between sessions |

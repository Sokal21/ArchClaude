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
    },
    "archclaude-map": {
      "command": "node",
      "args": ["<repo>/packages/map/dist/index.js", "--campaign", "<campaign-dir>"],
      "env": {}
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

### Map MCP (archclaude-map)

WebSocket server on port 3100 for the TV display renderer.

| Tool | Purpose | Used by |
|------|---------|---------|
| `create_map` / `get_map` / `clear_map` / `save_map` | Map lifecycle | Orchestrator |
| `place_token` / `move_token` / `remove_token` | Token management | Combat Director |
| `set_token_visibility` / `update_token_conditions` | Token state | Combat Director |
| `set_terrain` / `set_terrain_rect` | Terrain placement | Orchestrator / Encounter Builder |
| `measure_distance` | Distance between tokens (5e Chebyshev) | Combat Director |
| `get_visible` | Line-of-sight check through walls | Combat Director |
| `query_in_range` | Find tokens within range | Combat Director |
| `apply_aoe` | AoE shapes (circle/cone/line/cube) | Combat Director |
| `broadcast_narration` | Send narration to TV display | Orchestrator |
| `broadcast_initiative` | Update initiative bar on TV | Combat Director |
| `broadcast_party_status` | Update party HP bars on TV | Combat Director |

### TV Display (http://localhost:3200)

Web app that renders the battle map, initiative tracker, party status, and narration feed.
Start with: `pnpm --filter @archclaude/tv-display start`

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
  memory)      secrets)    State MCP + Bestiary MCP + Map MCP
                           (damage, conditions, positions,
                            stat blocks, spells, LoS, AoE)
                                 ↓ (WebSocket)
                           TV Display (map, initiative, HP, narration)
```

## System Boundaries

| What | Where | Why |
|------|-------|-----|
| All "thinking" (narration, tactics, mode detection) | Claude via Cowork | Uses the user's subscription, no API keys |
| Persistent campaign state | SQLite via State MCP | Cowork can't do queryable persistent state |
| SRD reference data | Local cache via Bestiary MCP | Offline, fast, no API dependency |
| Human-readable content | Markdown files | DM can hand-edit between sessions |

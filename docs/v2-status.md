# ArchClaude v2 — Implementation Status

> Current state of the v2 plan. Use this to resume work in a new session.

---

## What's done

### v1 (Phases 0–5) — Architecture built
- 9 packages, 3 MCP servers, 8 skills, starter campaign
- 51 unit tests passing, all packages build clean
- See git log for full history

### v2 Phase 1A — MCP wiring + path resolution (DONE)
- Created `.claude/settings.json` with state-mcp, bestiary, map configs
- Fixed `path.resolve()` in all 3 MCP server entry points
- Commit: `0143588`

### v2 Phase 1B — Campaign initialization fixes (DONE)
- Indexer now creates PC records from `characters/*.md` frontmatter
- Created `packages/state/src/seed-secret-loader.ts` — imports seeds.json + secrets.md
- `archclaude init` now auto-indexes content + loads seeds/secrets
- Added `archclaude reindex <folder>` CLI command
- Starter campaign DB verified: 3 PCs, 2 NPCs, 3 locations, 4 seeds, 4 secrets, 35 memory chunks
- Commit: `0143588`

### v2 Phase 2C — D&D rules enforcement (DONE)
- Migration 0002: death_save_successes, death_save_failures, concentrating_on on pcs table
- PC DAL: recordDeathSave, resetDeathSaves, longRest, shortRest, tickConditions
- 6 new MCP tools: record_death_save, reset_death_saves, long_rest, short_rest, tick_conditions, set_concentration
- Commit: `9c5803a`

---

### v2 Phase 1C — Integration tests (DONE)
- 24 integration tests across 3 MCP servers (state-mcp: 13, map: 5, bestiary: 6)
- Spawn real server processes, connect via StdioClientTransport, call tools, assert results
- Total test count: 75 (was 51)
- Commit: `3a674fd`

### v2 Phase 1D — Bestiary auto-cache (DONE)
- Auto-pulls SRD cache on first start instead of hard-exiting
- Commit: `4cd536d`

### v2 Phase 2A-B — Skill prompt hardening (DONE)
- DM Orchestrator rewritten with mandatory tool usage, explicit command→tool mapping, session checklists
- Combat Director rewritten with death save protocol, concentration saves, condition ticking
- Commit: `4cd536d`

### v2 Phase 2D — Session readiness check (DONE)
- `archclaude check <folder>` — 9 checks, all passing on starter campaign
- Commit: `4cd536d`

### Codebase modernization (DONE)
- Migrated 55 `server.tool()` → `server.registerTool()` across all 3 MCP servers
- Commit: `3232265`

### v2 Phase 3 — Player UI Integration (DONE)
- Migration 0003: action_queue table
- ActionQueueDAL: enqueue, dequeue, peek, listPending, markProcessed, clearProcessed
- 5 MCP tools: get_pending_actions, dequeue_action, submit_action, mark_action_processed, clear_processed_actions
- Map WebSocket now handles incoming player/DM events and routes to action queue
- Commit: `6bb27e1`

### v2 Phase 4 — Metabase Dashboard (DONE)
- SRD JSON → SQLite import script (322 monsters, 319 spells, 15 conditions)
- Docker Compose for Metabase on port 3007
- Two data sources: campaign.db (live) + bestiary.db (static)
- Full setup guide at docs/metabase-setup.md
- Commit: `ef0ec24`

---

## What's pending

### v2 Phase 5 — Data Quality
- Bestiary search tests + CR normalization
- Runtime dependency checks for voice service
- Graceful degradation for map MCP WebSocket port conflicts

### v2 Phase 6 — Voice
- Create `stt_bridge.py` for mic→faster-whisper pipeline
- Fix TTS platform detection (macOS: `afplay`, Linux: `aplay`, cross-platform: `ffplay`)
- Audio dependency checks

### Future ideas
- CI/CD pipeline (GitHub Actions for build + test)
- Campaign export/import (zip a campaign folder for sharing)
- Multi-campaign management CLI
- Per-player phone view (read-only character sheet over LAN)
- Undo/replay tooling surfaced in Player UI

---

## Architecture Overview

```
archclaude/
├── packages/
│   ├── shared/         # Types, events, campaign layout constants
│   ├── state/          # SQLite DAL (14 tables), indexer, entity tagger, query rewrite, secret filter, seed evaluator
│   ├── state-mcp/      # Campaign State MCP (41+ tools) — the main data interface for Claude
│   ├── bestiary/       # Bestiary MCP (Open5e SRD cache, monster/spell/condition search)
│   ├── map/            # Map MCP (spatial engine, WebSocket on port 3100)
│   ├── cli/            # `archclaude init|doctor|reindex`
│   ├── voice/          # STT/TTS bridge (STUB — not functional)
│   ├── tv-display/     # Canvas battle map + HUD (port 3200)
│   └── player-ui/      # Action composer + DM injection (port 3400)
├── skills/             # SKILL.md files for Cowork
│   ├── dm-orchestrator/    # The brain — mode detection, session flow
│   ├── combat-director/    # Combat loop, monster tactics, round management
│   ├── encounter-builder/  # Encounter design with XP budgets
│   ├── bestiary/           # Token-efficient monster lookup
│   ├── lore-memory/        # FTS recall, secret handling
│   ├── campaign-import/    # Structured markdown from DM notes
│   ├── recap-generator/    # Cinematic cold-open narrations
│   └── session-summary/    # Structured session writeups
��── examples/
│   └── starter-campaign/   # "The Hollow Wood" — ready to play
└── docs/
    ├── campaign-state-schema.md
    ├── map-mcp-contract.md
    ├── mcp-setup.md
    └── implementation-roadmap.md
```

## Key decisions
- **No event bus** — SQLite action queue + MCP polling matches Claude's request/response pattern
- **No rules engine** — Claude adjudicates via skill prompts; code only tracks mechanical state
- **No custom parser** — Claude parses /dm, /action, /roll commands through skill prompts
- **Voice deferred** — text-only first, voice layers on top once core loop works

## How to resume
1. `pnpm build && pnpm test` — verify everything still works
2. Check `bd ready` for open beads issues
3. Pick up the highest-priority pending item from this doc
4. The v2 plan file is also at `.claude/plans/wise-inventing-kernighan.md`

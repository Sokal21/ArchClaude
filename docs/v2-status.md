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

---

## What's pending

### v2 Phase 3 — Player UI Integration (NEXT)
**Action queue:** SQLite table for player actions. Player UI → map WebSocket → action queue → Combat Director polls via `get_pending_actions`.

**Files to create:**
- `packages/state/src/migrations/0003_action_queue.sql`
- `packages/state/src/dal/action-queue.ts`
- `packages/state-mcp/src/tools/action-queue.ts`

**Files to modify:**
- `packages/map/src/index.ts` — add `ws.on("message")` handler for incoming player events

### v2 Phase 4 — Data Visualization Dashboard (NEW)
**Why:** All campaign data lives in SQLite (events, PCs, NPCs, quests, combats, memory chunks, seeds, secrets) and JSON files (SRD monsters, spells, conditions) but there's no way to browse it outside of MCP tool calls or raw SQL. A visual dashboard would let the DM review session history, browse the bestiary, inspect the event log, and monitor campaign state between sessions.

**Approach: Metabase (no custom UI code)**

Metabase connects to SQLite natively. One Docker container, point it at the campaign DB, get instant dashboards.

**Setup:**
```bash
docker run -d -p 3000:3000 \
  -v /Users/tomaslopez/Personal/ArchClaude/examples/starter-campaign:/campaign \
  --name archclaude-metabase \
  metabase/metabase
```
Then add the SQLite database at `/campaign/campaign.db` as a data source in Metabase.

**Suggested dashboards:**
1. **Campaign Overview** — session count, total events, PC status summary, active quests
2. **Event Log** — filterable table of all events (type, source, timestamp, payload), timeline chart
3. **Combat History** — combats by session, outcomes, rounds fought, damage dealt
4. **PC Tracker** — HP over time, conditions applied/removed, death save history, spell slot usage
5. **NPC Registry** — all NPCs with status, location, faction, introduction session
6. **World Map** — locations by type/status, faction reputations
7. **Memory Search** — browse memory chunks by kind, source file, tags
8. **Seeds & Secrets** — planted/triggered seeds, hidden/revealed secrets

**For the SRD bestiary** (JSON files, not in SQLite):
- Option A: Import monsters.json/spells.json into the campaign SQLite as read-only tables (one-time script)
- Option B: Use a separate SQLite DB at `~/.archclaude/srd-cache/bestiary.db` that Metabase also connects to
- Option C: Keep using the Bestiary MCP for lookups, use Metabase only for campaign data

**Files to create:**
- `scripts/metabase-setup.sh` — Docker run command + initial config
- `scripts/import-srd-to-sqlite.ts` — optional: import SRD JSON into a SQLite DB for Metabase browsing
- `docs/metabase-setup.md` — setup guide with dashboard templates

### v2 Phase 5 — Data Quality (DEFERRED)
- Bestiary search tests + CR normalization
- Runtime dependency checks for voice service
- Graceful degradation for map MCP WebSocket port conflicts

### v2 Phase 6 — Voice (DEFERRED)
- Create `stt_bridge.py` for mic→faster-whisper pipeline
- Fix TTS platform detection (macOS: `afplay`, Linux: `aplay`, cross-platform: `ffplay`)
- Audio dependency checks

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

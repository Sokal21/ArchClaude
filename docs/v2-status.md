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

## What's pending

### v2 Phase 1C — Integration tests (HIGH PRIORITY)
**Why:** Zero tests verify MCP servers work at runtime. Only unit tests exist.

**What to do:**
- Create `packages/state-mcp/src/__tests__/integration.test.ts` — spawn MCP server as child process, connect via `@modelcontextprotocol/sdk` Client + `StdioClientTransport`, call tools (start_session, list_pcs, apply_damage, start_combat, recall_memory), assert results
- Create `packages/bestiary/src/__tests__/integration.test.ts` — find_monsters, get_stat_block (skip if SRD cache not populated)
- Create `packages/map/src/__tests__/integration.test.ts` — create_map, place_token, move_token, measure_distance, apply_aoe
- Add `@modelcontextprotocol/sdk` as devDependency to these packages
- Beads issue: `ArchClaude-fu9`

### v2 Phase 1D — Bestiary auto-cache (MEDIUM)
**Why:** Bestiary MCP hard-exits if SRD cache is missing. Users must manually run `cache:pull`.

**What to do:**
- Modify `packages/bestiary/src/index.ts` — instead of `process.exit(1)` when cache missing, attempt `pullCache()` automatically with a warning. Fall back to exit if network fails.
- Beads issue: `ArchClaude-3j9`

### v2 Phase 2A-B — Skill prompt hardening + sub-agent spawning (HIGH)
**Why:** Skills describe the behavior but lack explicit tool mappings and Task spawning instructions.

**What to do:**
- Modify `skills/dm-orchestrator/SKILL.md`:
  - Add explicit command→tool table: `/dm secret` → `inject_dm_secret(topic, text)`, `/dm public` → `add_memory`, `/dm seed` → `plant_seed`, `/action` → resolve mechanically, `/say` → roleplay, `/roll` → skill check
  - Add session start checklist as numbered tool calls
  - Add concrete Task creation instructions for Combat Director (prompt template, context to pass, return contract)
  - Add example user interactions with expected orchestrator behavior
- Modify `skills/combat-director/SKILL.md`:
  - Add Task entry contract (what inputs it receives from orchestrator, what it returns)
  - Add concentration save protocol: "After damage to a concentrating PC, prompt CON save DC = max(10, damage/2), if failed call remove_condition + set_concentration(null)"
  - Add death save protocol: "At 0 HP, call record_death_save per turn, 3 successes = stabilize, 3 failures = dead"
  - Add `tick_conditions` call at the start of each round
  - Add `get_pending_actions` polling during PC turns (for Player UI integration)
- Beads issue: `ArchClaude-4uz`

### v2 Phase 2D — Session readiness check CLI (LOW)
**What to do:**
- Create `packages/cli/src/commands/check.ts` — `archclaude check <folder>`
- Validates: DB exists + has content, bestiary cache populated, `.claude/settings.json` has MCP config, all packages built (dist/ dirs exist)
- Register in `packages/cli/src/cli.ts`
- Beads issue: `ArchClaude-8q3`

### v2 Phase 3 — Player UI Integration (DEFERRED)
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

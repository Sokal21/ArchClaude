# Implementation Roadmap (v0.1)

> The order we build things in, and how we know each step is done.
> Companion to [campaign-state-schema.md](./campaign-state-schema.md).

---

## Operating principles

1. **Vertical slices over horizontal layers.** Each phase produces something *playable* — never a six-month build with a single integration test at the end.
2. **The first playable is text-only.** No voice, no map, no UI. Just the agent architecture, theater of mind, run at the table. This validates the brain before we wrap it in skin.
3. **Each phase ends with a session smoke test.** Real friends, real session, see what breaks. Roadmap items survive contact with the table or they get rewritten.
4. **Skills and prompts are code.** They're versioned, tested, and iterated on. Don't treat them as configuration.
5. **Defer everything you can.** Vector memory, embeddings, voice profile management, undo tooling — all valuable, all postponable. They land in Phase 5, not Phase 1.

---

## What's Claude, what's not

Before the tech stack: a clean line between Claude's job and everything else.

**Claude (via Cowork) does all the thinking** — narration, dialogue, mode detection, encounter design, monster tactics, NPC roleplay, recap writing, summary generation, rules adjudication. Every "agent" and "skill" in this project lives inside the Cowork session and runs on the user's subscription. No API tokens.

**The other components exist only because Cowork can't do those specific jobs:**

| Job | Why not Cowork | Component |
|-----|----------------|-----------|
| Speech-to-text | Cowork doesn't accept audio input | Voice service (`faster-whisper`) |
| Text-to-speech | Cowork doesn't synthesize voice | Voice service (ElevenLabs / Piper) |
| Persistent campaign DB | Cowork has files but no queryable state | Campaign State MCP |
| Spatial battle map | Not a Cowork capability | Map MCP + renderer |
| Visual table HUD | Cowork's chat UI isn't a TV display | TV display app |
| Action submission | Need structured input fast during combat | Player UI |

Everything else (encounter math, monster tactics, narration text, summary writing, recall over campaign memory) is Claude's job, done via skills and sub-agents inside Cowork.

## Tech stack (proposed — push back if you'd prefer otherwise)

| Layer | Choice | Why |
|-------|--------|-----|
| Server runtime | Node + TypeScript | You said Node; TS gives type safety across MCP tool surfaces |
| Database | SQLite via `better-sqlite3` | One file per campaign, dead simple, fast |
| Memory recall | SQLite FTS5 + entity tagging | Full-text search is built in; no embedder, no extra service. Claude rewrites queries into keyword variants when needed. |
| MCP framework | `@modelcontextprotocol/sdk` | Official, Node-native |
| Skills | Markdown `SKILL.md` files | Standard Cowork skill format |
| Web UIs (early) | Plain HTML + vanilla JS | Fast to iterate; upgrade to React/Svelte only when it earns it |
| TTS | ElevenLabs (cloud) or Piper (local) | ElevenLabs for voice variety; Piper if going fully offline |
| STT | `faster-whisper` local | Good accuracy, runs on a beefy laptop, no cloud dependency |
| Bus / IPC | WebSocket + a tiny event bus | All UIs subscribe to the same event stream |

The project is fully self-hostable except for ElevenLabs (swap to Piper if that matters). No external LLM API beyond Cowork itself; no embedding API; no cloud database.

---

## Repo structure

```
archclaude/
├── packages/
│   ├── state/          # Campaign State MCP + DAL + markdown indexer
│   ├── map/            # Map MCP + battle map renderer
│   ├── bestiary/       # Bestiary MCP wrapping Open5e (+ local cache)
│   ├── voice/          # STT/TTS bridge service
│   ├── tv-display/     # Shared TV-mode display app
│   ├── player-ui/      # Designated-player action UI
│   ├── cli/            # `archclaude init`, dev tools
│   └── shared/         # types, schema, event definitions, utilities
├── skills/             # SKILL.md files: combat-director, encounter-builder, lore-memory, ...
├── docs/               # design docs
└── examples/
    └── starter-campaign/   # a small adventure used as the smoke-test corpus
```

---

## Phase 0 — Foundations

**Goal:** empty rails ready to build the game on.

| # | Task | Notes |
|---|------|-------|
| 0.1 | Monorepo skeleton (pnpm/turborepo, TS, ESLint, Vitest) | Boring but worth doing right once |
| 0.2 | SQLite schema implementation (per `campaign-state-schema.md`) | DDL + migration `0001_init.sql` |
| 0.3 | Typed DAL (`@archclaude/state`) | One module per table, typed reads/writes, no raw SQL outside this package |
| 0.4 | Event log helpers | `append(event)`, `project()`, `revert(event_id)`; covered by tests |
| 0.5 | Markdown indexer | YAML frontmatter → DB row sync; body → `memory_chunks` (without embeddings yet) |
| 0.6 | `archclaude init <folder>` CLI | Bootstraps the folder layout with a stub `campaign.json` and empty subfolders |
| 0.7 | `archclaude doctor <folder>` | Validates a folder is a well-formed campaign (folders present, schema version match, frontmatter valid) |

**Acceptance:**
- `archclaude init test-campaign/` creates the full folder structure.
- `archclaude doctor test-campaign/` returns clean.
- DAL has unit tests covering CRUD on every table.
- Event log can append, project current state, and revert events.

**Dependencies:** none.

---

## Phase 1 — Text-only first playable

**Goal:** run a real session at the table with friends. No voice, no map, no UI. Type into chat, hear it back as text, theater of mind. This is the integration moment for the agent architecture.

| # | Task | Notes |
|---|------|-------|
| 1.1 | **Campaign State MCP** | Exposes DAL as MCP tools: `get_pc`, `get_combatant`, `list_active_quests`, `apply_damage`, `apply_condition`, `advance_turn`, `start_combat`, `end_combat`, `recall_memory(query)`, `inject_dm(text, kind)`, etc. |
| 1.2 | **Bestiary MCP** | Wraps Open5e API with local cache. Tools: `find_monsters({cr, env, tags, count})`, `get_stat_block(key)`, `list_homebrew()` |
| 1.3 | **Open5e local cache** | One-time pull of SRD 5.2 monsters + spells + conditions to `~/.archclaude/srd-cache/` |
| 1.4 | **Bestiary skill** (`skills/bestiary/SKILL.md`) | Describes when/how to use the Bestiary MCP — token-efficient encounter design |
| 1.5 | **Lore Memory skill v0** | Naive: keyword search over markdown files via `recall_memory`. Vector search lands in Phase 5. |
| 1.6 | **Campaign-import skill** | Accepts DM notes (pasted or file path); drafts NPCs/locations/lore as markdown frontmatter+prose; the DM reviews/edits |
| 1.7 | **Encounter Builder skill** | Given party comp + narrative cue + intensity + difficulty, proposes a fight (monsters, terrain hint, objective). Calls Bestiary; returns a plan, doesn't commit. |
| 1.8 | **Combat Director sub-agent** (`skills/combat-director/SKILL.md`) | Spawned via Task. Runs initiative, queries combatants, applies damage/conditions, narrates monster turns at the requested intensity, decides outcome. |
| 1.9 | **DM Orchestrator skill** | The brain. Mode detection (exploration / roleplay / combat / downtime). Routes player input. Decides when to call initiative. Sets narration intensity. Triggers seed evaluation on scene change. |
| 1.10 | **DM injection channel** | Chat-command lane: `/dm public <text>`, `/dm secret <text>`, `/dm override <text>`, `/dm seed <text> [trigger]`. |
| 1.11 | **Player input channel** | Players type `/action`, `/say`, `/roll N for X`. Tagged with player identity from context. |
| 1.12 | **Starter campaign** | A small adventure (a village, an inn, a dungeon, 2 combats, 1 plot twist) used as the persistent smoke-test corpus. |

**Acceptance:**
- Play a 90-minute session with friends. Text only.
- HP and conditions track correctly through a fight.
- A combat starts cleanly from a tense scene and ends with the right outcome (victory / fled / negotiated).
- A `/dm secret` injection is referenced in narration without being revealed.
- The orchestrator never asks the player a question the state app can answer.
- After the session, the markdown summary is decent enough that the human DM only needs light edits.

**Dependencies:** Phase 0.

**Risk to watch:** token budget. The orchestrator's context will balloon if too much state pushes through it instead of being pulled via tools. If tokens get tight here, the fix is more aggressive tool-based access, not a bigger context window.

---

## Phase 2 — Visual battle map

**Goal:** replace theater-of-mind combat with a TV-displayed map the table looks at.

| # | Task | Notes |
|---|------|-------|
| 2.1 | **Map MCP tool surface doc** | Same treatment as the state schema — design the contract first |
| 2.2 | **Map MCP server** | Node service. Owns spatial state in-memory; snapshots to disk per fight. Tools: `create_map`, `place_token`, `move_token`, `set_terrain`, `measure_distance`, `get_visible(from)`, `query_in_range(from, range)`, `apply_aoe(shape, origin)` |
| 2.3 | **Map renderer (web app)** | Connects via WebSocket. Renders grid, tokens, terrain, AoE templates. |
| 2.4 | **TV display shell** | Wraps the map renderer with the HUD: initiative bar, party status, scene image area, narration text feed |
| 2.5 | **Combat Director uses map tools** | Updates so the agent reasons about distance/LoS via tool calls instead of imagining positions |
| 2.6 | **Click-to-move integration** | Designated player can click a destination; the click becomes a `pc_action_submitted` event |
| 2.7 | **Token assets** | A small library of placeholder tokens; ability to upload custom NPC portraits to `assets/npc_portraits/` |

**Acceptance:**
- Same starter campaign, now with visible combat.
- Agents stop hallucinating positions; LoS and range come from tool calls.
- The table watches the TV during a fight without needing the orchestrator to re-narrate spatial details.

**Dependencies:** Phase 1.

---

## Phase 3 — Voice

**Goal:** Claude speaks; players speak. Hands stay on dice and snacks.

| # | Task | Notes |
|---|------|-------|
| 3.1 | **Voice service** | Node process bridging STT/TTS to the orchestrator and TV display |
| 3.2 | **STT pipeline** | `faster-whisper` local. Push-to-talk per device. Audio in → tagged transcript out. |
| 3.3 | **TTS pipeline** | ElevenLabs streamed TTS (or Piper for offline). Streams audio while the LLM is still generating. Latency budget: < 2s from end-of-utterance to start-of-narration. |
| 3.4 | **Voice profile registry** | `npcs.voice_profile` is a key into a per-campaign profiles table; system narrator has a default profile |
| 3.5 | **STT cleanup pass** | Verbose audio transcript → clean structured turn (small local model or rules) before reaching the orchestrator. Token-saver. |
| 3.6 | **Mic management** | Initially one shared mic + push-to-talk button per player on the same machine; structure the protocol so multi-device LAN is a Phase-4 add-on |

**Acceptance:**
- A session played mostly hands-free.
- Major NPCs have distinct, consistent voices across two sessions.
- Narration starts within ~2s of player utterance ending.
- STT misses get masked by the on-screen narration text from Phase 2.

**Dependencies:** Phase 2.

---

## Phase 4 — Player UI

**Goal:** structured action submission for combat (faster, more accurate); voice stays for roleplay and rules questions.

| # | Task | Notes |
|---|------|-------|
| 4.1 | **Designated-player UI** (web app on the PC driving the TV) | Action composer (attack / spell / ability), dice-roll input fields, initiative & turn display, party HP/conditions side panel, DM-injection lane for the human DM if present |
| 4.2 | **Action submission protocol** | UI events → structured `pc_action_submitted` events on the bus |
| 4.3 | **Quick-roll templates** | Per-PC saved actions ("longsword attack", "fireball L3") to one-click during their turn |
| 4.4 | **Per-PC phone view** (deferred sub-task) | Read-only character details accessible over LAN; lands here or in Phase 5 |

**Acceptance:**
- Combat actions are submitted via UI, not voice. Round time drops noticeably.
- Voice channel handles roleplay and rules questions.
- The human DM (if there is one at the table) has a working secret-injection path.

**Dependencies:** Phase 3.

---

## Phase 5 — Memory, polish, & session craft

**Goal:** the system feels good across week-long gaps and dozens of sessions.

| # | Task | Notes |
|---|------|-------|
| 5.1 | **FTS5 over markdown** | SQLite full-text-search index over `memory_chunks` and dossier prose. Built-in, no extra service. |
| 5.2 | **Entity tagging on index** | When indexing markdown, extract entity references (NPCs, locations, factions) and store as tags on chunks. Enables `recall_memory(query, tags=[...])`. |
| 5.3 | **Query rewrite in Lore Memory skill** | Claude rephrases natural-language recall queries into multiple keyword variants before searching — covers most of the ground embeddings would. |
| 5.4 | **Recap generator skill** | High-quality cinematic recap played at session start. 60–90s TTS. Cold open of session N+1. |
| 5.5 | **Session summary generator** | End-of-session writeback: markdown summary, structured fact extraction, quest state updates, key-events list |
| 5.6 | **Seed evaluator** | On scene change / location entry, check `seeds.trigger_condition`; surface triggered seeds to the orchestrator |
| 5.7 | **Secret filter** | Every narration-bound output runs through a filter that flags accidental leakage of `dm_inject_secret` content |
| 5.8 | **Difficulty tuner** | Encounter Builder takes depleted resources / party comp into account, not just raw CR/XP budget |
| 5.9 | **Undo/replay tooling** | Surface the event log to the designated player UI for "wait, redo that" moments |
| 5.10 | **NPC voice consistency check** | Verify same `voice_profile` across sessions; warn on accidental drift |

> **Embeddings deferred indefinitely.** FTS5 + entity tagging + query rewrite covers the realistic recall load for a tabletop campaign (a few thousand chunks at most). If the project ever outgrows that, we can add embeddings via a local model — but that's a problem for future-us, not v1.

**Acceptance:**
- Session 8 references something from session 2 unprompted, correctly, in a moment that feels intentional.
- Recap at session start lands well — the table laughs and gasps in the right spots.
- A `/dm secret` from session 4 still hasn't leaked by session 12.
- Encounters feel calibrated even when the party is on resource fumes.

**Dependencies:** Phase 4.

---

## Cross-cutting workstreams (run alongside all phases)

- **Skill prompt iteration.** After each session, log which prompts misfired and tune. Treat skills as a living codebase.
- **Open5e cache refresh.** Quarterly pull to catch SRD updates.
- **Schema migrations.** Versioned from day one; never edit `0001_init.sql`.
- **Telemetry.** Log every tool call, every sub-agent invocation, with timing. Used to find the slow paths and the chatty prompts.
- **Documentation.** Each phase ends with a doc update (this file, the schema, the map MCP doc).

---

## Risk register

| Risk | Mitigation |
|------|------------|
| Orchestrator context bloat in Phase 1 | Lean hard on tools; resist pushing state into the prompt |
| Mode transitions feel janky (peace → combat) | Budget extra prompt-tuning time in Phase 1; this is the single hardest piece |
| STT accuracy at a noisy table | Push-to-talk per player; on-screen narration text as fallback |
| NPC voice drift across sessions | Voice profiles persisted; consistency check in Phase 5 |
| Players reject AI DM in scenes that need warmth | Have a graceful human-DM handoff path: any `/dm override` immediately bypasses the orchestrator's call |
| WotC content boundaries | SRD only via Open5e; never ingest copyrighted PDFs |
| Latency kills immersion | Streaming TTS, parallel tool calls, output length budgets per skill |

---

## What's next after this roadmap

Once Phase 0 + 1 are scoped, the next design docs to draft are:

1. **Map MCP tool surface** — the contract for Phase 2.
2. **Skill prompt templates** — initial prompts for each of the Phase 1 skills, with token budgets and output schemas.
3. **Event protocol** — exact shape of every event type on the bus.

But none of those are blockers for starting Phase 0 today.

---

## Suggested first sprint (the next ~2 weeks of work)

A concrete starting point if you want to begin coding:

1. Repo skeleton + tooling (Day 1)
2. SQLite schema + DAL + tests (Days 2–3)
3. Event log + tests (Day 4)
4. Markdown indexer (Day 5)
5. `archclaude init` + `doctor` (Day 6)
6. **Phase 0 acceptance check** (end of week 1)
7. Open5e cache + Bestiary MCP (Days 7–8)
8. Campaign State MCP — minimal toolset (Days 9–10)
9. First skill: `bestiary` (Day 11)
10. Stub starter campaign + manual smoke test of the MCP wiring with Cowork (Day 12)

That gets you to "Cowork can call into the campaign state and bestiary" — the foundation for everything in Phase 1.

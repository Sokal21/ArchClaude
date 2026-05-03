# Campaign State Schema (v0.1)

> The contract every other component reads from and writes to.
> A campaign **is** a folder. Point the app at a folder, that's the campaign. There is no cross-campaign state.

---

## 1. Design philosophy

Three rules drive the choices below:

1. **Hybrid storage.** SQLite holds queryable, frequently-mutated state and the event log. Markdown files hold human-readable narrative content the DM can hand-edit between sessions. Both reconcile through a defined write-back path.
2. **Append-only event log is truth.** Every state change is an event; tables are projections of the log. This gives us undo/redo at the table, replay for debugging, and a clean source for recap generation.
3. **Pull, don't push.** Agents query small slices of state through tools rather than receiving big state blobs in context. Token efficiency falls out of this.

---

## 2. Folder layout

```
my-campaign/
├── campaign.json              # top-level metadata (name, system, schema_version)
├── campaign.db                # SQLite: structured state, event log, vector index
├── sessions/
│   ├── session_01.md          # human-readable session summary
│   ├── session_02.md
│   ├── recap_02.md            # cinematic recap played at start of session 2
│   └── ...
├── characters/
│   ├── tharivol.md            # PC dossier (backstory, hooks, voice notes)
│   └── ...
├── npcs/
│   ├── vincent_blackwood.md   # NPC dossier
│   └── ...
├── locations/
│   ├── goldspire.md
│   └── ...
├── lore/
│   ├── factions.md            # background world content
│   ├── pantheon.md
│   └── ...
├── secrets.md                 # DM-only notes, hidden from narration
├── seeds.json                 # foreshadowing with trigger conditions (also mirrored in DB)
├── homebrew/
│   ├── monsters.json          # custom stat blocks
│   └── items.json
└── assets/
    ├── npc_portraits/
    └── scene_images/
```

Markdown files are owned by the human DM. The system reads them, indexes them into vector memory, and surfaces them through tools — but never silently rewrites them. When the system generates a session summary, it writes a *new* file (`session_NN.md`); if the DM edits it later, the next re-index picks up the changes.

---

## 3. SQLite schema

```sql
-- =========================================================================
-- 3.1 Metadata & sessions
-- =========================================================================

CREATE TABLE campaign (
    id              INTEGER PRIMARY KEY CHECK (id = 1),
    name            TEXT    NOT NULL,
    system          TEXT    NOT NULL DEFAULT '5e-2024',
    schema_version  INTEGER NOT NULL DEFAULT 1,
    created_at      TEXT    NOT NULL
);

CREATE TABLE sessions (
    id              INTEGER PRIMARY KEY,
    number          INTEGER UNIQUE NOT NULL,
    played_at       TEXT,
    ended_at        TEXT,
    summary_file    TEXT,           -- 'sessions/session_03.md'
    recap_file      TEXT,           -- 'sessions/recap_04.md' (recap played at start of next session)
    key_events_json TEXT            -- compact list of standout events for fast recall
);

-- =========================================================================
-- 3.2 Player characters (combat-relevant cache; full sheet stays with player)
-- =========================================================================

CREATE TABLE pcs (
    id                INTEGER PRIMARY KEY,
    name              TEXT UNIQUE NOT NULL,
    player_name       TEXT,
    class             TEXT,
    subclass          TEXT,
    level             INTEGER NOT NULL,
    max_hp            INTEGER NOT NULL,
    current_hp        INTEGER NOT NULL,
    temp_hp           INTEGER NOT NULL DEFAULT 0,
    ac                INTEGER NOT NULL,
    initiative_bonus  INTEGER NOT NULL DEFAULT 0,
    speed_walk        INTEGER NOT NULL DEFAULT 30,
    speed_fly         INTEGER          DEFAULT 0,
    speed_swim        INTEGER          DEFAULT 0,
    senses_json       TEXT,            -- {"darkvision":60,"passive_perception":14}
    saves_json        TEXT,            -- {"str":2,"dex":4,"con":3,"int":-1,"wis":2,"cha":5}
    spell_slots_json  TEXT,            -- {"max":{"1":4,"2":2},"current":{"1":2,"2":1}}
    resistances_json  TEXT,
    immunities_json   TEXT,
    conditions_json   TEXT,            -- ["poisoned:2","prone"]   (turns remaining after colon)
    dossier_file      TEXT,            -- 'characters/tharivol.md'
    voice_profile     TEXT,            -- TTS voice id for in-character narration
    active            INTEGER NOT NULL DEFAULT 1,
    notes             TEXT
);

-- =========================================================================
-- 3.3 NPCs (recurring named characters)
-- =========================================================================

CREATE TABLE npcs (
    id                  INTEGER PRIMARY KEY,
    name                TEXT UNIQUE NOT NULL,
    role                TEXT,                    -- 'innkeeper','rival','patron','BBEG'
    status              TEXT NOT NULL DEFAULT 'alive',  -- alive|dead|missing|unknown
    current_location    TEXT,
    faction             TEXT,
    voice_profile       TEXT,
    dossier_file        TEXT,
    introduced_session  INTEGER,
    notes_summary       TEXT
);

-- =========================================================================
-- 3.4 Combat: instances, encounters, initiative
-- =========================================================================

CREATE TABLE combats (
    id                  INTEGER PRIMARY KEY,
    session_id          INTEGER NOT NULL,
    started_at          TEXT NOT NULL,
    ended_at            TEXT,
    outcome             TEXT,            -- victory|defeat|fled|negotiated|aborted
    initiative_json     TEXT,            -- ordered [{actor_kind,actor_id,init},...]
    current_turn        INTEGER NOT NULL DEFAULT 0,  -- index into initiative_json
    round_number        INTEGER NOT NULL DEFAULT 1,
    intensity           TEXT NOT NULL DEFAULT 'normal',  -- terse|normal|tense|climax
    difficulty          TEXT,            -- easy|medium|hard|deadly
    narrative_context   TEXT,            -- what led to this fight
    FOREIGN KEY (session_id) REFERENCES sessions(id)
);

-- A monster (or named NPC) participating in a combat
CREATE TABLE npc_instances (
    id              INTEGER PRIMARY KEY,
    combat_id       INTEGER NOT NULL,
    npc_id          INTEGER,             -- NULL for ad-hoc monsters; set for recurring NPCs
    template_key    TEXT,                -- 'srd:goblin' or 'homebrew:bbeg_v2'
    display_name    TEXT NOT NULL,       -- 'Goblin 1', 'Mordax the Cruel'
    max_hp          INTEGER NOT NULL,
    current_hp      INTEGER NOT NULL,
    ac              INTEGER NOT NULL,
    conditions_json TEXT,
    map_token_id    TEXT,                -- handle into the Map MCP
    defeated        INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (combat_id) REFERENCES combats(id),
    FOREIGN KEY (npc_id)    REFERENCES npcs(id)
);

-- =========================================================================
-- 3.5 World: locations, factions, quests, clock
-- =========================================================================

CREATE TABLE locations (
    id                  INTEGER PRIMARY KEY,
    name                TEXT UNIQUE NOT NULL,
    type                TEXT,            -- city|dungeon|wilderness|landmark|building|room
    parent_id           INTEGER,         -- nesting (room → dungeon → region)
    status              TEXT NOT NULL DEFAULT 'unknown',  -- unknown|known|visited|cleared|destroyed
    dossier_file        TEXT,
    introduced_session  INTEGER,
    FOREIGN KEY (parent_id) REFERENCES locations(id)
);

CREATE TABLE factions (
    id              INTEGER PRIMARY KEY,
    name            TEXT UNIQUE NOT NULL,
    reputation      INTEGER NOT NULL DEFAULT 0,    -- -10 hostile .. +10 allied
    status          TEXT,                           -- 'allied','hostile','neutral','unknown'
    dossier_file    TEXT
);

CREATE TABLE quests (
    id                  INTEGER PRIMARY KEY,
    title               TEXT NOT NULL,
    state               TEXT NOT NULL DEFAULT 'active',  -- active|completed|failed|dormant
    summary             TEXT,
    giver_npc_id        INTEGER,
    related_location_id INTEGER,
    introduced_session  INTEGER,
    resolved_session    INTEGER,
    notes_file          TEXT,
    FOREIGN KEY (giver_npc_id)        REFERENCES npcs(id),
    FOREIGN KEY (related_location_id) REFERENCES locations(id)
);

CREATE TABLE clock (
    id                  INTEGER PRIMARY KEY CHECK (id = 1),
    in_world_date       TEXT,            -- '14 Mirtul, 1492 DR'
    time_of_day         TEXT,             -- dawn|morning|midday|dusk|night|midnight
    weather             TEXT,
    current_location_id INTEGER,
    party_state         TEXT,             -- exploring|traveling|resting|in_combat|social|downtime
    FOREIGN KEY (current_location_id) REFERENCES locations(id)
);

-- =========================================================================
-- 3.6 Coarse inventory (notable items only)
-- =========================================================================

CREATE TABLE inventory (
    id          INTEGER PRIMARY KEY,
    owner_kind  TEXT    NOT NULL,         -- 'pc' | 'party'
    owner_id    INTEGER,                  -- pcs.id when owner_kind='pc'; NULL for 'party'
    name        TEXT    NOT NULL,
    kind        TEXT,                     -- 'magic_item','key_item','consumable','currency'
    description TEXT,
    qty         INTEGER NOT NULL DEFAULT 1,
    notes       TEXT
);

-- Mundane gear (torches, rations) is intentionally not modeled here.
-- It only matters for narrative; the DM mentions it via a public injection if needed.

-- =========================================================================
-- 3.7 Foreshadowing seeds & DM secrets
-- =========================================================================

CREATE TABLE seeds (
    id                  INTEGER PRIMARY KEY,
    text                TEXT NOT NULL,                  -- the hint to drop
    trigger_condition   TEXT,                            -- DSL or free text: 'party_at:Goldspire', 'session>=5'
    status              TEXT NOT NULL DEFAULT 'planted', -- planted|triggered|expired
    visibility          TEXT NOT NULL DEFAULT 'public',  -- public|secret
    planted_session     INTEGER,
    triggered_session   INTEGER
);

CREATE TABLE secrets (
    id                  INTEGER PRIMARY KEY,
    topic               TEXT,                            -- 'innkeeper_betrayal'
    text                TEXT NOT NULL,
    related_npc_id      INTEGER,
    related_location_id INTEGER,
    status              TEXT NOT NULL DEFAULT 'hidden',  -- hidden|partial_revealed|revealed
    added_session       INTEGER,
    FOREIGN KEY (related_npc_id)      REFERENCES npcs(id),
    FOREIGN KEY (related_location_id) REFERENCES locations(id)
);

-- =========================================================================
-- 3.8 Memory chunks (full-text recall + entity tagging)
-- =========================================================================

CREATE TABLE memory_chunks (
    id              INTEGER PRIMARY KEY,
    kind            TEXT NOT NULL,        -- session_summary|npc_note|lore|dialog|secret|seed
    text            TEXT NOT NULL,
    source_file     TEXT,                 -- markdown file this chunk came from
    source_session  INTEGER,
    tags_json       TEXT,                 -- ["npc:vincent_blackwood","loc:goldspire","faction:crimson_court"]
    created_at      TEXT NOT NULL
);

-- Full-text search over chunk text, built-in to SQLite, no extra service.
CREATE VIRTUAL TABLE memory_chunks_fts USING fts5(
    text,
    content='memory_chunks',
    content_rowid='id'
);

-- Recall pattern: Claude rewrites a natural-language query into keyword variants,
-- runs FTS5, and optionally filters by entity tags. Covers ~90% of recall needs
-- without an embedding model.

-- =========================================================================
-- 3.9 Append-only event log
-- =========================================================================

CREATE TABLE events (
    id           INTEGER PRIMARY KEY,
    timestamp    TEXT NOT NULL,
    session_id   INTEGER,
    source       TEXT NOT NULL,           -- orchestrator|combat|map|player|dm|system
    type         TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    reverted     INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX events_session ON events(session_id);
CREATE INDEX events_type    ON events(type);
CREATE INDEX events_time    ON events(timestamp);
```

---

## 4. Event types catalog

The event log is the spine. Every meaningful state change emits an event. A non-exhaustive list:

| Type | Source | Payload |
|------|--------|---------|
| `session_started` / `session_ended` | orchestrator | `{session_id}` |
| `combat_started` / `combat_ended` | orchestrator | `{combat_id, outcome?}` |
| `turn_started` / `turn_ended` | combat | `{combat_id, actor}` |
| `pc_action_submitted` | player | `{pc_id, action, target?, attack_roll?, damage?}` |
| `npc_action_resolved` | combat | `{instance_id, action, target, result}` |
| `damage_dealt` | combat | `{source, target, amount, kind}` |
| `healing_applied` | combat / player | `{target, amount}` |
| `condition_applied` / `condition_removed` | combat | `{target, condition, duration?}` |
| `npc_introduced` | orchestrator / dm | `{npc_id, name, role}` |
| `npc_died` | combat / orchestrator | `{npc_id_or_instance}` |
| `location_entered` / `location_discovered` | orchestrator | `{location_id}` |
| `quest_started` / `quest_state_changed` | orchestrator | `{quest_id, new_state}` |
| `inventory_added` / `inventory_removed` | orchestrator / player | `{owner, name, qty}` |
| `clock_advanced` | orchestrator | `{delta_minutes, new_time_of_day?}` |
| `dm_inject_public` | dm | `{text}` |
| `dm_inject_secret` | dm | `{text, related_npc?, related_location?}` |
| `dm_inject_override` | dm | `{directive}` |
| `seed_planted` / `seed_triggered` | dm / orchestrator | `{seed_id}` |
| `recap_generated` / `summary_generated` | orchestrator | `{session_id, file}` |
| `level_up` | player | `{pc_id, new_level}` |
| `long_rest` / `short_rest` | player | `{}` — triggers spell-slot/HP resets |

The reverted flag plus a `revert_event` helper supports undo at the table — handy when the room shouts "wait, that's not what I rolled."

---

## 5. Markdown file conventions

Each markdown file uses YAML frontmatter for structured fields and prose for the body. The frontmatter is the source of truth that gets synced into the DB on (re-)index; the prose is fed to the vector store as memory chunks.

### NPC dossier — `npcs/vincent_blackwood.md`

```markdown
---
name: Vincent Blackwood
role: Patron
status: alive
current_location: Goldspire
faction: The Crimson Court
voice_profile: el_mature_male_aristocrat
introduced_session: 1
---

# Vincent Blackwood

A grey-haired diplomat with a duelist's stance. Speaks in measured cadences;
never rushes a sentence. Public face: benefactor of the Goldspire orphanage.

## Hooks
- Owes a personal debt to Tharivol after the events at the Hollow Wood.
- Privately searching for his missing daughter.

## Voice notes
Low register, slow pace, occasional dry humor. Never raises his voice.
```

### Session summary — `sessions/session_03.md`

```markdown
---
session: 3
played_at: 2026-04-15
key_events:
  - Tharivol struck a deal with Vincent Blackwood
  - Party entered the Hollow Wood
  - First encounter with shadow wolves (defeated)
  - Discovered the cairn marked with the Crimson Court sigil
quests_touched: [the_lost_heir, the_hollow_wood]
npcs_introduced: [vincent_blackwood, captain_morr]
locations_visited: [goldspire, hollow_wood_outskirts]
---

# Session 3 — The Hollow Wood

The session opened in Goldspire's marketplace at dawn...
```

### Recap — `sessions/recap_04.md`

A 60–90 second cinematic narration generated at end of session 3, played as the cold open of session 4. Pure prose, TTS-ready, no frontmatter required.

### Seeds — `seeds.json`

```json
[
  {
    "id": 12,
    "text": "A traveling bard hums a melody Tharivol knows from his childhood village.",
    "trigger": "party_at:Goldspire AND session>=4",
    "visibility": "public",
    "status": "planted"
  },
  {
    "id": 13,
    "text": "Vincent's signet ring is the same one the assassin wore.",
    "trigger": "scene:vincent_revealed",
    "visibility": "secret",
    "status": "planted"
  }
]
```

---

## 6. Read/write ownership

Who is allowed to mutate which tables. The orchestrator routes; agents call scoped tools.

| Component | Reads | Writes |
|-----------|-------|--------|
| DM Orchestrator | everything | sessions, clock, quests, seeds (status), events |
| Combat Director (sub-agent) | pcs, npc_instances, combats, conditions | combats, npc_instances, events (combat-typed) |
| Map MCP (separate app) | own spatial state | npc_instances.map_token_id, events (map-typed) |
| Encounter Builder skill | pcs (party comp), locations, clock | (none — proposes; orchestrator commits) |
| Bestiary skill | Open5e cache, homebrew/monsters.json | (read-only) |
| Lore Memory skill | memory_chunks, npcs, locations, factions, secrets | memory_chunks, sessions.summary_file, npc dossiers (when DM-approved) |
| Player UI | own PC's full view, party-visible state | pcs (current_hp, spell_slots, conditions), inventory, events (player-typed) |
| DM injection lane | (none — write-only path) | seeds, secrets, events (dm-typed) |

The **Map MCP** owns spatial state outside the DB. Positions, terrain, line-of-sight live in the map app's own store. The DB only keeps `map_token_id` as a handle. This keeps the schema simple and lets the map app evolve independently.

---

## 7. Token efficiency notes baked into the schema

- Every dossier (NPC, location, faction) has both a `notes_summary` (one-paragraph, fits in any context) and a `dossier_file` pointer (full content, fetched on demand).
- `key_events_json` on sessions is a curated short list — used for cheap recall in long campaigns where the full summary would be wasteful.
- `npc_instances` carries only combat-relevant fields; full stat blocks are fetched from Open5e/homebrew via `template_key` only when needed.
- The orchestrator pulls slices through tools (`get_combatant`, `list_active_quests`, `recall_memory(query)`) rather than receiving state blobs.
- `intensity` on combats is the dial that controls narration verbosity per turn.

---

## 8. Open questions for v0.2

1. **Where does the SRD/Open5e cache live?** Probably outside the campaign folder (shared across campaigns) since it's reference data. Suggest `~/.archclaude/srd-cache/` or app-bundled.
2. **Schema migrations.** `schema_version` is a placeholder; need migration scripts as fields evolve.
3. **Multi-combat sessions.** Schema already supports multiple `combats` per session; UI/orchestrator transition logic lives elsewhere.
4. **Long rest mechanics.** Should `long_rest` events automatically reset spell slots and HP, or always require player confirmation? Probably player-confirmed via UI.
5. **Death saves & PC death.** Not modeled here yet — needs `death_saves_json` on pcs and a `pc_died` flow.
6. **Concentration tracking.** Not modeled. Worth adding `concentration_on_json` to pcs since concentration breaks are common combat events.
7. **Party gold pool vs per-PC.** Modeled `inventory.owner_kind='party'` for shared treasure; need to confirm with the table how they handle currency.

---

## 9. Build order

When we start implementing, the natural order is:

1. SQLite schema + a thin Python/Node DAL that wraps it.
2. Markdown indexer (frontmatter → DB sync, body → memory_chunks).
3. The campaign-import skill (kickstart a world from DM-provided notes).
4. Map MCP server (separate deliverable; uses `map_token_id` handles).
5. Bestiary skill against Open5e.
6. Encounter Builder skill.
7. Combat Director sub-agent.
8. Lore Memory skill.
9. DM Orchestrator (the brain that ties them together).
10. Voice layer (STT in, TTS out).
11. TV-display app + designated-player UI.

Steps 1–3 are pre-requisite for everything else.

# Metabase Dashboard Setup

> Browse campaign data, SRD monsters/spells, event logs, and session history through a visual dashboard.

## Quick Start

```bash
# 1. Import SRD bestiary into SQLite (one-time)
node scripts/import-srd-to-sqlite.js

# 2. Start Metabase
docker-compose -f scripts/docker-compose.metabase.yml up -d

# 3. Open http://localhost:3007
```

Metabase takes ~30 seconds to start on first run.

## First-Time Configuration

1. Open **http://localhost:3007**
2. Create an admin account (email + password)
3. Skip the "Add your data" wizard — we'll add databases manually

### Add Campaign Database

1. Go to **Admin → Databases → Add Database**
2. Type: **SQLite**
3. Name: `Campaign State`
4. Filename: `/campaign/campaign.db`
5. Save

This gives you access to all campaign tables:
- `pcs` — Player characters with HP, AC, conditions, spell slots
- `npcs` — NPCs with role, status, location, faction
- `sessions` — Session metadata with key events
- `combats` — Combat encounters with outcomes
- `events` — Full event log (every state change)
- `locations` — World locations with status
- `factions` — Faction reputation scores
- `quests` — Active/completed quests
- `seeds` — Foreshadowing seeds (planted/triggered)
- `secrets` — DM secrets (hidden/revealed)
- `memory_chunks` — Indexed content for FTS recall
- `inventory` — Items owned by PCs and party
- `action_queue` — Pending player actions from the UI

### Add Bestiary Database

1. Go to **Admin → Databases → Add Database**
2. Type: **SQLite**
3. Name: `SRD Bestiary`
4. Filename: `/srd-cache/bestiary.db`
5. Save

This gives you:
- `monsters` — 322 SRD monsters with full stat blocks
- `spells` — 319 SRD spells with descriptions
- `conditions` — 15 D&D conditions with rules text

## Suggested Dashboards

### Campaign Overview
- **Number card**: Total sessions played
- **Number card**: Active PCs count
- **Number card**: Total events logged
- **Table**: Active quests (title, state, giver NPC)
- **Bar chart**: Events per session

### Event Timeline
- **Table**: Events ordered by timestamp, filterable by type and source
- **Line chart**: Events per hour during a session
- **Pie chart**: Events by type (damage_dealt, location_entered, etc.)

### PC Tracker
- **Table**: All PCs with current HP, max HP, AC, conditions
- **Bar chart**: PC HP as percentage of max (red/yellow/green)

### Bestiary Browser
- **Table**: Monsters filterable by CR range, type, size
- **Scatter plot**: HP vs AC colored by CR
- **Table**: Spells filterable by level and school

### Combat History
- **Table**: All combats with session, outcome, rounds, intensity
- **Pie chart**: Combat outcomes (victory/defeat/fled/negotiated)

## Managing Data

The campaign database is **live** — Metabase reads the same SQLite file that the MCP servers write to. Changes during a session appear in real-time (on dashboard refresh).

The bestiary database is **static** — re-run `node scripts/import-srd-to-sqlite.js` after updating the SRD cache.

## Stopping Metabase

```bash
docker-compose -f scripts/docker-compose.metabase.yml down
```

Your dashboards and settings persist in the `archclaude-metabase-data` Docker volume.

#!/bin/bash
# ArchClaude Metabase Dashboard Setup
#
# 1. Imports SRD data into SQLite for browsing
# 2. Starts Metabase on port 3007
# 3. After first start, add databases manually in Metabase UI:
#    - Campaign DB: /campaign/campaign.db (SQLite)
#    - Bestiary DB: /srd-cache/bestiary.db (SQLite)

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "=== ArchClaude Metabase Setup ==="
echo ""

# Step 1: Import SRD to SQLite
echo "Step 1: Importing SRD data to SQLite..."
cd "$PROJECT_ROOT"
node scripts/import-srd-to-sqlite.js
echo ""

# Step 2: Start Metabase
echo "Step 2: Starting Metabase..."
docker compose -f scripts/docker-compose.metabase.yml up -d
echo ""

echo "=== Setup Complete ==="
echo ""
echo "Metabase: http://localhost:3007"
echo ""
echo "First-time setup:"
echo "  1. Open http://localhost:3007 and create an admin account"
echo "  2. Add database: Campaign State"
echo "     - Type: SQLite"
echo "     - Path: /campaign/campaign.db"
echo "  3. Add database: SRD Bestiary"
echo "     - Type: SQLite"
echo "     - Path: /srd-cache/bestiary.db"
echo ""
echo "Suggested dashboards to create:"
echo "  - Campaign Overview: session count, PCs, NPCs, quests"
echo "  - Event Timeline: events table filtered by session/type"
echo "  - Combat History: combats with outcomes and rounds"
echo "  - PC Tracker: HP, conditions, death saves over time"
echo "  - Bestiary Browser: monsters by CR/type, spells by level/school"
echo "  - Memory Search: memory_chunks with FTS"
echo "  - Seeds & Secrets: planted/triggered, hidden/revealed"

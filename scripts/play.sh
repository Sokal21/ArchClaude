#!/bin/bash
# ArchClaude — Start all services for a campaign session
#
# Usage: pnpm play [campaign-path]
# Default: ./examples/starter-campaign

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
CAMPAIGN="${1:-$PROJECT_ROOT/examples/starter-campaign}"
CAMPAIGN="$(cd "$CAMPAIGN" 2>/dev/null && pwd || echo "$CAMPAIGN")"

echo "╔══════════════════════════════════════╗"
echo "║       ArchClaude — Game Night        ║"
echo "╚══════════════════════════════════════╝"
echo ""
echo "Campaign: $CAMPAIGN"
echo ""

# Check prerequisites
if [ ! -f "$CAMPAIGN/campaign.db" ]; then
  echo "No database found. Initializing campaign..."
  node "$PROJECT_ROOT/packages/cli/dist/index.js" init "$CAMPAIGN"
  echo ""
fi

# Check build
if [ ! -f "$PROJECT_ROOT/packages/combat-resolver/dist/index.js" ]; then
  echo "Packages not built. Building..."
  cd "$PROJECT_ROOT" && pnpm build
  echo ""
fi

# Cleanup on exit
PIDS=()
cleanup() {
  echo ""
  echo "Shutting down..."
  for pid in "${PIDS[@]}"; do
    kill "$pid" 2>/dev/null || true
  done
  wait 2>/dev/null
  echo "All services stopped."
}
trap cleanup EXIT INT TERM

# Start services
echo "Starting services..."
echo ""

# 1. Combat Resolver API (port 3500)
node "$PROJECT_ROOT/packages/combat-resolver/dist/index.js" --campaign "$CAMPAIGN" --port 3500 &
PIDS+=($!)
echo "  ✓ Combat Resolver API   → http://localhost:3500"

# 2. Player UI (port 3400)
node "$PROJECT_ROOT/packages/player-ui/server.js" --port 3400 &
PIDS+=($!)
echo "  ✓ Player UI             → http://localhost:3400"

# 3. TV Display (port 3200)
node "$PROJECT_ROOT/packages/tv-display/server.js" --port 3200 &
PIDS+=($!)
echo "  ✓ TV Display            → http://localhost:3200"

# Brief pause to let services start
sleep 1

echo ""
echo "╔══════════════════════════════════════╗"
echo "║          Ready to Play!              ║"
echo "╠══════════════════════════════════════╣"
echo "║                                      ║"
echo "║  Player UI:  http://localhost:3400   ║"
echo "║  TV Display: http://localhost:3200   ║"
echo "║  Resolver:   http://localhost:3500   ║"
echo "║                                      ║"
echo "║  MCP servers start automatically     ║"
echo "║  when you open Claude Code.          ║"
echo "║                                      ║"
echo "║  Open Claude Code and say:           ║"
echo "║  'Start a D&D session'               ║"
echo "║                                      ║"
echo "║  Press Ctrl+C to stop all services.  ║"
echo "╚══════════════════════════════════════╝"
echo ""

# Wait for all background processes
wait

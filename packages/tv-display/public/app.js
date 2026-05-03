/**
 * TV Display client — connects to the Map MCP WebSocket and renders
 * the battle map, initiative tracker, party status, and narration.
 *
 * Architecture: The app is purely reactive. It receives events from the
 * WebSocket and updates the DOM/canvas. No state mutations originate here
 * except click-to-move (Phase 2.6), which sends an event back.
 */

const WS_URL = `ws://${location.hostname}:3100`;
const CELL_SIZE = 40; // pixels per grid cell

const TERRAIN_COLORS = {
  open: "#1a2a3a",
  difficult: "#2a3a2a",
  wall: "#444",
  water: "#1a3a5a",
  pit: "#0a0a0a",
  elevation: "#3a3a2a",
};

const TOKEN_SIZE_PX = {
  tiny: 20, small: 30, medium: 36, large: 72, huge: 108, gargantuan: 144,
};

// ── State ──

let mapState = null;     // Current map data
let selectedToken = null; // For click-to-move

// ── DOM refs ──

const canvas = document.getElementById("map-canvas");
const ctx = canvas.getContext("2d");
const noMapMsg = document.getElementById("no-map-message");
const initList = document.getElementById("initiative-list");
const partyList = document.getElementById("party-list");
const narrationText = document.getElementById("narration-text");

// ── WebSocket ──

let ws = null;
let reconnectTimer = null;

function connect() {
  ws = new WebSocket(WS_URL);

  ws.onopen = () => {
    console.log("Connected to Map MCP WebSocket");
    if (reconnectTimer) clearInterval(reconnectTimer);
    reconnectTimer = null;
  };

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    handleEvent(msg);
  };

  ws.onclose = () => {
    console.log("WebSocket disconnected. Reconnecting...");
    if (!reconnectTimer) {
      reconnectTimer = setInterval(() => connect(), 3000);
    }
  };

  ws.onerror = () => {
    ws.close();
  };
}

// ── Event handling ──

function handleEvent(event) {
  switch (event.type) {
    case "map_sync":
    case "map_created":
      mapState = event.payload;
      if (!mapState.terrain) mapState.terrain = [];
      if (!mapState.tokens) mapState.tokens = [];
      // Convert terrain array to lookup
      mapState._terrainMap = {};
      for (const cell of mapState.terrain) {
        mapState._terrainMap[`${cell.x},${cell.y}`] = cell;
      }
      showMap();
      render();
      break;

    case "token_placed":
      if (mapState) {
        mapState.tokens.push(event.payload.token);
        render();
      }
      break;

    case "token_moved": {
      if (!mapState) break;
      const moved = mapState.tokens.find(t => t.id === event.payload.token_id);
      if (moved) {
        moved.x = event.payload.to.x;
        moved.y = event.payload.to.y;
        render();
      }
      break;
    }

    case "token_removed":
      if (mapState) {
        mapState.tokens = mapState.tokens.filter(t => t.id !== event.payload.token_id);
        render();
      }
      break;

    case "token_visibility_changed": {
      if (!mapState) break;
      const tok = mapState.tokens.find(t => t.id === event.payload.token_id);
      if (tok) tok.visible = event.payload.visible;
      render();
      break;
    }

    case "token_conditions_changed": {
      if (!mapState) break;
      const ct = mapState.tokens.find(t => t.id === event.payload.token_id);
      if (ct) ct.conditions = event.payload.conditions;
      render();
      break;
    }

    case "terrain_changed":
      if (mapState) {
        for (const cell of event.payload.cells) {
          mapState._terrainMap[`${cell.x},${cell.y}`] = cell;
        }
        // Also update the terrain array
        mapState.terrain = Object.values(mapState._terrainMap);
        render();
      }
      break;

    case "aoe_applied":
      if (mapState) {
        mapState._aoeHighlight = event.payload.cells;
        render();
        // Clear highlight after 3 seconds
        setTimeout(() => {
          if (mapState) mapState._aoeHighlight = null;
          render();
        }, 3000);
      }
      break;

    case "map_cleared":
      if (mapState) {
        mapState.tokens = [];
        mapState.terrain = [];
        mapState._terrainMap = {};
        render();
      }
      break;

    // ── HUD events ──

    case "initiative_update":
      renderInitiative(event.payload.order, event.payload.current_index);
      break;

    case "party_status_update":
      renderPartyStatus(event.payload.pcs);
      break;

    case "narration_text":
      renderNarration(event.payload.text, event.payload.intensity);
      break;
  }
}

// ── Rendering ──

function showMap() {
  canvas.style.display = "block";
  noMapMsg.style.display = "none";
  canvas.width = mapState.width * CELL_SIZE;
  canvas.height = mapState.height * CELL_SIZE;
}

function render() {
  if (!mapState) return;

  // Clear
  ctx.fillStyle = "#1a2a3a";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Draw grid
  ctx.strokeStyle = "#2a3a4a";
  ctx.lineWidth = 1;
  for (let x = 0; x <= mapState.width; x++) {
    ctx.beginPath();
    ctx.moveTo(x * CELL_SIZE, 0);
    ctx.lineTo(x * CELL_SIZE, canvas.height);
    ctx.stroke();
  }
  for (let y = 0; y <= mapState.height; y++) {
    ctx.beginPath();
    ctx.moveTo(0, y * CELL_SIZE);
    ctx.lineTo(canvas.width, y * CELL_SIZE);
    ctx.stroke();
  }

  // Draw terrain
  for (const cell of mapState.terrain) {
    const color = TERRAIN_COLORS[cell.type] || TERRAIN_COLORS.open;
    ctx.fillStyle = color;
    ctx.fillRect(cell.x * CELL_SIZE + 1, cell.y * CELL_SIZE + 1, CELL_SIZE - 2, CELL_SIZE - 2);

    // Cover indicators
    if (cell.cover === "half") {
      ctx.fillStyle = "rgba(255, 255, 0, 0.15)";
      ctx.fillRect(cell.x * CELL_SIZE + 1, cell.y * CELL_SIZE + 1, CELL_SIZE - 2, CELL_SIZE - 2);
    } else if (cell.cover === "three_quarter") {
      ctx.fillStyle = "rgba(255, 165, 0, 0.2)";
      ctx.fillRect(cell.x * CELL_SIZE + 1, cell.y * CELL_SIZE + 1, CELL_SIZE - 2, CELL_SIZE - 2);
    }
  }

  // Draw AoE highlight
  if (mapState._aoeHighlight) {
    ctx.fillStyle = "rgba(233, 69, 96, 0.3)";
    for (const cell of mapState._aoeHighlight) {
      ctx.fillRect(cell.x * CELL_SIZE, cell.y * CELL_SIZE, CELL_SIZE, CELL_SIZE);
    }
  }

  // Draw tokens
  for (const token of mapState.tokens) {
    if (!token.visible) continue; // Don't show hidden tokens on TV

    const cx = token.x * CELL_SIZE + CELL_SIZE / 2;
    const cy = token.y * CELL_SIZE + CELL_SIZE / 2;
    const radius = (TOKEN_SIZE_PX[token.size] || 36) / 2;

    // Token circle
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fillStyle = token.color;
    ctx.fill();
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 2;
    ctx.stroke();

    // Label
    ctx.fillStyle = "#fff";
    ctx.font = "bold 11px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(token.label, cx, cy);

    // Condition indicators (small dots above token)
    if (token.conditions && token.conditions.length > 0) {
      const dotY = cy - radius - 6;
      const startX = cx - (token.conditions.length - 1) * 5;
      for (let i = 0; i < token.conditions.length; i++) {
        ctx.beginPath();
        ctx.arc(startX + i * 10, dotY, 3, 0, Math.PI * 2);
        ctx.fillStyle = "#e94560";
        ctx.fill();
      }
    }
  }
}

function renderInitiative(order, currentIndex) {
  initList.innerHTML = "";
  for (let i = 0; i < order.length; i++) {
    const entry = order[i];
    const div = document.createElement("div");
    div.className = "init-entry" + (i === currentIndex ? " active" : "");
    div.innerHTML = `${entry.name} <span class="init-roll">${entry.init}</span>`;
    initList.appendChild(div);
  }
}

function renderPartyStatus(pcs) {
  partyList.innerHTML = "";
  for (const pc of pcs) {
    const pct = Math.max(0, Math.min(100, (pc.hp / pc.max_hp) * 100));
    const barColor = pct > 50 ? "#4caf50" : pct > 25 ? "#ff9800" : "#f44336";
    const card = document.createElement("div");
    card.className = "pc-card";
    card.innerHTML = `
      <div class="pc-name">${pc.name}</div>
      <div class="hp-bar-container">
        <div class="hp-bar" style="width: ${pct}%; background: ${barColor}"></div>
      </div>
      <div class="hp-text">${pc.hp} / ${pc.max_hp} HP</div>
      ${pc.conditions.length > 0 ? `<div class="conditions">${pc.conditions.join(", ")}</div>` : ""}
    `;
    partyList.appendChild(card);
  }
}

function renderNarration(text, intensity) {
  narrationText.textContent = text;
  narrationText.className = "";
  if (intensity === "tense") narrationText.className = "intensity-tense";
  if (intensity === "climax") narrationText.className = "intensity-climax";
}

// ── Click-to-move (Phase 2.6) ──

canvas.addEventListener("click", (e) => {
  if (!mapState) return;
  const rect = canvas.getBoundingClientRect();
  const x = Math.floor((e.clientX - rect.left) / CELL_SIZE);
  const y = Math.floor((e.clientY - rect.top) / CELL_SIZE);

  // Find if a PC token was clicked
  const clicked = mapState.tokens.find(t =>
    t.actor_kind === "pc" && t.x === x && t.y === y && t.visible
  );

  if (clicked) {
    selectedToken = clicked;
    canvas.style.cursor = "crosshair";
    return;
  }

  // If a token is selected, send a move request
  if (selectedToken) {
    // Send click event back to the WebSocket (the orchestrator can pick this up)
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: "pc_click_move",
        payload: {
          token_id: selectedToken.id,
          actor_kind: selectedToken.actor_kind,
          actor_id: selectedToken.actor_id,
          from: { x: selectedToken.x, y: selectedToken.y },
          to: { x, y },
        },
      }));
    }
    selectedToken = null;
    canvas.style.cursor = "default";
  }
});

// ── Start ──

connect();

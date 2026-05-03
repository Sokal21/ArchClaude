/**
 * TV Display — shows DM narration, battle map, initiative, and party status.
 *
 * Connects to Map MCP WebSocket (port 3100) for real-time events.
 * The narration log is the primary feature — all Claude output and
 * combat results appear here so the whole table can read along.
 */

const WS_URL = `ws://${location.hostname}:3100`;
const CELL_SIZE = 40;

const TERRAIN_COLORS = {
  open: "#1a2a3a", difficult: "#2a3a2a", wall: "#444",
  water: "#1a3a5a", pit: "#0a0a0a", elevation: "#3a3a2a",
};

const TOKEN_SIZE_PX = {
  tiny: 20, small: 30, medium: 36, large: 72, huge: 108, gargantuan: 144,
};

let mapState = null;
let ws = null;

// ── DOM ──

const canvas = document.getElementById("map-canvas");
const ctx = canvas.getContext("2d");
const noMapMsg = document.getElementById("no-map-message");
const mainArea = document.getElementById("main-area");
const initList = document.getElementById("initiative-list");
const partyList = document.getElementById("party-list");
const narrationLog = document.getElementById("narration-log");

// Start in narration-only mode
mainArea.classList.add("narration-only");

// ── WebSocket ──

function connect() {
  ws = new WebSocket(WS_URL);
  ws.onopen = () => addNarration("system", "Connected to game server.");
  ws.onmessage = (event) => handleEvent(JSON.parse(event.data));
  ws.onclose = () => {
    addNarration("system", "Disconnected. Reconnecting...");
    setTimeout(connect, 3000);
  };
  ws.onerror = () => ws.close();
}

function handleEvent(event) {
  switch (event.type) {
    case "narration_text":
      addNarration("dm", event.payload.text, event.payload.intensity);
      break;

    case "combat_action_resolved":
      formatCombatResult(event.payload);
      break;

    case "player_action_submitted":
      addNarration("combat", `${event.payload.pc ?? "Player"}: ${event.payload.description ?? event.payload.type}`);
      break;

    case "map_sync":
    case "map_created":
      mapState = event.payload;
      if (!mapState.terrain) mapState.terrain = [];
      if (!mapState.tokens) mapState.tokens = [];
      mapState._terrainMap = {};
      for (const cell of mapState.terrain) mapState._terrainMap[`${cell.x},${cell.y}`] = cell;
      mainArea.classList.remove("narration-only");
      showMap();
      render();
      break;

    case "token_placed":
      if (mapState) { mapState.tokens.push(event.payload.token); render(); }
      break;
    case "token_moved":
      if (mapState) {
        const t = mapState.tokens.find(t => t.id === event.payload.token_id);
        if (t) { t.x = event.payload.to.x; t.y = event.payload.to.y; render(); }
      }
      break;
    case "token_removed":
      if (mapState) { mapState.tokens = mapState.tokens.filter(t => t.id !== event.payload.token_id); render(); }
      break;
    case "terrain_changed":
      if (mapState) {
        for (const cell of event.payload.cells) mapState._terrainMap[`${cell.x},${cell.y}`] = cell;
        mapState.terrain = Object.values(mapState._terrainMap);
        render();
      }
      break;
    case "aoe_applied":
      if (mapState) {
        mapState._aoeHighlight = event.payload.cells;
        render();
        setTimeout(() => { if (mapState) { mapState._aoeHighlight = null; render(); } }, 3000);
      }
      break;
    case "map_cleared":
      if (mapState) { mapState.tokens = []; mapState.terrain = []; mapState._terrainMap = {}; render(); }
      hasMap = false;
      mainArea.classList.add("narration-only");
      break;

    case "initiative_update":
      renderInitiative(event.payload.order, event.payload.current_index);
      break;
    case "party_status_update":
      renderPartyStatus(event.payload.pcs);
      break;
  }
}

// ── Narration log ──

function addNarration(type, text, intensity) {
  const entry = document.createElement("div");
  entry.className = `narration-entry${type === "combat" ? " combat-result" : ""}${intensity ? ` intensity-${intensity}` : ""}`;

  const time = document.createElement("div");
  time.className = "narr-time";
  time.textContent = new Date().toLocaleTimeString();

  const content = document.createElement("div");
  content.className = "narr-text";
  content.textContent = text;

  entry.appendChild(time);
  entry.appendChild(content);
  narrationLog.appendChild(entry);
  narrationLog.scrollTop = narrationLog.scrollHeight;

  while (narrationLog.children.length > 100) narrationLog.removeChild(narrationLog.firstChild);
}

function formatCombatResult(payload) {
  if (payload.type === "attack") {
    const r = payload.result;
    const hitText = r.critical ? "CRITICAL HIT!" : r.hit ? "HIT" : "Miss";
    addNarration("combat", `${payload.attacker} → ${payload.weapon}: ${r.roll}+${r.modifier}=${r.total} vs AC ${r.target_ac} → ${hitText}`);
  } else if (payload.type === "damage") {
    const d = payload.damage;
    addNarration("combat", `Damage: ${d.base_damage}+${d.modifier}=${d.final_damage}${d.resistance_applied ? ` (${d.resistance_applied})` : ""}`);
  } else if (payload.type === "save") {
    const s = payload.result;
    addNarration("combat", `${payload.pc} ${payload.ability?.toUpperCase()} save: ${s.total} vs DC ${s.dc} → ${s.success ? "SUCCESS" : "FAIL"}`);
  } else if (payload.type === "check") {
    addNarration("combat", `${payload.pc} ${payload.skill}: ${payload.result.total}`);
  }
}

// ── Initiative ──

function renderInitiative(order, currentIndex) {
  initList.innerHTML = "";
  for (let i = 0; i < order.length; i++) {
    const div = document.createElement("div");
    div.className = "init-entry" + (i === currentIndex ? " active" : "");
    div.innerHTML = `${order[i].name} <span class="init-roll">${order[i].init}</span>`;
    initList.appendChild(div);
  }
}

// ── Party status ──

function renderPartyStatus(pcs) {
  partyList.innerHTML = "";
  for (const pc of pcs) {
    const pct = Math.max(0, Math.min(100, (pc.hp / pc.max_hp) * 100));
    const barColor = pct > 50 ? "#4caf50" : pct > 25 ? "#ff9800" : "#f44336";
    const card = document.createElement("div");
    card.className = "pc-card";
    card.innerHTML = `
      <div class="pc-name">${pc.name}</div>
      <div class="hp-bar-container"><div class="hp-bar" style="width:${pct}%;background:${barColor}"></div></div>
      <div class="hp-text">${pc.hp}/${pc.max_hp} HP</div>
      ${pc.conditions.length > 0 ? `<div class="conditions">${pc.conditions.join(", ")}</div>` : ""}
    `;
    partyList.appendChild(card);
  }
}

// ── Map rendering ──

function showMap() {
  canvas.style.display = "block";
  noMapMsg.style.display = "none";
  canvas.width = mapState.width * CELL_SIZE;
  canvas.height = mapState.height * CELL_SIZE;
}

function render() {
  if (!mapState) return;
  ctx.fillStyle = "#1a2a3a";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = "#2a3a4a"; ctx.lineWidth = 1;
  for (let x = 0; x <= mapState.width; x++) { ctx.beginPath(); ctx.moveTo(x*CELL_SIZE,0); ctx.lineTo(x*CELL_SIZE,canvas.height); ctx.stroke(); }
  for (let y = 0; y <= mapState.height; y++) { ctx.beginPath(); ctx.moveTo(0,y*CELL_SIZE); ctx.lineTo(canvas.width,y*CELL_SIZE); ctx.stroke(); }

  for (const cell of mapState.terrain) {
    ctx.fillStyle = TERRAIN_COLORS[cell.type] || TERRAIN_COLORS.open;
    ctx.fillRect(cell.x*CELL_SIZE+1, cell.y*CELL_SIZE+1, CELL_SIZE-2, CELL_SIZE-2);
  }

  if (mapState._aoeHighlight) {
    ctx.fillStyle = "rgba(233,69,96,0.3)";
    for (const c of mapState._aoeHighlight) ctx.fillRect(c.x*CELL_SIZE, c.y*CELL_SIZE, CELL_SIZE, CELL_SIZE);
  }

  for (const token of mapState.tokens) {
    if (!token.visible) continue;
    const cx = token.x*CELL_SIZE+CELL_SIZE/2, cy = token.y*CELL_SIZE+CELL_SIZE/2;
    const r = (TOKEN_SIZE_PX[token.size]||36)/2;
    ctx.beginPath(); ctx.arc(cx,cy,r,0,Math.PI*2); ctx.fillStyle = token.color; ctx.fill();
    ctx.strokeStyle = "#fff"; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = "#fff"; ctx.font = "bold 11px sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(token.label, cx, cy);
    if (token.conditions?.length) {
      const dotY = cy-r-6, startX = cx-(token.conditions.length-1)*5;
      for (let i=0; i<token.conditions.length; i++) { ctx.beginPath(); ctx.arc(startX+i*10,dotY,3,0,Math.PI*2); ctx.fillStyle="#e94560"; ctx.fill(); }
    }
  }
}

// ── Start ──
connect();

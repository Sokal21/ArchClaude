/**
 * Player UI client — structured action submission for combat.
 *
 * Connects to the Map MCP WebSocket (port 3100) for state updates
 * and sends player actions as events.
 */

const WS_URL = `ws://${location.hostname}:3100`;
let ws = null;

// ── WebSocket ──

function connect() {
  ws = new WebSocket(WS_URL);

  ws.onopen = () => console.log("Connected to event bus");

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    handleEvent(msg);
  };

  ws.onclose = () => {
    setTimeout(connect, 3000);
  };

  ws.onerror = () => ws.close();
}

function send(type, payload) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type, timestamp: new Date().toISOString(), payload }));
  }
}

// ── Event handling ──

function handleEvent(event) {
  switch (event.type) {
    case "initiative_update":
      renderInitiative(event.payload.order, event.payload.current_index);
      break;
    case "party_status_update":
      renderPartyStatus(event.payload.pcs);
      break;
    case "map_created":
    case "map_sync":
      updateTargets(event.payload.tokens || []);
      break;
    case "token_placed":
      // Re-fetch targets could be smarter, but this works
      break;
  }
}

// ── Tab switching ──

document.querySelectorAll(".tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
    document.querySelectorAll(".action-panel").forEach((p) => p.classList.remove("active"));
    tab.classList.add("active");
    document.getElementById(`panel-${tab.dataset.tab}`).classList.add("active");
  });
});

// ── Action submission ──

function submitAttack() {
  const weapon = document.getElementById("attack-weapon").value;
  const target = document.getElementById("attack-target").value;
  const roll = parseInt(document.getElementById("attack-roll").value);
  const damage = parseInt(document.getElementById("attack-damage").value);
  const damageType = document.getElementById("attack-damage-type").value;

  send("pc_action_submitted", {
    action: "attack",
    weapon: weapon || "unarmed",
    target: target || "nearest enemy",
    attack_roll: isNaN(roll) ? null : roll,
    damage: isNaN(damage) ? null : damage,
    damage_type: damageType,
  });

  // Clear inputs
  document.getElementById("attack-roll").value = "";
  document.getElementById("attack-damage").value = "";
}

function submitSpell() {
  const name = document.getElementById("spell-name").value;
  const level = document.getElementById("spell-level").value;
  const target = document.getElementById("spell-target").value;
  const roll = parseInt(document.getElementById("spell-roll").value);
  const effect = parseInt(document.getElementById("spell-effect").value);

  send("pc_action_submitted", {
    action: "cast_spell",
    spell_name: name,
    spell_level: level,
    target: target || null,
    spell_roll: isNaN(roll) ? null : roll,
    effect_amount: isNaN(effect) ? null : effect,
  });

  document.getElementById("spell-name").value = "";
  document.getElementById("spell-roll").value = "";
  document.getElementById("spell-effect").value = "";
}

function submitAbility() {
  const name = document.getElementById("ability-name").value;
  const desc = document.getElementById("ability-desc").value;

  send("pc_action_submitted", {
    action: "use_ability",
    ability_name: name,
    description: desc,
  });

  document.getElementById("ability-name").value = "";
  document.getElementById("ability-desc").value = "";
}

function submitOther() {
  const action = document.getElementById("other-action").value;
  send("pc_action_submitted", { action: "other", description: action });
  document.getElementById("other-action").value = "";
}

function submitSay() {
  const text = document.getElementById("say-text").value;
  send("pc_say", { text });
  document.getElementById("say-text").value = "";
}

function submitRoll() {
  const roll = document.getElementById("custom-roll").value;
  send("pc_roll", { roll_expression: roll });
  document.getElementById("custom-roll").value = "";
}

function submitDM() {
  const type = document.getElementById("dm-type").value;
  const text = document.getElementById("dm-text").value;
  send(`dm_inject_${type}`, { text });
  document.getElementById("dm-text").value = "";
}

// ── UI rendering ──

function renderInitiative(order, currentIndex) {
  const container = document.getElementById("initiative-order");
  container.innerHTML = "";
  for (let i = 0; i < order.length; i++) {
    const div = document.createElement("div");
    div.className = "init-entry" + (i === currentIndex ? " active" : "");
    div.textContent = `${order[i].name} (${order[i].init})`;
    container.appendChild(div);
  }

  // Show turn indicator if it's a PC's turn
  const turnIndicator = document.getElementById("turn-indicator");
  if (currentIndex >= 0 && currentIndex < order.length) {
    const current = order[currentIndex];
    if (current.actor_kind === "pc") {
      turnIndicator.textContent = `${current.name}'s Turn!`;
      turnIndicator.classList.remove("hidden");
    } else {
      turnIndicator.classList.add("hidden");
    }
  }
}

function renderPartyStatus(pcs) {
  const container = document.getElementById("party-status");
  container.innerHTML = "";
  for (const pc of pcs) {
    const pct = Math.max(0, Math.min(100, (pc.hp / pc.max_hp) * 100));
    const color = pct > 50 ? "#4caf50" : pct > 25 ? "#ff9800" : "#f44336";
    const card = document.createElement("div");
    card.className = "pc-card";
    card.innerHTML = `
      <div class="pc-name">${pc.name}</div>
      <div class="hp-bar-bg"><div class="hp-bar" style="width:${pct}%;background:${color}"></div></div>
      <div class="hp-text">${pc.hp}/${pc.max_hp} HP</div>
      ${pc.conditions.length > 0 ? `<div class="conditions">${pc.conditions.join(", ")}</div>` : ""}
    `;
    container.appendChild(card);
  }
}

function updateTargets(tokens) {
  const targetSelects = ["attack-target", "spell-target"];
  for (const selId of targetSelects) {
    const sel = document.getElementById(selId);
    const current = sel.value;
    sel.innerHTML = '<option value="">Select target...</option>';
    for (const token of tokens) {
      if (token.visible) {
        const opt = document.createElement("option");
        opt.value = token.label;
        opt.textContent = `${token.label} (${token.actor_kind})`;
        sel.appendChild(opt);
      }
    }
    sel.value = current;
  }
}

// ── DM mode toggle (Ctrl+D) ──

document.addEventListener("keydown", (e) => {
  if (e.ctrlKey && e.key === "d") {
    e.preventDefault();
    document.getElementById("dm-section").classList.toggle("hidden");
  }
});

// ── Start ──

connect();

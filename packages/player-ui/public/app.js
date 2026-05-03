/**
 * Player UI — structured combat action submission.
 *
 * Calls the Combat Resolver API directly for standard actions (attack, spell,
 * save, check). Only creative/freeform actions go to the AI DM via queue.
 *
 * Architecture:
 *   Standard action → HTTP POST to Combat Resolver → rules calculator → DB update → done
 *   Creative action → HTTP POST to Combat Resolver → action queue → AI DM processes
 */

const API_URL = `http://${location.hostname}:3500`;
const WS_URL = `ws://${location.hostname}:3100`;

// ── State ──

let combatState = null;
let selectedPc = null;
let ws = null;

// ── API helpers ──

async function api(path, body) {
  const opts = body
    ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }
    : { method: "GET" };
  const res = await fetch(`${API_URL}${path}`, opts);
  return res.json();
}

async function refreshCombatState() {
  combatState = await api("/api/combat/state");
  renderCombatState();
}

// ── WebSocket (for real-time updates from map/AI) ──

function connectWs() {
  ws = new WebSocket(WS_URL);
  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.type === "initiative_update") renderInitiative(msg.payload.order, msg.payload.current_index);
    if (msg.type === "party_status_update") renderPartyStatus(msg.payload.pcs);
    if (msg.type === "narration_text") renderNarration(msg.payload.text, msg.payload.intensity);
    if (msg.type === "combat_action_resolved") {
      addToLog(msg.payload);
      refreshCombatState(); // refresh HP bars etc
    }
  };
  ws.onclose = () => setTimeout(connectWs, 3000);
  ws.onerror = () => ws.close();
}

// ── PC selector ──

function selectPc(pcName) {
  selectedPc = combatState?.pcs?.find(p => p.name === pcName) ?? null;
  document.querySelectorAll(".pc-select-btn").forEach(b => {
    b.classList.toggle("active", b.dataset.name === pcName);
  });
  populateWeapons();
  populateTargets();
}

function populateWeapons() {
  const sel = document.getElementById("attack-weapon");
  sel.innerHTML = '<option value="">Select weapon...</option>';
  if (!selectedPc) return;
  for (const w of selectedPc.weapons) {
    const opt = document.createElement("option");
    opt.value = w.id;
    opt.textContent = `${w.name} (+${w.to_hit}, ${w.damage_dice}+${w.damage_bonus} ${w.damage_type})`;
    sel.appendChild(opt);
  }
}

function populateTargets() {
  const selectors = ["attack-target", "spell-target"];
  for (const selId of selectors) {
    const sel = document.getElementById(selId);
    sel.innerHTML = '<option value="">Select target...</option>';
    if (!combatState) continue;
    // Enemies
    for (const e of (combatState.enemies ?? [])) {
      const opt = document.createElement("option");
      opt.value = `npc_instance:${e.id}`;
      opt.textContent = `${e.name} (HP: ${e.hp}/${e.max_hp}, AC: ${e.ac})`;
      sel.appendChild(opt);
    }
    // PCs (for healing/buffs)
    for (const pc of (combatState.pcs ?? [])) {
      const opt = document.createElement("option");
      opt.value = `pc:${pc.id}`;
      opt.textContent = `${pc.name} (HP: ${pc.hp}/${pc.max_hp})`;
      sel.appendChild(opt);
    }
  }
}

function parseTarget(value) {
  if (!value) return null;
  const [type, id] = value.split(":");
  return { target_type: type, target_id: parseInt(id) };
}

// ── Action handlers ──

async function submitAttack() {
  if (!selectedPc) return showToast("Select a PC first");
  const weaponId = parseInt(document.getElementById("attack-weapon").value);
  const d20 = parseInt(document.getElementById("attack-roll").value);
  const target = parseTarget(document.getElementById("attack-target").value);
  if (!weaponId || !d20 || !target) return showToast("Fill in weapon, target, and d20 roll");

  const result = await api("/api/attack", {
    pc_name: selectedPc.name,
    weapon_id: weaponId,
    d20_roll: d20,
    target_id: target.target_id,
    target_type: target.target_type,
  });

  if (result.error) return showToast(result.error);

  const atk = result.attack;
  showResult(
    `${atk.roll} + ${atk.modifier} = ${atk.total} vs AC ${atk.target_ac}` +
    (atk.critical ? " — CRITICAL HIT!" : atk.hit ? " — HIT!" : " — Miss.") +
    (atk.notes.length ? `\n${atk.notes.join("; ")}` : "")
  );

  // If hit, show damage phase
  if (atk.hit) {
    document.getElementById("damage-phase").classList.remove("hidden");
    document.getElementById("damage-phase").dataset.weaponDamageBonus = result.weapon.damage_bonus;
    document.getElementById("damage-phase").dataset.weaponDamageType = result.weapon.damage_type;
    document.getElementById("damage-phase").dataset.targetId = target.target_id;
    document.getElementById("damage-phase").dataset.targetType = target.target_type;
    document.getElementById("damage-phase").dataset.isCritical = atk.critical;
    document.getElementById("damage-info").textContent =
      `Roll ${result.weapon.damage_dice}${atk.critical ? " (double dice for crit)" : ""} damage:`;
  }

  document.getElementById("attack-roll").value = "";
}

async function submitDamage() {
  const el = document.getElementById("damage-phase");
  const damageRoll = parseInt(document.getElementById("damage-roll-input").value);
  if (!damageRoll) return showToast("Enter damage roll");

  const result = await api("/api/damage", {
    damage_roll: damageRoll,
    damage_bonus: parseInt(el.dataset.weaponDamageBonus),
    damage_type: el.dataset.weaponDamageType,
    is_critical: el.dataset.isCritical === "true",
    target_id: parseInt(el.dataset.targetId),
    target_type: el.dataset.targetType,
  });

  const dmg = result.damage;
  showResult(
    `${dmg.base_damage} + ${dmg.modifier} = ${dmg.final_damage} ${el.dataset.weaponDamageType} damage` +
    (dmg.resistance_applied ? ` (${dmg.resistance_applied})` : "")
  );

  el.classList.add("hidden");
  document.getElementById("damage-roll-input").value = "";
  refreshCombatState();
}

async function submitSpell() {
  // Spells are more complex — for now, queue as structured action for AI
  if (!selectedPc) return showToast("Select a PC first");
  const spellName = document.getElementById("spell-name").value;
  const level = document.getElementById("spell-level").value;
  const target = parseTarget(document.getElementById("spell-target").value);
  const rollValue = document.getElementById("spell-roll").value;
  const effectValue = document.getElementById("spell-effect").value;

  await api("/api/action/free", {
    pc_name: selectedPc.name,
    description: `Casts ${spellName} (${level})${target ? ` at target ${target.target_type}:${target.target_id}` : ""}${rollValue ? `, spell attack/DC: ${rollValue}` : ""}${effectValue ? `, effect: ${effectValue}` : ""}`,
  });

  showResult(`${spellName} queued for AI DM to resolve.`);
  document.getElementById("spell-name").value = "";
  document.getElementById("spell-roll").value = "";
  document.getElementById("spell-effect").value = "";
}

async function submitSave() {
  if (!selectedPc) return showToast("Select a PC first");
  const ability = document.getElementById("save-ability").value;
  const d20 = parseInt(document.getElementById("save-roll").value);
  const dc = parseInt(document.getElementById("save-dc").value);
  if (!d20 || !dc) return showToast("Enter d20 roll and DC");

  const result = await api("/api/save", {
    pc_name: selectedPc.name,
    ability,
    d20_roll: d20,
    dc,
  });

  const save = result.save;
  showResult(
    `${save.roll} + ${save.modifier} = ${save.total} vs DC ${save.dc}` +
    (save.auto_fail ? " — AUTO-FAIL!" : save.success ? " — SUCCESS!" : " — FAILURE.") +
    (save.notes.length ? `\n${save.notes.join("; ")}` : "")
  );

  document.getElementById("save-roll").value = "";
  document.getElementById("save-dc").value = "";
}

async function submitCheck() {
  if (!selectedPc) return showToast("Select a PC first");
  const skill = document.getElementById("check-skill").value;
  const d20 = parseInt(document.getElementById("check-roll").value);
  if (!d20) return showToast("Enter d20 roll");

  const result = await api("/api/check", {
    pc_name: selectedPc.name,
    skill,
    d20_roll: d20,
  });

  const check = result.check;
  showResult(
    `${check.roll} + ${check.ability_mod}${check.proficiency ? ` + ${check.proficiency}` : ""} = ${check.total}` +
    (check.notes.length ? `\n${check.notes.join("; ")}` : "")
  );

  document.getElementById("check-roll").value = "";
}

async function submitFreeAction() {
  if (!selectedPc) return showToast("Select a PC first");
  const desc = document.getElementById("free-action-text").value;
  if (!desc) return showToast("Describe your action");

  await api("/api/action/free", { pc_name: selectedPc.name, description: desc });
  showResult("Creative action sent to AI DM.");
  document.getElementById("free-action-text").value = "";
}

async function submitSay() {
  if (!selectedPc) return showToast("Select a PC first");
  const text = document.getElementById("say-text").value;
  if (!text) return showToast("Enter dialogue");

  await api("/api/action/free", {
    pc_name: selectedPc.name,
    description: `[In character] "${text}"`,
  });
  showResult(`${selectedPc.name}: "${text}"`);
  document.getElementById("say-text").value = "";
}

// ── UI rendering ──

function renderCombatState() {
  if (!combatState) return;

  // PC selector buttons
  const pcSelector = document.getElementById("pc-selector");
  pcSelector.innerHTML = "";
  for (const pc of combatState.pcs ?? []) {
    const btn = document.createElement("button");
    btn.className = "pc-select-btn" + (selectedPc?.name === pc.name ? " active" : "");
    btn.dataset.name = pc.name;
    btn.innerHTML = `<strong>${pc.name}</strong><br>${pc.class} ${pc.level} | ${pc.hp}/${pc.max_hp} HP`;
    btn.onclick = () => selectPc(pc.name);
    pcSelector.appendChild(btn);
  }

  // Party status
  renderPartyStatus(combatState.pcs?.map(pc => ({
    name: pc.name, hp: pc.hp, max_hp: pc.max_hp, conditions: pc.conditions,
  })) ?? []);

  // Enemy list
  const enemyList = document.getElementById("enemy-list");
  enemyList.innerHTML = "";
  for (const e of combatState.enemies ?? []) {
    const div = document.createElement("div");
    div.className = "enemy-card";
    const pct = (e.hp / e.max_hp) * 100;
    div.innerHTML = `<strong>${e.name}</strong> | HP: ${e.hp}/${e.max_hp} | AC: ${e.ac}
      <div class="hp-bar-bg"><div class="hp-bar" style="width:${pct}%;background:${pct > 50 ? "#c62828" : "#b71c1c"}"></div></div>
      ${e.conditions.length ? `<span class="conditions">${e.conditions.join(", ")}</span>` : ""}`;
    enemyList.appendChild(div);
  }

  populateWeapons();
  populateTargets();
}

function renderInitiative(order, currentIndex) {
  const container = document.getElementById("initiative-order");
  container.innerHTML = "";
  for (let i = 0; i < order.length; i++) {
    const div = document.createElement("div");
    div.className = "init-entry" + (i === currentIndex ? " active" : "");
    div.textContent = `${order[i].name} (${order[i].init})`;
    container.appendChild(div);
  }
  const indicator = document.getElementById("turn-indicator");
  if (currentIndex >= 0 && order[currentIndex]?.actor_kind === "pc") {
    indicator.textContent = `${order[currentIndex].name}'s Turn!`;
    indicator.classList.remove("hidden");
  } else {
    indicator.classList.add("hidden");
  }
}

function renderPartyStatus(pcs) {
  const container = document.getElementById("party-list");
  container.innerHTML = "";
  for (const pc of pcs) {
    const pct = Math.max(0, Math.min(100, (pc.hp / pc.max_hp) * 100));
    const color = pct > 50 ? "#4caf50" : pct > 25 ? "#ff9800" : "#f44336";
    const card = document.createElement("div");
    card.className = "pc-card";
    card.innerHTML = `<div class="pc-name">${pc.name}</div>
      <div class="hp-bar-bg"><div class="hp-bar" style="width:${pct}%;background:${color}"></div></div>
      <div class="hp-text">${pc.hp}/${pc.max_hp} HP</div>
      ${pc.conditions?.length ? `<div class="conditions">${pc.conditions.join(", ")}</div>` : ""}`;
    container.appendChild(card);
  }
}

function renderNarration(text, intensity) {
  const el = document.getElementById("narration-text");
  el.textContent = text;
  el.className = intensity === "climax" ? "intensity-climax" : intensity === "tense" ? "intensity-tense" : "";
}

function showResult(text) {
  const el = document.getElementById("action-result");
  el.textContent = text;
  el.classList.remove("hidden");
  setTimeout(() => el.classList.add("hidden"), 8000);
}

function showToast(text) {
  showResult("⚠ " + text);
}

function addToLog(payload) {
  const log = document.getElementById("action-log");
  const entry = document.createElement("div");
  entry.className = "log-entry";
  entry.textContent = `[${new Date().toLocaleTimeString()}] ${payload.type}: ${JSON.stringify(payload.result ?? payload)}`;
  log.prepend(entry);
  // Keep only last 20 entries
  while (log.children.length > 20) log.removeChild(log.lastChild);
}

// ── Tab switching ──

document.querySelectorAll(".tab").forEach(tab => {
  tab.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
    document.querySelectorAll(".action-panel").forEach(p => p.classList.remove("active"));
    tab.classList.add("active");
    document.getElementById(`panel-${tab.dataset.tab}`).classList.add("active");
  });
});

// ── Skill dropdown populate ──

const skillSelect = document.getElementById("check-skill");
const skills = ["athletics","acrobatics","sleight_of_hand","stealth","arcana","history","investigation","nature","religion","animal_handling","insight","medicine","perception","survival","deception","intimidation","performance","persuasion"];
for (const s of skills) {
  const opt = document.createElement("option");
  opt.value = s;
  opt.textContent = s.replace(/_/g, " ");
  skillSelect.appendChild(opt);
}

// ── Start ──

connectWs();
refreshCombatState();
setInterval(refreshCombatState, 5000); // poll for combat state changes

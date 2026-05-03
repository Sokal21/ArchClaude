import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { CampaignDB } from "../db.js";
import { migrate } from "../migrate.js";
import { CampaignDAL } from "../dal/campaign.js";
import { SessionDAL } from "../dal/sessions.js";
import { PCDAL } from "../dal/pcs.js";
import { NPCDAL } from "../dal/npcs.js";
import { CombatDAL } from "../dal/combats.js";
import { LocationDAL } from "../dal/locations.js";
import { FactionDAL } from "../dal/factions.js";
import { QuestDAL } from "../dal/quests.js";
import { ClockDAL } from "../dal/clock.js";
import { InventoryDAL } from "../dal/inventory.js";
import { SeedDAL } from "../dal/seeds.js";
import { SecretDAL } from "../dal/secrets.js";
import { MemoryDAL } from "../dal/memory.js";
import { EventDAL } from "../dal/events.js";
import { EVENT_TYPES } from "@archclaude/shared";

let tmpDir: string;
let campaignDb: CampaignDB;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "archclaude-test-"));
  campaignDb = new CampaignDB(tmpDir);
  migrate(campaignDb);
});

afterEach(() => {
  campaignDb.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

// ── Migration ────────────────────────────────────────────────────────

describe("migrate", () => {
  it("creates all tables", () => {
    const tables = campaignDb.db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
      )
      .all() as { name: string }[];
    const names = tables.map((t) => t.name);

    expect(names).toContain("campaign");
    expect(names).toContain("sessions");
    expect(names).toContain("pcs");
    expect(names).toContain("npcs");
    expect(names).toContain("combats");
    expect(names).toContain("npc_instances");
    expect(names).toContain("locations");
    expect(names).toContain("factions");
    expect(names).toContain("quests");
    expect(names).toContain("clock");
    expect(names).toContain("inventory");
    expect(names).toContain("seeds");
    expect(names).toContain("secrets");
    expect(names).toContain("memory_chunks");
    expect(names).toContain("events");
    expect(names).toContain("schema_migrations");
  });

  it("is idempotent", () => {
    const applied = migrate(campaignDb);
    expect(applied).toBe(0);
  });
});

// ── Campaign ─────────────────────────────────────────────────────────

describe("CampaignDAL", () => {
  it("creates and reads campaign", () => {
    const dal = new CampaignDAL(campaignDb.db);
    const campaign = dal.create("Test Campaign");
    expect(campaign.name).toBe("Test Campaign");
    expect(campaign.system).toBe("5e-2024");
    expect(campaign.schema_version).toBe(1);

    const fetched = dal.get();
    expect(fetched?.name).toBe("Test Campaign");
  });

  it("updates campaign", () => {
    const dal = new CampaignDAL(campaignDb.db);
    dal.create("Old Name");
    const updated = dal.update({ name: "New Name" });
    expect(updated.name).toBe("New Name");
  });
});

// ── Sessions ─────────────────────────────────────────────────────────

describe("SessionDAL", () => {
  it("CRUD operations", () => {
    const dal = new SessionDAL(campaignDb.db);

    const session = dal.create({ number: 1, played_at: "2026-05-01" });
    expect(session.number).toBe(1);
    expect(session.played_at).toBe("2026-05-01");

    const updated = dal.update(session.id, {
      ended_at: "2026-05-01T23:00:00Z",
      key_events_json: ["Found the sword", "Met the king"],
    });
    expect(updated.ended_at).toBe("2026-05-01T23:00:00Z");
    expect(updated.key_events_json).toEqual(["Found the sword", "Met the king"]);

    const byNumber = dal.getByNumber(1);
    expect(byNumber?.id).toBe(session.id);

    const all = dal.list();
    expect(all).toHaveLength(1);

    expect(dal.delete(session.id)).toBe(true);
    expect(dal.list()).toHaveLength(0);
  });
});

// ── PCs ──────────────────────────────────────────────────────────────

describe("PCDAL", () => {
  it("CRUD with JSON columns", () => {
    const dal = new PCDAL(campaignDb.db);

    const pc = dal.create({
      name: "Tharivol",
      player_name: "Alice",
      class: "Paladin",
      level: 5,
      max_hp: 45,
      current_hp: 45,
      ac: 18,
      initiative_bonus: 2,
      senses_json: { darkvision: 60, passive_perception: 14 },
      saves_json: { str: 2, cha: 5 },
    });

    expect(pc.name).toBe("Tharivol");
    expect(pc.senses_json).toEqual({ darkvision: 60, passive_perception: 14 });
    expect(pc.saves_json).toEqual({ str: 2, cha: 5 });
    expect(pc.active).toBe(true);

    const updated = dal.update(pc.id, {
      current_hp: 30,
      conditions_json: ["poisoned:2", "prone"],
      spell_slots_json: { max: { "1": 4, "2": 2 }, current: { "1": 2, "2": 1 } },
    });
    expect(updated.current_hp).toBe(30);
    expect(updated.conditions_json).toEqual(["poisoned:2", "prone"]);
    expect(updated.spell_slots_json?.current["1"]).toBe(2);

    const active = dal.listActive();
    expect(active).toHaveLength(1);

    dal.update(pc.id, { active: false });
    expect(dal.listActive()).toHaveLength(0);
    expect(dal.listAll()).toHaveLength(1);
  });
});

// ── NPCs ─────────────────────────────────────────────────────────────

describe("NPCDAL", () => {
  it("CRUD with filters", () => {
    const dal = new NPCDAL(campaignDb.db);

    dal.create({ name: "Vincent", role: "patron", faction: "Crimson Court" });
    dal.create({ name: "Mordax", role: "BBEG", status: "alive", faction: "Shadow Order" });

    expect(dal.list()).toHaveLength(2);
    expect(dal.list({ faction: "Crimson Court" })).toHaveLength(1);
    expect(dal.getByName("Vincent")?.role).toBe("patron");

    dal.update(dal.getByName("Mordax")!.id, { status: "dead" });
    expect(dal.list({ status: "dead" })).toHaveLength(1);
  });
});

// ── Combat ───────────────────────────────────────────────────────────

describe("CombatDAL", () => {
  let sessionDal: SessionDAL;

  beforeEach(() => {
    sessionDal = new SessionDAL(campaignDb.db);
    sessionDal.create({ number: 1 });
  });

  it("creates combat with instances", () => {
    const dal = new CombatDAL(campaignDb.db);
    const session = sessionDal.getByNumber(1)!;

    const combat = dal.createCombat({
      session_id: session.id,
      intensity: "tense",
      narrative_context: "Ambush in the forest",
    });
    expect(combat.intensity).toBe("tense");
    expect(combat.round_number).toBe(1);

    const goblin = dal.createInstance({
      combat_id: combat.id,
      template_key: "srd:goblin",
      display_name: "Goblin 1",
      max_hp: 7,
      current_hp: 7,
      ac: 15,
    });
    expect(goblin.display_name).toBe("Goblin 1");
    expect(goblin.defeated).toBe(false);

    dal.updateInstance(goblin.id, { current_hp: 0, defeated: true });
    const updated = dal.getInstance(goblin.id)!;
    expect(updated.current_hp).toBe(0);
    expect(updated.defeated).toBe(true);

    dal.updateCombat(combat.id, {
      initiative_json: [
        { actor_kind: "npc_instance", actor_id: goblin.id, init: 15 },
      ],
      current_turn: 0,
    });
    const updatedCombat = dal.getById(combat.id)!;
    expect(updatedCombat.initiative_json).toHaveLength(1);

    expect(dal.getActive()).toBeDefined();
    dal.updateCombat(combat.id, {
      ended_at: new Date().toISOString(),
      outcome: "victory",
    });
    expect(dal.getActive()).toBeUndefined();
  });
});

// ── Locations ────────────────────────────────────────────────────────

describe("LocationDAL", () => {
  it("CRUD with hierarchy", () => {
    const dal = new LocationDAL(campaignDb.db);

    const region = dal.create({ name: "Sword Coast", type: "wilderness" });
    const city = dal.create({
      name: "Goldspire",
      type: "city",
      parent_id: region.id,
      status: "visited",
    });

    expect(dal.list({ parent_id: region.id })).toHaveLength(1);
    expect(dal.getByName("Goldspire")?.parent_id).toBe(region.id);

    dal.update(city.id, { status: "cleared" });
    expect(dal.getById(city.id)?.status).toBe("cleared");
  });
});

// ── Factions ─────────────────────────────────────────────────────────

describe("FactionDAL", () => {
  it("CRUD operations", () => {
    const dal = new FactionDAL(campaignDb.db);
    const faction = dal.create({ name: "Crimson Court", reputation: 5 });
    expect(faction.reputation).toBe(5);

    dal.update(faction.id, { reputation: -3, status: "hostile" });
    expect(dal.getById(faction.id)?.reputation).toBe(-3);
  });
});

// ── Quests ───────────────────────────────────────────────────────────

describe("QuestDAL", () => {
  it("CRUD operations", () => {
    const dal = new QuestDAL(campaignDb.db);
    const quest = dal.create({
      title: "The Lost Heir",
      summary: "Find the missing princess",
    });

    expect(dal.listActive()).toHaveLength(1);

    dal.update(quest.id, { state: "completed", resolved_session: 5 });
    expect(dal.listActive()).toHaveLength(0);
    expect(dal.list({ state: "completed" })).toHaveLength(1);
  });
});

// ── Clock ────────────────────────────────────────────────────────────

describe("ClockDAL", () => {
  it("init and update", () => {
    const dal = new ClockDAL(campaignDb.db);
    dal.init({ in_world_date: "14 Mirtul, 1492 DR", time_of_day: "dawn" });

    const clock = dal.get()!;
    expect(clock.in_world_date).toBe("14 Mirtul, 1492 DR");
    expect(clock.time_of_day).toBe("dawn");

    dal.update({ time_of_day: "midday", party_state: "exploring" });
    const updated = dal.get()!;
    expect(updated.time_of_day).toBe("midday");
    expect(updated.party_state).toBe("exploring");
  });
});

// ── Inventory ────────────────────────────────────────────────────────

describe("InventoryDAL", () => {
  it("CRUD with ownership", () => {
    const dal = new InventoryDAL(campaignDb.db);
    const pcDal = new PCDAL(campaignDb.db);

    const pc = pcDal.create({
      name: "Tharivol",
      level: 5,
      max_hp: 45,
      current_hp: 45,
      ac: 18,
    });

    dal.create({ owner_kind: "pc", owner_id: pc.id, name: "Flame Tongue", kind: "magic_item" });
    dal.create({ owner_kind: "party", name: "500 gold", kind: "currency", qty: 500 });

    expect(dal.listByOwner("pc", pc.id)).toHaveLength(1);
    expect(dal.listByOwner("party")).toHaveLength(1);
    expect(dal.listAll()).toHaveLength(2);
  });
});

// ── Seeds ────────────────────────────────────────────────────────────

describe("SeedDAL", () => {
  it("CRUD operations", () => {
    const dal = new SeedDAL(campaignDb.db);
    const seed = dal.create({
      text: "A bard hums a familiar melody",
      trigger_condition: "party_at:Goldspire AND session>=4",
      visibility: "public",
      planted_session: 1,
    });

    expect(dal.listPlanted()).toHaveLength(1);

    dal.update(seed.id, { status: "triggered", triggered_session: 4 });
    expect(dal.listPlanted()).toHaveLength(0);
    expect(dal.list({ status: "triggered" })).toHaveLength(1);
  });
});

// ── Secrets ──────────────────────────────────────────────────────────

describe("SecretDAL", () => {
  it("CRUD operations", () => {
    const dal = new SecretDAL(campaignDb.db);
    dal.create({
      topic: "innkeeper_betrayal",
      text: "The innkeeper is a spy for the Shadow Order",
    });

    expect(dal.listHidden()).toHaveLength(1);

    const secret = dal.listHidden()[0];
    dal.update(secret.id, { status: "revealed" });
    expect(dal.listHidden()).toHaveLength(0);
  });
});

// ── Memory chunks + FTS ──────────────────────────────────────────────

describe("MemoryDAL", () => {
  it("creates and searches chunks", () => {
    const dal = new MemoryDAL(campaignDb.db);

    dal.create({
      kind: "session_summary",
      text: "The party entered the Hollow Wood and encountered shadow wolves",
      source_file: "sessions/session_03.md",
      source_session: 3,
      tags_json: ["loc:hollow_wood", "npc:shadow_wolves"],
    });

    dal.create({
      kind: "npc_note",
      text: "Vincent Blackwood is a patron of the Crimson Court with aristocratic manners",
      source_file: "npcs/vincent_blackwood.md",
      tags_json: ["npc:vincent_blackwood", "faction:crimson_court"],
    });

    // FTS search
    const results = dal.search("shadow wolves");
    expect(results).toHaveLength(1);
    expect(results[0].kind).toBe("session_summary");

    const vincent = dal.search("Crimson Court aristocratic");
    expect(vincent).toHaveLength(1);

    // Tag-filtered search
    const tagged = dal.searchWithTags("shadow", ["loc:hollow_wood"]);
    expect(tagged).toHaveLength(1);

    // By source
    expect(dal.listBySource("sessions/session_03.md")).toHaveLength(1);

    // Delete by source (used before re-indexing)
    dal.deleteBySource("sessions/session_03.md");
    expect(dal.listBySource("sessions/session_03.md")).toHaveLength(0);
  });
});

// ── Event log ────────────────────────────────────────────────────────

describe("EventDAL", () => {
  let sessionDal: SessionDAL;

  beforeEach(() => {
    sessionDal = new SessionDAL(campaignDb.db);
    sessionDal.create({ number: 1 });
  });

  it("appends and projects events", () => {
    const dal = new EventDAL(campaignDb.db);
    const session = sessionDal.getByNumber(1)!;

    dal.append({
      session_id: session.id,
      source: "orchestrator",
      type: EVENT_TYPES.SESSION_STARTED,
      payload: { session_id: session.id },
    });

    dal.append({
      session_id: session.id,
      source: "combat",
      type: EVENT_TYPES.DAMAGE_DEALT,
      payload: {
        source: "Goblin 1",
        target_kind: "pc",
        target_id: 1,
        amount: 7,
        damage_type: "slashing",
      },
    });

    const events = dal.project(session.id);
    expect(events).toHaveLength(2);
    expect(events[0].type).toBe("session_started");
    expect(events[1].type).toBe("damage_dealt");
    expect(events[1].payload_json).toEqual({
      source: "Goblin 1",
      target_kind: "pc",
      target_id: 1,
      amount: 7,
      damage_type: "slashing",
    });
  });

  it("reverts events", () => {
    const dal = new EventDAL(campaignDb.db);
    const session = sessionDal.getByNumber(1)!;

    const event = dal.append({
      session_id: session.id,
      source: "combat",
      type: EVENT_TYPES.DAMAGE_DEALT,
      payload: {
        source: "Goblin",
        target_kind: "pc",
        target_id: 1,
        amount: 7,
        damage_type: "slashing",
      },
    });

    expect(dal.revert(event.id)).toBe(true);
    // Already reverted
    expect(dal.revert(event.id)).toBe(false);

    // Reverted events excluded by default
    expect(dal.project(session.id)).toHaveLength(0);
    // But visible when requested
    expect(dal.project(session.id, true)).toHaveLength(1);
  });

  it("lists by type and counts", () => {
    const dal = new EventDAL(campaignDb.db);
    const session = sessionDal.getByNumber(1)!;

    dal.append({
      session_id: session.id,
      source: "combat",
      type: EVENT_TYPES.DAMAGE_DEALT,
      payload: { source: "G1", target_kind: "pc", target_id: 1, amount: 5, damage_type: "slashing" },
    });
    dal.append({
      session_id: session.id,
      source: "combat",
      type: EVENT_TYPES.DAMAGE_DEALT,
      payload: { source: "G2", target_kind: "pc", target_id: 1, amount: 3, damage_type: "piercing" },
    });
    dal.append({
      session_id: session.id,
      source: "combat",
      type: EVENT_TYPES.HEALING_APPLIED,
      payload: { target_kind: "pc", target_id: 1, amount: 8 },
    });

    expect(dal.listByType("damage_dealt", session.id)).toHaveLength(2);
    expect(dal.count({ type: "damage_dealt" })).toBe(2);
    expect(dal.count({ session_id: session.id })).toBe(3);

    const recent = dal.recent(2);
    expect(recent).toHaveLength(2);
    expect(recent[0].type).toBe("healing_applied"); // most recent first
  });
});

// ── Transaction support ──────────────────────────────────────────────

describe("CampaignDB.transaction", () => {
  it("commits on success", () => {
    const dal = new CampaignDAL(campaignDb.db);
    campaignDb.transaction(() => {
      dal.create("Transacted Campaign");
    });
    expect(dal.get()?.name).toBe("Transacted Campaign");
  });

  it("rolls back on error", () => {
    const dal = new CampaignDAL(campaignDb.db);
    try {
      campaignDb.transaction(() => {
        dal.create("Should Rollback");
        throw new Error("test error");
      });
    } catch {
      // expected
    }
    expect(dal.get()).toBeUndefined();
  });
});

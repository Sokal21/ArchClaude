import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { CampaignDB } from "../db.js";
import { migrate } from "../migrate.js";
import { indexCampaign } from "../indexer.js";
import { NPCDAL } from "../dal/npcs.js";
import { LocationDAL } from "../dal/locations.js";
import { SessionDAL } from "../dal/sessions.js";
import { MemoryDAL } from "../dal/memory.js";

let tmpDir: string;
let campaignDb: CampaignDB;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "archclaude-indexer-test-"));
  // Create campaign folder structure
  for (const dir of ["npcs", "locations", "lore", "sessions", "characters"]) {
    mkdirSync(join(tmpDir, dir), { recursive: true });
  }
  campaignDb = new CampaignDB(tmpDir);
  migrate(campaignDb);
});

afterEach(() => {
  campaignDb.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("indexCampaign", () => {
  it("indexes NPC markdown into npcs table and memory chunks", () => {
    writeFileSync(
      join(tmpDir, "npcs", "vincent_blackwood.md"),
      `---
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
never rushes a sentence.

## Hooks
- Owes a debt to Tharivol
- Searching for his missing daughter
`,
    );

    const result = indexCampaign(campaignDb);
    expect(result.files_processed).toBe(1);
    expect(result.chunks_created).toBeGreaterThan(0);
    expect(result.errors).toHaveLength(0);

    const npcDal = new NPCDAL(campaignDb.db);
    const vincent = npcDal.getByName("Vincent Blackwood");
    expect(vincent).toBeDefined();
    expect(vincent!.role).toBe("Patron");
    expect(vincent!.faction).toBe("The Crimson Court");
    expect(vincent!.dossier_file).toBe("npcs/vincent_blackwood.md");

    const memoryDal = new MemoryDAL(campaignDb.db);
    const chunks = memoryDal.listBySource("npcs/vincent_blackwood.md");
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0].tags_json).toContain("npc:vincent_blackwood");

    // FTS works on indexed content
    const results = memoryDal.search("diplomat duelist");
    expect(results.length).toBeGreaterThan(0);
  });

  it("indexes location markdown", () => {
    writeFileSync(
      join(tmpDir, "locations", "goldspire.md"),
      `---
name: Goldspire
type: city
status: visited
introduced_session: 1
---

# Goldspire

A gleaming trade city built around a massive golden spire.
`,
    );

    indexCampaign(campaignDb);

    const locationDal = new LocationDAL(campaignDb.db);
    const goldspire = locationDal.getByName("Goldspire");
    expect(goldspire).toBeDefined();
    expect(goldspire!.type).toBe("city");
    expect(goldspire!.status).toBe("visited");
  });

  it("indexes session summaries", () => {
    writeFileSync(
      join(tmpDir, "sessions", "session_03.md"),
      `---
session: 3
played_at: "2026-04-15"
key_events:
  - Tharivol struck a deal with Vincent Blackwood
  - Party entered the Hollow Wood
npcs_introduced:
  - vincent_blackwood
  - captain_morr
locations_visited:
  - goldspire
  - hollow_wood
---

# Session 3 — The Hollow Wood

The session opened in Goldspire's marketplace at dawn. Tharivol approached
Vincent Blackwood about the missing heir quest.

## The Hollow Wood

After leaving Goldspire, the party traveled into the Hollow Wood where they
encountered shadow wolves and discovered a cairn marked with a strange sigil.
`,
    );

    indexCampaign(campaignDb);

    const sessionDal = new SessionDAL(campaignDb.db);
    const session = sessionDal.getByNumber(3);
    expect(session).toBeDefined();
    expect(session!.played_at).toBe("2026-04-15");
    expect(session!.key_events_json).toContain("Party entered the Hollow Wood");

    const memoryDal = new MemoryDAL(campaignDb.db);
    const chunks = memoryDal.listBySource("sessions/session_03.md");
    expect(chunks.length).toBeGreaterThan(0);

    // Tags from frontmatter arrays
    expect(chunks[0].tags_json).toContain("npc:vincent_blackwood");
    expect(chunks[0].tags_json).toContain("loc:goldspire");
  });

  it("is idempotent — re-indexing replaces chunks", () => {
    writeFileSync(
      join(tmpDir, "npcs", "test.md"),
      `---
name: Test NPC
role: guard
---

# Test NPC

Original description of the guard.
`,
    );

    indexCampaign(campaignDb);
    const memoryDal = new MemoryDAL(campaignDb.db);
    expect(memoryDal.listBySource("npcs/test.md")).toHaveLength(1);

    // Re-index with updated content
    writeFileSync(
      join(tmpDir, "npcs", "test.md"),
      `---
name: Test NPC
role: captain
---

# Test NPC

Updated description — now a captain.

## Background

Has served for 20 years.
`,
    );

    indexCampaign(campaignDb);
    const chunks = memoryDal.listBySource("npcs/test.md");
    expect(chunks).toHaveLength(2); // two headings = two chunks
    expect(memoryDal.search("captain")[0].text).toContain("captain");

    // NPC table also updated
    const npcDal = new NPCDAL(campaignDb.db);
    expect(npcDal.getByName("Test NPC")!.role).toBe("captain");
  });

  it("handles lore files without specific frontmatter", () => {
    writeFileSync(
      join(tmpDir, "lore", "factions.md"),
      `# Factions of the Realm

## The Crimson Court

A shadowy organization of nobles.

## The Silver Hand

A paladin order sworn to protect the innocent.
`,
    );

    const result = indexCampaign(campaignDb);
    expect(result.files_processed).toBe(1);
    expect(result.chunks_created).toBe(3); // title chunk + 2 faction chunks
  });
});

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { CampaignDB } from "../db.js";
import { migrate } from "../migrate.js";
import { buildEntityTagger } from "../entity-tagger.js";
import { generateQueryVariants, buildFTS5Query } from "../query-rewrite.js";
import { buildSecretFilter } from "../secret-filter.js";
import { evaluateSeeds } from "../seed-evaluator.js";
import { NPCDAL } from "../dal/npcs.js";
import { LocationDAL } from "../dal/locations.js";
import { FactionDAL } from "../dal/factions.js";
import { SecretDAL } from "../dal/secrets.js";
import { SeedDAL } from "../dal/seeds.js";

let tmpDir: string;
let campaignDb: CampaignDB;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "archclaude-p5-test-"));
  campaignDb = new CampaignDB(tmpDir);
  migrate(campaignDb);
});

afterEach(() => {
  campaignDb.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("Entity tagger", () => {
  it("extracts entity tags from text", () => {
    const npcDal = new NPCDAL(campaignDb.db);
    const locDal = new LocationDAL(campaignDb.db);
    const facDal = new FactionDAL(campaignDb.db);

    npcDal.create({ name: "Vincent Blackwood" });
    locDal.create({ name: "Goldspire" });
    facDal.create({ name: "Crimson Court" });

    const tagger = buildEntityTagger(campaignDb.db);

    const tags = tagger("Vincent Blackwood met the party at Goldspire to discuss the Crimson Court's plans.");
    expect(tags).toContain("npc:vincent_blackwood");
    expect(tags).toContain("loc:goldspire");
    expect(tags).toContain("faction:crimson_court");
  });

  it("returns empty for unrecognized text", () => {
    const tagger = buildEntityTagger(campaignDb.db);
    expect(tagger("Just some random text.")).toEqual([]);
  });
});

describe("Query rewrite", () => {
  it("generates keyword variants", () => {
    const variants = generateQueryVariants("what happened at the inn with the fight");
    expect(variants.length).toBeGreaterThan(1);
    // Should include synonym expansions
    const joined = variants.join(" ");
    expect(joined).toMatch(/tavern|combat|battle/i);
  });

  it("builds FTS5 OR queries", () => {
    const query = buildFTS5Query(["shadow wolves", "wolves hollow"]);
    expect(query).toContain("OR");
  });
});

describe("Secret filter", () => {
  it("detects leaked secret content", () => {
    const secretDal = new SecretDAL(campaignDb.db);
    secretDal.create({
      topic: "spy_identity",
      text: "The innkeeper Elara is secretly a spy for the Grey Exchange.",
    });

    const filter = buildSecretFilter(campaignDb.db);

    // Should catch direct mention
    const result = filter("Elara revealed that she was a spy for the Grey Exchange.");
    expect(result.safe).toBe(false);
    expect(result.leaked_topics).toContain("spy_identity");
  });

  it("passes clean narration", () => {
    const secretDal = new SecretDAL(campaignDb.db);
    secretDal.create({
      topic: "hidden_vault",
      text: "There is a hidden vault beneath the mountain containing an ancient artifact.",
    });

    const filter = buildSecretFilter(campaignDb.db);
    const result = filter("The party entered the tavern and ordered drinks.");
    expect(result.safe).toBe(true);
  });
});

describe("Seed evaluator", () => {
  it("triggers seeds when conditions match", () => {
    const seedDal = new SeedDAL(campaignDb.db);
    seedDal.create({
      text: "A bard hums a familiar melody.",
      trigger_condition: "party_at:Goldspire AND session>=4",
    });
    seedDal.create({
      text: "The ground trembles slightly.",
      trigger_condition: "party_at:The Vault",
    });
    seedDal.create({
      text: "Unreachable seed.",
      trigger_condition: "session>=100",
    });

    // Context matches first seed
    const triggered = evaluateSeeds(campaignDb.db, {
      current_location: "Goldspire",
      session_number: 5,
    });
    expect(triggered).toHaveLength(1);
    expect(triggered[0].text).toContain("bard");

    // Context matches second seed
    const triggered2 = evaluateSeeds(campaignDb.db, {
      current_location: "The Vault",
      session_number: 2,
    });
    expect(triggered2).toHaveLength(1);
    expect(triggered2[0].text).toContain("trembles");

    // No match
    const none = evaluateSeeds(campaignDb.db, {
      current_location: "Millhaven",
      session_number: 1,
    });
    expect(none).toHaveLength(0);
  });
});

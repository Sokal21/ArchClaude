/**
 * @archclaude/state — Campaign state DAL + event log + markdown indexer.
 *
 * This package owns all SQLite access. No other package should import
 * better-sqlite3 directly. All reads and writes go through typed DAL
 * modules that serialize/deserialize JSON columns automatically.
 */

export { CampaignDB } from "./db.js";
export { migrate } from "./migrate.js";
export { indexCampaign } from "./indexer.js";

// DAL modules
export { CampaignDAL } from "./dal/campaign.js";
export { SessionDAL } from "./dal/sessions.js";
export { PCDAL } from "./dal/pcs.js";
export { NPCDAL } from "./dal/npcs.js";
export { CombatDAL } from "./dal/combats.js";
export { LocationDAL } from "./dal/locations.js";
export { FactionDAL } from "./dal/factions.js";
export { QuestDAL } from "./dal/quests.js";
export { ClockDAL } from "./dal/clock.js";
export { InventoryDAL } from "./dal/inventory.js";
export { SeedDAL } from "./dal/seeds.js";
export { SecretDAL } from "./dal/secrets.js";
export { MemoryDAL } from "./dal/memory.js";
export { EventDAL } from "./dal/events.js";

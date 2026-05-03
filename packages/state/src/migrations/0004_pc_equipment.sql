-- Migration 0004: Structured PC equipment and ability scores
--
-- Stores equipped weapons, armor, and ability scores in a queryable format.
-- The rules calculator uses this to compute to-hit, damage, saves, and checks.

-- Ability scores (needed for modifier calculation)
ALTER TABLE pcs ADD COLUMN str INTEGER NOT NULL DEFAULT 10;
ALTER TABLE pcs ADD COLUMN dex INTEGER NOT NULL DEFAULT 10;
ALTER TABLE pcs ADD COLUMN con INTEGER NOT NULL DEFAULT 10;
ALTER TABLE pcs ADD COLUMN int INTEGER NOT NULL DEFAULT 10;
ALTER TABLE pcs ADD COLUMN wis INTEGER NOT NULL DEFAULT 10;
ALTER TABLE pcs ADD COLUMN cha INTEGER NOT NULL DEFAULT 10;
ALTER TABLE pcs ADD COLUMN proficiency_bonus INTEGER NOT NULL DEFAULT 2;

-- Equipped weapons: each PC can have multiple
CREATE TABLE pc_weapons (
    id          INTEGER PRIMARY KEY,
    pc_id       INTEGER NOT NULL,
    name        TEXT NOT NULL,
    slug        TEXT,                    -- SRD weapon slug for lookup
    to_hit      INTEGER NOT NULL,        -- total attack modifier (ability + proficiency + magic)
    damage_dice TEXT NOT NULL,           -- e.g. '1d8', '2d6'
    damage_bonus INTEGER NOT NULL DEFAULT 0,  -- ability mod + magic bonus
    damage_type TEXT NOT NULL,           -- slashing, piercing, etc.
    properties  TEXT,                    -- JSON array: ["versatile:1d10", "finesse", "thrown:30/120"]
    range_normal INTEGER,               -- null for melee-only
    range_long   INTEGER,
    is_magic    INTEGER NOT NULL DEFAULT 0,
    notes       TEXT,                    -- "Sir Aldric's Shield glow vs undead"
    FOREIGN KEY (pc_id) REFERENCES pcs(id)
);

-- Equipped armor
CREATE TABLE pc_armor (
    id          INTEGER PRIMARY KEY,
    pc_id       INTEGER NOT NULL,
    name        TEXT NOT NULL,
    slug        TEXT,
    base_ac     INTEGER NOT NULL,
    ac_bonus    INTEGER NOT NULL DEFAULT 0,  -- magic bonus
    type        TEXT NOT NULL,           -- 'light', 'medium', 'heavy', 'shield'
    notes       TEXT,
    FOREIGN KEY (pc_id) REFERENCES pcs(id)
);

-- Skill proficiencies
CREATE TABLE pc_skills (
    id          INTEGER PRIMARY KEY,
    pc_id       INTEGER NOT NULL,
    skill       TEXT NOT NULL,           -- 'athletics', 'perception', etc.
    ability     TEXT NOT NULL,           -- 'str', 'dex', 'wis', etc.
    proficient  INTEGER NOT NULL DEFAULT 1,  -- 1 = proficient, 2 = expertise
    FOREIGN KEY (pc_id) REFERENCES pcs(id),
    UNIQUE(pc_id, skill)
);

-- Save proficiencies
CREATE TABLE pc_save_proficiencies (
    id          INTEGER PRIMARY KEY,
    pc_id       INTEGER NOT NULL,
    ability     TEXT NOT NULL,           -- 'str', 'dex', 'con', 'int', 'wis', 'cha'
    FOREIGN KEY (pc_id) REFERENCES pcs(id),
    UNIQUE(pc_id, ability)
);

INSERT INTO schema_migrations (version, applied_at) VALUES (4, datetime('now'));

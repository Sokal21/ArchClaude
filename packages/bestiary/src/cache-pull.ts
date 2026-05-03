#!/usr/bin/env node

/**
 * CLI command to pull the SRD cache from Open5e.
 * Run: pnpm --filter @archclaude/bestiary cache:pull
 */

import { pullCache } from "./cache.js";

pullCache()
  .then((counts) => {
    console.log(`\nCache populated: ${counts.monsters} monsters, ${counts.spells} spells, ${counts.conditions} conditions.`);
  })
  .catch((err) => {
    console.error("Failed to pull cache:", err);
    process.exit(1);
  });

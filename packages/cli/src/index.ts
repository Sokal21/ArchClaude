#!/usr/bin/env node

/**
 * @archclaude/cli — `archclaude init`, `archclaude doctor`, dev tools.
 */

import { run } from "./cli.js";

run(process.argv.slice(2));

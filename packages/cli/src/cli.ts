/**
 * CLI entry point — routes subcommands to handlers.
 *
 * Intentionally minimal: no arg-parsing library for now.
 * Just positional commands: `archclaude init <folder>`, `archclaude doctor <folder>`.
 */

import { initCommand } from "./commands/init.js";
import { doctorCommand } from "./commands/doctor.js";
import { reindexCommand } from "./commands/reindex.js";
import { checkCommand } from "./commands/check.js";

export function run(args: string[]): void {
  const [command, ...rest] = args;

  switch (command) {
    case "init":
      initCommand(rest[0]);
      break;
    case "doctor":
      doctorCommand(rest[0]);
      break;
    case "reindex":
      reindexCommand(rest[0]);
      break;
    case "check":
      checkCommand(rest[0]);
      break;
    case "--help":
    case "-h":
    case undefined:
      printHelp();
      break;
    default:
      console.error(`Unknown command: ${command}`);
      printHelp();
      process.exit(1);
  }
}

function printHelp(): void {
  console.log(`
archclaude — AI-powered D&D 5e campaign management

Usage:
  archclaude init <folder>     Create a new campaign folder
  archclaude doctor <folder>   Validate a campaign folder
  archclaude reindex <folder>  Re-index markdown into the database
  archclaude check <folder>    Verify session readiness
  archclaude --help            Show this help
`);
}

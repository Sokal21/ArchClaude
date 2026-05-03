import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";

const CLI_PATH = join(import.meta.dirname, "..", "..", "dist", "index.js");

function runCli(args: string[]): string {
  return execFileSync("node", [CLI_PATH, ...args], {
    encoding: "utf-8",
    timeout: 10000,
  });
}

let tmpDir: string;

afterEach(() => {
  if (tmpDir && existsSync(tmpDir)) {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

describe("archclaude init", () => {
  it("creates campaign folder structure", () => {
    tmpDir = join(mkdtempSync(join(tmpdir(), "archclaude-cli-")), "my-campaign");
    const output = runCli(["init", tmpDir]);

    expect(output).toContain("Campaign \"my-campaign\" is ready");

    // Check directories
    expect(existsSync(join(tmpDir, "sessions"))).toBe(true);
    expect(existsSync(join(tmpDir, "npcs"))).toBe(true);
    expect(existsSync(join(tmpDir, "locations"))).toBe(true);
    expect(existsSync(join(tmpDir, "lore"))).toBe(true);
    expect(existsSync(join(tmpDir, "characters"))).toBe(true);
    expect(existsSync(join(tmpDir, "homebrew"))).toBe(true);
    expect(existsSync(join(tmpDir, "assets", "npc_portraits"))).toBe(true);

    // Check files
    expect(existsSync(join(tmpDir, "campaign.json"))).toBe(true);
    expect(existsSync(join(tmpDir, "seeds.json"))).toBe(true);
    expect(existsSync(join(tmpDir, "secrets.md"))).toBe(true);
    expect(existsSync(join(tmpDir, "campaign.db"))).toBe(true);

    // Check campaign.json content
    const config = JSON.parse(readFileSync(join(tmpDir, "campaign.json"), "utf-8"));
    expect(config.name).toBe("my-campaign");
    expect(config.system).toBe("5e-2024");
    expect(config.schema_version).toBe(1);
  });

  it("is idempotent", () => {
    tmpDir = join(mkdtempSync(join(tmpdir(), "archclaude-cli-")), "test-camp");
    runCli(["init", tmpDir]);
    const output = runCli(["init", tmpDir]);
    expect(output).toContain("Skipped campaign.json");
    expect(output).toContain("0 migration(s) applied");
  });
});

describe("archclaude doctor", () => {
  it("passes on a fresh campaign", () => {
    tmpDir = join(mkdtempSync(join(tmpdir(), "archclaude-cli-")), "healthy");
    runCli(["init", tmpDir]);
    const output = runCli(["doctor", tmpDir]);
    expect(output).toContain("All checks passed");
  });

  it("fails on a missing folder", () => {
    expect(() => {
      runCli(["doctor", "/tmp/nonexistent-campaign-" + Date.now()]);
    }).toThrow();
  });
});

/**
 * Speech-to-text bridge.
 *
 * Spawns faster-whisper as a subprocess and feeds it audio chunks.
 * Returns transcribed text tagged with the player identity.
 *
 * Architecture: The STT pipeline runs locally. Audio comes from
 * push-to-talk events (one mic, per-player PTT buttons, or
 * per-device in a LAN setup). The service identifies who's speaking
 * by which PTT channel fired.
 *
 * The raw transcript goes through a cleanup pass (stt-cleanup.ts)
 * before reaching the orchestrator, to save tokens on filler words
 * and STT artifacts.
 *
 * Dependencies:
 *   - faster-whisper must be installed: pip install faster-whisper
 *   - A microphone accessible to the system
 *
 * This module provides the interface. The actual subprocess management
 * is implemented to work with faster-whisper's CLI or a simple
 * Python bridge script.
 */

import { spawn, type ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import type { STTResult } from "./types.js";

export interface STTConfig {
  /** Path to the faster-whisper model (e.g. "base", "small", "medium"). */
  model: string;
  /** Language code (e.g. "en"). */
  language: string;
  /** Path to the Python bridge script. */
  bridge_script?: string;
}

/**
 * STT engine that manages the faster-whisper subprocess.
 *
 * Usage:
 *   const stt = new STTEngine(config);
 *   stt.on("transcript", (result: STTResult) => { ... });
 *   stt.startListening(playerId);
 *   stt.stopListening(playerId);
 */
export class STTEngine extends EventEmitter {
  private config: STTConfig;
  private processes: Map<string, ChildProcess> = new Map();

  constructor(config: STTConfig) {
    super();
    this.config = config;
  }

  /**
   * Start listening for a player (push-to-talk activated).
   * Spawns a faster-whisper process that records and transcribes.
   */
  startListening(playerId: string): void {
    if (this.processes.has(playerId)) return;

    // Spawn the Python bridge that handles mic recording + whisper
    const bridgeScript = this.config.bridge_script ?? "stt_bridge.py";
    const proc = spawn("python3", [
      bridgeScript,
      "--model", this.config.model,
      "--language", this.config.language,
      "--player-id", playerId,
    ], {
      stdio: ["pipe", "pipe", "pipe"],
    });

    proc.stdout?.on("data", (data: Buffer) => {
      try {
        const result = JSON.parse(data.toString().trim()) as STTResult;
        this.emit("transcript", result);
      } catch {
        // Non-JSON output, ignore
      }
    });

    proc.stderr?.on("data", (data: Buffer) => {
      const msg = data.toString().trim();
      if (msg) {
        this.emit("error", { player_id: playerId, message: msg });
      }
    });

    proc.on("exit", () => {
      this.processes.delete(playerId);
    });

    this.processes.set(playerId, proc);
    this.emit("listening_started", { player_id: playerId });
  }

  /** Stop listening for a player (push-to-talk released). */
  stopListening(playerId: string): void {
    const proc = this.processes.get(playerId);
    if (proc) {
      // Send stop signal to the bridge
      proc.stdin?.write("STOP\n");
      proc.stdin?.end();
      this.processes.delete(playerId);
      this.emit("listening_stopped", { player_id: playerId });
    }
  }

  /** Shut down all active STT processes. */
  shutdown(): void {
    for (const [id, proc] of this.processes) {
      proc.kill("SIGTERM");
      this.processes.delete(id);
    }
  }
}

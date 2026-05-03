#!/usr/bin/env node

/**
 * Voice Service
 *
 * Bridges STT (faster-whisper) and TTS (ElevenLabs/Piper) to the
 * ArchClaude event bus via WebSocket.
 *
 * Connects to the Map MCP's WebSocket (port 3100) and:
 * - Listens for narration_text events → speaks them via TTS
 * - Emits player_speech events when push-to-talk captures speech
 *
 * Also runs its own WebSocket on port 3300 for the push-to-talk
 * client (player devices connect here to signal PTT).
 *
 * Usage:
 *   archclaude-voice [--map-ws ws://localhost:3100] [--port 3300]
 *
 * Env vars:
 *   ELEVENLABS_API_KEY — for cloud TTS
 *   WHISPER_MODEL — faster-whisper model (default: "base")
 */

import { WebSocket, WebSocketServer } from "ws";
import { STTEngine } from "./stt.js";
import { TTSEngine } from "./tts.js";
import { cleanupTranscript, formatPlayerInput } from "./stt-cleanup.js";
import type { STTResult, VoiceProfile } from "./types.js";
import { VOICE_EVENTS } from "./types.js";

function getArgs(): { mapWs: string; port: number } {
  const args = process.argv.slice(2);
  let mapWs = "ws://localhost:3100";
  let port = 3300;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--map-ws" && args[i + 1]) mapWs = args[i + 1];
    if (args[i] === "--port" && args[i + 1]) port = parseInt(args[i + 1], 10);
  }
  return { mapWs, port };
}

async function main() {
  const { mapWs, port } = getArgs();

  // Initialize engines
  const stt = new STTEngine({
    model: process.env.WHISPER_MODEL ?? "base",
    language: "en",
  });

  const tts = new TTSEngine({
    default_provider: process.env.ELEVENLABS_API_KEY ? "elevenlabs" : "piper",
    elevenlabs_api_key: process.env.ELEVENLABS_API_KEY,
  });

  // Connect to the Map MCP WebSocket (the shared event bus)
  let mapSocket: WebSocket | null = null;

  function connectToMapWs() {
    mapSocket = new WebSocket(mapWs);

    mapSocket.on("open", () => {
      console.log(`Connected to map event bus at ${mapWs}`);
    });

    mapSocket.on("message", (data) => {
      try {
        const event = JSON.parse(data.toString());
        handleBusEvent(event);
      } catch { /* ignore non-JSON */ }
    });

    mapSocket.on("close", () => {
      console.log("Map event bus disconnected. Reconnecting in 3s...");
      setTimeout(connectToMapWs, 3000);
    });

    mapSocket.on("error", () => {
      mapSocket?.close();
    });
  }

  function sendToBus(type: string, payload: Record<string, unknown>) {
    if (mapSocket?.readyState === WebSocket.OPEN) {
      mapSocket.send(JSON.stringify({
        type,
        timestamp: new Date().toISOString(),
        payload,
      }));
    }
  }

  /** Handle events from the shared bus. */
  function handleBusEvent(event: { type: string; payload: Record<string, unknown> }) {
    switch (event.type) {
      case "narration_text": {
        // Speak narration through TTS
        const text = event.payload.text as string;
        const intensity = event.payload.intensity as string | undefined;
        const voiceProfile = event.payload.voice_profile as string | undefined;
        tts.speak({ text, voice_profile: voiceProfile, intensity: intensity as TTSIntensity }).catch((err) => {
          console.error("TTS error:", err);
        });
        break;
      }
    }
  }

  // STT event handling
  stt.on("transcript", (result: STTResult) => {
    const cleanup = cleanupTranscript(result.raw_text);
    const input = formatPlayerInput(
      { ...result, clean_text: cleanup.clean },
      cleanup,
    );

    console.log(`[STT] ${input.player_id}: "${input.text}" (${input.command_type ?? "freeform"})`);

    // Emit to the bus for the orchestrator to pick up
    sendToBus(VOICE_EVENTS.PLAYER_SPEECH, input);
  });

  // TTS events
  tts.on("tts_started", (info) => {
    sendToBus(VOICE_EVENTS.TTS_STARTED, info);
  });

  tts.on("tts_finished", (info) => {
    sendToBus(VOICE_EVENTS.TTS_FINISHED, info);
  });

  // Push-to-talk WebSocket server (for player devices)
  const pttServer = new WebSocketServer({ port });

  pttServer.on("connection", (ws) => {
    console.log("PTT client connected");

    ws.on("message", (data) => {
      try {
        const msg = JSON.parse(data.toString());

        if (msg.type === "ptt_press") {
          stt.startListening(msg.player_id);
          sendToBus(VOICE_EVENTS.PTT_PRESSED, { player_id: msg.player_id });
        }

        if (msg.type === "ptt_release") {
          stt.stopListening(msg.player_id);
          sendToBus(VOICE_EVENTS.PTT_RELEASED, { player_id: msg.player_id });
        }

        if (msg.type === "register_voice_profile") {
          tts.registerProfile(msg.profile as VoiceProfile);
          console.log(`Registered voice profile: ${msg.profile.name}`);
        }
      } catch { /* ignore */ }
    });
  });

  // Connect to map bus
  connectToMapWs();

  console.log(`Voice service running. PTT WebSocket on port ${port}.`);

  process.on("SIGINT", () => {
    stt.shutdown();
    pttServer.close();
    mapSocket?.close();
    process.exit(0);
  });
}

type TTSIntensity = "terse" | "normal" | "tense" | "climax";

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});

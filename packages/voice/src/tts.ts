/**
 * Text-to-speech engine.
 *
 * Supports two providers:
 * - ElevenLabs (cloud): High-quality voices, voice cloning, streaming.
 *   Requires ELEVENLABS_API_KEY env var.
 * - Piper (local): Open-source TTS, runs offline, lower quality but
 *   zero latency and no API dependency.
 *
 * Architecture: TTS requests come from the orchestrator/combat director
 * via WebSocket events. The engine picks the voice profile, generates
 * audio, and pipes it to the system audio output.
 *
 * Latency target: <2s from end of text generation to start of speech.
 * ElevenLabs streaming mode achieves this; Piper is near-instant.
 */

import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import type { VoiceProfile, TTSRequest } from "./types.js";

export interface TTSConfig {
  /** Default TTS provider when voice profile doesn't specify. */
  default_provider: "elevenlabs" | "piper";
  /** ElevenLabs API key (from env or config). */
  elevenlabs_api_key?: string;
  /** Path to Piper binary. */
  piper_binary?: string;
  /** Path to Piper voice model directory. */
  piper_models_dir?: string;
  /** Default voice for the narrator. */
  narrator_voice_id?: string;
}

export class TTSEngine extends EventEmitter {
  private config: TTSConfig;
  private profiles: Map<string, VoiceProfile> = new Map();
  private speaking = false;

  constructor(config: TTSConfig) {
    super();
    this.config = config;
  }

  /** Register a voice profile for an NPC or the narrator. */
  registerProfile(profile: VoiceProfile): void {
    this.profiles.set(profile.id, profile);
  }

  /** Get a registered voice profile. */
  getProfile(id: string): VoiceProfile | undefined {
    return this.profiles.get(id);
  }

  /** Speak text using the specified voice profile. */
  async speak(request: TTSRequest): Promise<void> {
    const profile = request.voice_profile
      ? this.profiles.get(request.voice_profile)
      : undefined;

    const provider = profile?.tts_provider ?? this.config.default_provider;
    const voiceId = profile?.tts_voice_id ??
      this.config.narrator_voice_id ?? "default";

    this.speaking = true;
    this.emit("tts_started", {
      text: request.text,
      voice: voiceId,
      provider,
    });

    try {
      if (provider === "elevenlabs") {
        await this.speakElevenLabs(request.text, voiceId, request.stream ?? true);
      } else {
        await this.speakPiper(request.text, voiceId);
      }
    } finally {
      this.speaking = false;
      this.emit("tts_finished", { text: request.text });
    }
  }

  /** Check if the engine is currently speaking. */
  isSpeaking(): boolean {
    return this.speaking;
  }

  /**
   * ElevenLabs streaming TTS.
   * Uses the streaming API to start playback before generation completes.
   */
  private async speakElevenLabs(
    text: string,
    voiceId: string,
    stream: boolean,
  ): Promise<void> {
    const apiKey = this.config.elevenlabs_api_key ?? process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
      this.emit("error", { message: "ELEVENLABS_API_KEY not set" });
      return;
    }

    const url = stream
      ? `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream`
      : `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "xi-api-key": apiKey,
      },
      body: JSON.stringify({
        text,
        model_id: "eleven_monolingual_v1",
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
        },
      }),
    });

    if (!response.ok) {
      this.emit("error", {
        message: `ElevenLabs API error: ${response.status}`,
      });
      return;
    }

    // Pipe audio to system output via ffplay or aplay
    const audioPlayer = spawn("ffplay", [
      "-nodisp", "-autoexit", "-loglevel", "quiet", "-f", "mp3", "-",
    ], { stdio: ["pipe", "ignore", "ignore"] });

    const reader = response.body?.getReader();
    if (reader) {
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          audioPlayer.stdin?.write(value);
        }
      } finally {
        audioPlayer.stdin?.end();
      }
    }

    await new Promise<void>((resolve) => {
      audioPlayer.on("exit", () => resolve());
    });
  }

  /**
   * Piper local TTS.
   * Near-instant generation, lower quality.
   */
  private async speakPiper(text: string, voiceModel: string): Promise<void> {
    const piperBin = this.config.piper_binary ?? "piper";
    const modelsDir = this.config.piper_models_dir ?? "";
    const modelPath = modelsDir ? `${modelsDir}/${voiceModel}.onnx` : voiceModel;

    return new Promise<void>((resolve, reject) => {
      // Piper reads text from stdin, outputs WAV to stdout
      const piper = spawn(piperBin, [
        "--model", modelPath,
        "--output-raw",
      ], { stdio: ["pipe", "pipe", "pipe"] });

      // Pipe Piper's raw audio output to aplay
      const player = spawn("aplay", [
        "-r", "22050", "-f", "S16_LE", "-t", "raw", "-c", "1",
      ], { stdio: ["pipe", "ignore", "ignore"] });

      piper.stdout?.pipe(player.stdin!);
      piper.stdin?.write(text);
      piper.stdin?.end();

      player.on("exit", () => resolve());
      player.on("error", (err) => reject(err));
    });
  }
}

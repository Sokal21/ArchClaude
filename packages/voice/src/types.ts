/**
 * Voice service types.
 *
 * Architecture: The voice service is a bridge between:
 * - Audio input (microphone → faster-whisper STT → text)
 * - Audio output (text → ElevenLabs/Piper TTS → speakers)
 * - The event bus (WebSocket, same bus the TV display uses)
 *
 * The orchestrator sends narration text; the voice service speaks it.
 * Players push-to-talk; the voice service transcribes and emits events.
 */

export interface VoiceProfile {
  id: string;
  name: string;
  /** ElevenLabs voice ID, or Piper model name for local TTS. */
  tts_voice_id: string;
  /** TTS provider: "elevenlabs" for cloud, "piper" for local. */
  tts_provider: "elevenlabs" | "piper";
  /** Descriptive notes for the DM (e.g. "low register, slow pace"). */
  notes?: string;
}

export interface STTResult {
  /** The player who spoke (identified by push-to-talk channel). */
  player_id: string;
  /** Raw transcript from faster-whisper. */
  raw_text: string;
  /** Cleaned transcript after STT cleanup pass. */
  clean_text: string;
  /** Confidence score (0-1). */
  confidence: number;
  /** Duration of the utterance in milliseconds. */
  duration_ms: number;
}

export interface TTSRequest {
  /** Text to speak. */
  text: string;
  /** Voice profile ID to use. Falls back to narrator default. */
  voice_profile?: string;
  /** Narration intensity — affects pacing/emphasis. */
  intensity?: "terse" | "normal" | "tense" | "climax";
  /** If true, stream audio while generating (lower latency). */
  stream?: boolean;
}

export interface VoiceEvent {
  type: string;
  timestamp: string;
  payload: Record<string, unknown>;
}

/** Events emitted by the voice service. */
export const VOICE_EVENTS = {
  /** Player speech transcribed. */
  PLAYER_SPEECH: "player_speech",
  /** TTS started speaking. */
  TTS_STARTED: "tts_started",
  /** TTS finished speaking. */
  TTS_FINISHED: "tts_finished",
  /** STT error (mic issue, unintelligible). */
  STT_ERROR: "stt_error",
  /** Push-to-talk button pressed. */
  PTT_PRESSED: "ptt_pressed",
  /** Push-to-talk button released. */
  PTT_RELEASED: "ptt_released",
} as const;

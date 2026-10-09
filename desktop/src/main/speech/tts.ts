import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import type { Settings } from "../settings.js";
import { stripCues } from "../../../../src/core/brain/prompts.js";
import { speakInOwnVoice, usingOwnVoice } from "./voice/index.js";

/** The built-in voice: macOS `say` (Piper replaces it for other platforms). */
async function standardVoice(text: string): Promise<Buffer> {
  if (process.platform !== "darwin") throw new Error("Speech output currently needs macOS (Piper support is coming).");
  const dir = await mkdtemp(path.join(tmpdir(), "penguin-tts-"));
  try {
    const file = path.join(dir, "line.wav");
    await promisify(execFile)("say", ["-o", file, "--file-format=WAVE", "--data-format=LEI16@24000", text]);
    return await readFile(file);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export type SynthesizeOptions = {
  settings: Settings;
  /** Transcribes 24 kHz audio, to check the owner's-voice output word by word. */
  check?: (wav: Float32Array) => Promise<string>;
  takes?: number;
  /** What to say instead with the standard voice, e.g. without "speaking in Mujeeb's voice". */
  standardText?: string;
  onFallback?: (reason: string) => void;
};

/**
 * Text to WAV. In the owner's own voice when they've turned it on and it's ready;
 * otherwise, or if anything goes wrong with it, the standard voice, so Peguin
 * never goes silent in a meeting.
 */
export async function synthesize(text: string, o?: SynthesizeOptions): Promise<Buffer> {
  if (o && usingOwnVoice(o.settings)) {
    // Only ElevenLabs performs delivery cues; the on-Mac voice would read them out.
    const said = o.settings.voice.engine === "elevenlabs" ? text : stripCues(text);
    try { return await speakInOwnVoice(said, o.settings, { check: o.check, takes: o.takes }); }
    catch (e) { o.onFallback?.(e instanceof Error ? e.message : String(e)); }
  }
  return standardVoice(stripCues(o?.standardText ?? text));
}

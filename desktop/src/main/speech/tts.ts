import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import type { Settings } from "../settings.js";
import { stripCues } from "../../../../src/core/brain/prompts.js";
import { speakInOwnVoice, usingOwnVoice } from "./voice/index.js";
import { grokSpeak, loadXai } from "../xai.js";

/** The built-in voice: macOS `say` (Piper replaces it for other platforms). */
async function macVoice(text: string): Promise<Buffer> {
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

/** The standard voice: an xAI voice when the owner chose Grok and has a key, else the Mac's, which is also the fallback. */
async function standardVoice(text: string, s: Settings | undefined, onFallback?: (reason: string) => void): Promise<Buffer> {
  const x = s?.voice.standard === "grok" ? loadXai() : null;
  if (s?.voice.standard === "grok" && !x) onFallback?.("Grok voice is chosen but there's no xAI key");
  if (x) {
    try { return await grokSpeak(x.apiKey, s!.voice.grokVoice, text); }
    catch (e) { onFallback?.(`Grok voice failed: ${e instanceof Error ? e.message : String(e)}`); }
  }
  return macVoice(text);
}

/** A short line in the chosen standard voice, for the Settings sample button. */
export const standardSample = (s: Settings, text: string) => standardVoice(text, s, (reason) => { throw new Error(reason); });

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
  return standardVoice(stripCues(o?.standardText ?? text), o?.settings, o?.onFallback);
}

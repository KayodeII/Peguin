// Speaking in the owner's own voice: opt-in, on this Mac only. Wraps the engine
// with the stored sample, the owner's pronunciations and a cache, so the update
// made before the meeting plays instantly when they're called on.
import { safeStorage } from "electron";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Settings } from "../../settings.js";
import { encodeWav } from "./audio.js";
import { VoiceEngine, type Voice } from "./engine.js";
import { voiceModelReady } from "./model.js";
import { cacheDir, loadSample, sampleInfo } from "./store.js";

export { CONSENT_SENTENCE, deleteSample, saveSample, sampleInfo } from "./store.js";
export { ensureVoiceModel, deleteVoiceModel, voiceModelReady, VOICE_MODEL_BYTES } from "./model.js";

export type OwnVoiceStatus = { mode: Settings["voice"]["mode"]; modelReady: boolean; sample: ReturnType<typeof sampleInfo> };

export const ownVoiceStatus = (s: Settings): OwnVoiceStatus => ({ mode: s.voice.mode, modelReady: voiceModelReady(), sample: sampleInfo() });

/** True when lines should be spoken in the owner's voice (and the disclosure should say so). */
export const usingOwnVoice = (s: Settings) => s.voice.mode === "mine" && voiceModelReady() && !!sampleInfo();

let engine: Promise<VoiceEngine> | null = null;
let encoded: { id: string; voice: Promise<Voice> } | null = null;

function loaded(): Promise<VoiceEngine> {
  engine ??= VoiceEngine.load();
  engine.catch(() => { engine = null; });
  return engine;
}

async function currentVoice(): Promise<{ id: string; voice: Voice }> {
  const sample = loadSample();
  if (!sample) throw new Error("There's no voice sample yet. Record one in Settings.");
  if (encoded?.id !== sample.id) encoded = { id: sample.id, voice: loaded().then((e) => e.encodeVoice(sample.samples)) };
  return { id: sample.id, voice: await encoded.voice };
}

/**
 * Everything about how lines sound comes from the owner's settings: their
 * pronunciations, pause and expressiveness. Their "also called" names tell the
 * checker that hearing a nickname or accented spelling isn't a mistake.
 */
function preferences(s: Settings) {
  const first = s.displayName.trim().split(/\s+/)[0] ?? "";
  const pronounce = Object.fromEntries(s.voice.pronunciations.map((p) => [p.word, p.sayAs]));
  const aliases = Object.fromEntries(s.aliases.map((a) => [a.toLowerCase(), first.toLowerCase()]).filter(([a, f]) => a && f && a !== f));
  return { pronounce, aliases, pause: s.voice.pause, temperature: s.voice.expressiveness };
}

const sealOrPlain = (b: Buffer) => (safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(b.toString("base64")) : b);
const unsealOrPlain = (b: Buffer) => (safeStorage.isEncryptionAvailable() ? Buffer.from(safeStorage.decryptString(b), "base64") : b);

/**
 * WAV of `text` in the owner's voice. With `check`, each sentence is transcribed
 * and regenerated (up to the owner's attempts setting) when the words come back
 * wrong; use it for prepared lines, not live answers.
 */
export async function speakInOwnVoice(text: string, s: Settings, o: { check?: (wav: Float32Array) => Promise<string>; takes?: number } = {}): Promise<Buffer> {
  const { id, voice } = await currentVoice();
  const prefs = preferences(s);
  const takes = o.check ? (o.takes ?? s.voice.attempts) : 1;
  // Any change to the sample, the text or a preference makes a new line.
  const key = createHash("sha256").update(JSON.stringify([id, text, prefs, takes])).digest("hex").slice(0, 24);
  const file = path.join(cacheDir(), `${key}.bin`);
  if (existsSync(file)) {
    try { return unsealOrPlain(readFileSync(file)); } catch { /* regenerate below */ }
  }
  const wav = encodeWav(await (await loaded()).speak(text, voice, { ...prefs, check: o.check, takes }));
  mkdirSync(cacheDir(), { recursive: true });
  writeFileSync(file, sealOrPlain(wav));
  return wav;
}

/** Forget the encoded voice (after re-recording or deleting the sample). */
export function forgetVoice() { encoded = null; }

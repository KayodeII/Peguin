// Speaking in the owner's own voice: opt-in, on this Mac only. Wraps the engine
// with the stored sample, the owner's pronunciations and a cache, so the update
// made before the meeting plays instantly when they're called on.
import { safeStorage } from "electron";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Settings } from "../../settings.js";
import { decodeWav, encodeWav } from "./audio.js";
import { cloneVoice, deleteVoice, loadEleven, saveEleven, speakWav } from "./eleven.js";
import { VoiceEngine, type Voice } from "./engine.js";
import { voiceModelReady } from "./model.js";
import { cacheDir, loadSample, sampleInfo } from "./store.js";
import { stripCues } from "../../../../../src/core/brain/prompts.js";
import { respell, wordError } from "./text.js";

export { CONSENT_SENTENCE, deleteSample, saveSample, sampleInfo } from "./store.js";
export { ensureVoiceModel, deleteVoiceModel, voiceModelReady, VOICE_MODEL_BYTES } from "./model.js";

export type OwnVoiceStatus = {
  mode: Settings["voice"]["mode"]; engine: Settings["voice"]["engine"]; modelReady: boolean; elevenConnected: boolean;
  sample: ReturnType<typeof sampleInfo>;
};

export const ownVoiceStatus = (s: Settings): OwnVoiceStatus => ({
  mode: s.voice.mode, engine: s.voice.engine, modelReady: voiceModelReady(), elevenConnected: !!loadEleven(), sample: sampleInfo(),
});

/** The chosen engine can speak: the on-Mac model is downloaded, or an ElevenLabs key is saved. */
export const engineReady = (s: Settings) => (s.voice.engine === "elevenlabs" ? !!loadEleven() : voiceModelReady());

/** True when lines should be spoken in the owner's voice (and the disclosure should say so). */
export const usingOwnVoice = (s: Settings) => s.voice.mode === "mine" && engineReady(s) && !!sampleInfo();

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
  const eleven = s.voice.engine === "elevenlabs";
  const id = eleven ? (sampleInfo() ? loadSample()?.id : undefined) : (await currentVoice()).id;
  if (!id) throw new Error("There's no voice sample yet. Record one in Settings.");
  const prefs = preferences(s);
  const takes = o.check ? (o.takes ?? s.voice.attempts) : 1;
  // Prepared lines (checked) use the main model; live answers the fast one.
  const model = eleven ? (o.check ? s.voice.eleven.model : s.voice.eleven.liveModel) : "mac";
  // Any change to the engine, sample, text or a preference makes a new line.
  const key = createHash("sha256").update(JSON.stringify([model, id, text, prefs, takes])).digest("hex").slice(0, 24);
  const file = path.join(cacheDir(), `${key}.bin`);
  if (existsSync(file)) {
    try { return unsealOrPlain(readFileSync(file)); } catch { /* regenerate below */ }
  }
  const wav = eleven
    ? await speakWithEleven(text, s, model, prefs, o.check, takes)
    : encodeWav(await (await loaded()).speak(text, (await currentVoice()).voice, { ...prefs, check: o.check, takes }));
  mkdirSync(cacheDir(), { recursive: true });
  writeFileSync(file, sealOrPlain(wav));
  return wav;
}

/** A whole line through ElevenLabs is accepted when at most this share of words comes back wrong. */
const ELEVEN_ACCEPT = 0.12;

/** The owner's ElevenLabs clone of their current sample, made (or remade) when the sample changes. */
async function elevenVoice(s: Settings): Promise<{ apiKey: string; voiceId: string }> {
  const account = loadEleven();
  if (!account) throw new Error("Add your ElevenLabs API key in Settings, Voice.");
  const sample = loadSample();
  if (!sample) throw new Error("There's no voice sample yet. Record one in Settings.");
  if (account.voiceId && account.sampleId === sample.id) return { apiKey: account.apiKey, voiceId: account.voiceId };
  if (account.voiceId) await deleteVoice(account.apiKey, account.voiceId);
  const name = `Peguin: ${s.displayName.trim() || "my voice"}`.slice(0, 60);
  const { voiceId, requiresVerification } = await cloneVoice(account.apiKey, name, encodeWav(sample.samples));
  saveEleven({ ...account, voiceId, sampleId: sample.id });
  if (requiresVerification) {
    throw new Error("ElevenLabs wants you to confirm this is your voice. Open elevenlabs.io, Voices, find the Peguin voice and finish verification, then try again.");
  }
  return { apiKey: account.apiKey, voiceId };
}

/** Whole line at once (v4 keeps the flow across sentences); with `check`, regenerated while the words come back wrong. */
async function speakWithEleven(
  text: string, s: Settings, model: string, prefs: ReturnType<typeof preferences>,
  check: ((wav: Float32Array) => Promise<string>) | undefined, takes: number,
): Promise<Buffer> {
  const { apiKey, voiceId } = await elevenVoice(s);
  const said = respell(text, prefs.pronounce);
  let best: Buffer | null = null, bestError = Infinity;
  for (let t = 0; t < takes; t++) {
    const wav = await speakWav(apiKey, voiceId, said, { model, expressiveness: s.voice.expressiveness });
    if (!check) return wav;
    const err = wordError(stripCues(text), await check(decodeWav(wav).samples).catch(() => ""), prefs.aliases);
    if (err < bestError) { best = wav; bestError = err; }
    if (err <= ELEVEN_ACCEPT) break;
  }
  return best!;
}

/** Forget the encoded voice (after re-recording or deleting the sample). */
export function forgetVoice() { encoded = null; }

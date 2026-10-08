// The owner's voice sample: recorded live in the app (never uploaded from a
// file), encrypted with the macOS Keychain, kept only on this Mac, deletable.
import { app } from "electron";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { unseal, writeSealed } from "../../sealed.js";
import { decodeWav, encodeWav, SAMPLE_RATE } from "./audio.js";

/** Said aloud first, in its own recording. Recording it is the owner's consent. */
export const CONSENT_SENTENCE = "I'm recording my own voice so Peguin can speak for me in meetings, always introduced as my AI assistant.";
/**
 * The voice itself comes from a second recording: the owner talking naturally
 * about their work, unscripted. In a 40-clip test that halved word errors
 * compared with reading a script (spikes/voice/README.md, "Fair comparison").
 */
export const MIN_TALK_S = 12;
export const MAX_TALK_S = 30;
const MIN_CONSENT_S = 3;

const dir = () => path.join(app.getPath("userData"), "voice");
const sampleFile = () => path.join(dir(), "sample.bin");
const consentFile = () => path.join(dir(), "consent.json");
const consentAudioFile = () => path.join(dir(), "consent.bin");

/** `kind: "talk"` is a natural-talk sample; older samples (a read script) have no kind. */
export type VoiceSampleInfo = { recordedAt: string; seconds: number; consent: string; kind?: "talk" };

function writeAtomic(file: string, data: Buffer | string) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(`${file}.tmp`, data);
  renameSync(`${file}.tmp`, file);
}

function peakOf(samples: Float32Array, what: string): number {
  let peak = 0;
  for (const v of samples) peak = Math.max(peak, Math.abs(v));
  if (peak < 0.02) throw new Error(`The ${what} is nearly silent. Check that Peguin can use your microphone, then try again.`);
  return peak;
}

/**
 * Saves a fresh sample (24 kHz mono floats from the window): the consent
 * sentence, kept encrypted as the record of consent, and the natural talk,
 * which becomes the voice.
 */
export function saveSample(consent: Float32Array, talk: Float32Array): VoiceSampleInfo {
  if (consent.length / SAMPLE_RATE < MIN_CONSENT_S) throw new Error("Say the whole consent sentence before stopping.");
  const seconds = talk.length / SAMPLE_RATE;
  if (seconds < MIN_TALK_S) throw new Error(`That's ${seconds.toFixed(0)} seconds of talking. Keep going for at least ${MIN_TALK_S}.`);
  const consentPeak = peakOf(consent, "consent recording");
  const peak = peakOf(talk, "recording");
  const trimmed = talk.subarray(0, SAMPLE_RATE * MAX_TALK_S);
  writeSealed(consentAudioFile(), encodeWav(consent.map((v) => (v / consentPeak) * 0.9)));
  writeSealed(sampleFile(), encodeWav(trimmed.map((v) => (v / peak) * 0.9)));
  const info: VoiceSampleInfo = { recordedAt: new Date().toISOString(), seconds: Math.round(trimmed.length / SAMPLE_RATE), consent: CONSENT_SENTENCE, kind: "talk" };
  writeAtomic(consentFile(), JSON.stringify(info, null, 2));
  return info;
}

export function sampleInfo(): VoiceSampleInfo | null {
  if (!existsSync(sampleFile())) return null;
  try { return JSON.parse(readFileSync(consentFile(), "utf8")) as VoiceSampleInfo; } catch { return null; }
}

export function loadSample(): { samples: Float32Array; id: string } | null {
  if (!existsSync(sampleFile())) return null;
  const sealed = readFileSync(sampleFile());
  let wav: Buffer;
  // The Keychain key belongs to this install; a sample sealed by another (dev vs installed app) can't be opened.
  try { wav = unseal(sealed); } catch { throw new Error("Your voice sample can't be read on this install. Record it again in Settings."); }
  return { samples: decodeWav(wav).samples, id: createHash("sha256").update(sealed).digest("hex").slice(0, 16) };
}

/** Removes the sample, the consent record and any audio made from them. */
export function deleteSample() {
  rmSync(dir(), { recursive: true, force: true });
}

export const cacheDir = () => path.join(dir(), "cache");

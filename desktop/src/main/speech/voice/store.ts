// The owner's voice sample: recorded live in the app (never uploaded from a
// file), encrypted with the macOS Keychain, kept only on this Mac, deletable.
import { app } from "electron";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { unseal, writeSealed } from "../../sealed.js";
import { decodeWav, encodeWav, SAMPLE_RATE } from "./audio.js";

/** Read aloud at the start of every recording. Recording it is the owner's consent. */
export const CONSENT_SENTENCE = "I'm recording my own voice so Peguin can speak for me in meetings, always introduced as my AI assistant.";
export const MIN_SAMPLE_S = 8;
export const MAX_SAMPLE_S = 30;

const dir = () => path.join(app.getPath("userData"), "voice");
const sampleFile = () => path.join(dir(), "sample.bin");
const consentFile = () => path.join(dir(), "consent.json");

export type VoiceSampleInfo = { recordedAt: string; seconds: number; consent: string };

function writeAtomic(file: string, data: Buffer | string) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(`${file}.tmp`, data);
  renameSync(`${file}.tmp`, file);
}

/** Saves a fresh recording (24 kHz mono floats from the window). */
export function saveSample(samples: Float32Array): VoiceSampleInfo {
  const seconds = samples.length / SAMPLE_RATE;
  if (seconds < MIN_SAMPLE_S) throw new Error(`That recording is ${seconds.toFixed(0)} seconds. Record at least ${MIN_SAMPLE_S}.`);
  let peak = 0;
  for (const v of samples) peak = Math.max(peak, Math.abs(v));
  if (peak < 0.02) throw new Error("That recording is nearly silent. Check that Peguin can use your microphone, then try again.");
  const trimmed = samples.subarray(0, SAMPLE_RATE * MAX_SAMPLE_S);
  writeSealed(sampleFile(), encodeWav(trimmed.map((v) => (v / peak) * 0.9)));
  const info: VoiceSampleInfo = { recordedAt: new Date().toISOString(), seconds: Math.round(trimmed.length / SAMPLE_RATE), consent: CONSENT_SENTENCE };
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

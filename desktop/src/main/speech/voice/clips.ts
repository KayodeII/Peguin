// Learn my voice: clips of the owner talking, kept while voice control listens,
// encrypted on this Mac until the owner ticks them into their sample or deletes
// them. Nothing here is used until the owner says so.
import { randomUUID } from "node:crypto";
import { existsSync, rmSync } from "node:fs";
import path from "node:path";
import { readSealed, writeSealed } from "../../sealed.js";
import { decodeWav, encodeWav, SAMPLE_RATE } from "./audio.js";
import { joinClips } from "./clipRules.js";
import { dir, MAX_TALK_S, replaceTalk, type VoiceSampleInfo } from "./store.js";

/** `likeness` (0..1) is how much the clip sounds like the consent recording; null until worked out. */
export type ClipInfo = { id: string; at: string; seconds: number; text: string; likeness: number | null };

const clipsDir = () => path.join(dir(), "clips");
const indexFile = () => path.join(clipsDir(), "index.bin");
const audioFile = (id: string) => path.join(clipsDir(), `${id.replace(/[^a-f0-9-]/gi, "")}.bin`);

export function listClips(): ClipInfo[] {
  if (!existsSync(indexFile())) return [];
  try { return JSON.parse(readSealed(indexFile()).toString("utf8")) as ClipInfo[]; } catch { return []; }
}

const writeIndex = (list: ClipInfo[]) => writeSealed(indexFile(), JSON.stringify(list));

export function addClip(samples: Float32Array, text: string): ClipInfo {
  const info: ClipInfo = { id: randomUUID(), at: new Date().toISOString(), seconds: Math.round((samples.length / SAMPLE_RATE) * 10) / 10, text, likeness: null };
  writeSealed(audioFile(info.id), encodeWav(samples));
  writeIndex([...listClips(), info]);
  return info;
}

export function clipSamples(id: string): Float32Array | null {
  if (!existsSync(audioFile(id))) return null;
  try { return decodeWav(readSealed(audioFile(id))).samples; } catch { return null; }
}

export const clipWav = (id: string) => { const s = clipSamples(id); return s ? encodeWav(s) : null; };

export function setLikeness(id: string, likeness: number) {
  writeIndex(listClips().map((c) => (c.id === id ? { ...c, likeness } : c)));
}

export function deleteClips(ids: string[] | "all") {
  if (ids === "all") { rmSync(clipsDir(), { recursive: true, force: true }); return; }
  for (const id of ids) rmSync(audioFile(id), { force: true });
  writeIndex(listClips().filter((c) => !ids.includes(c.id)));
}

/** Ticked clips become the voice sample, then leave the list (they're in the sample now). */
export function useClips(ids: string[]): VoiceSampleInfo {
  const picked = listClips().filter((c) => ids.includes(c.id)).sort((a, b) => (b.likeness ?? 0) - (a.likeness ?? 0));
  const audio = picked.map((c) => clipSamples(c.id)).filter((s): s is Float32Array => !!s);
  const info = replaceTalk(joinClips(audio, SAMPLE_RATE, MAX_TALK_S));
  deleteClips(picked.map((c) => c.id));
  return info;
}

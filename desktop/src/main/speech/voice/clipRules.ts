// Learn my voice (pure): which of the owner's utterances are worth keeping as
// voice clips, how alike two voices are, and joining ticked clips into a sample.

export const CLIP = { minS: 4, maxS: 15, minWords: 8, minSpeech: 0.6, maxClipped: 0.002, maxPending: 30 };

/** PCM16 to floats at another rate (linear). */
export function pcmToFloat(pcm: Int16Array, from: number, to: number): Float32Array {
  const n = Math.floor((pcm.length * to) / from);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i * from) / to, j = Math.floor(x), f = x - j;
    out[i] = ((pcm[j] ?? 0) * (1 - f) + (pcm[j + 1] ?? pcm[j] ?? 0) * f) / 0x8000;
  }
  return out;
}

/** Share of 20 ms frames with speech, and share of samples at full scale (distorted). */
export function audioQuality(x: Float32Array, rate: number): { speech: number; clipped: number } {
  const frame = Math.round(rate * 0.02);
  let frames = 0, voiced = 0, clipped = 0;
  for (let i = 0; i + frame <= x.length; i += frame) {
    let sum = 0;
    for (let k = i; k < i + frame; k++) { const v = x[k]!; sum += v * v; if (Math.abs(v) >= 0.99) clipped++; }
    frames++;
    if (Math.sqrt(sum / frame) > 0.012) voiced++;
  }
  return { speech: frames ? voiced / frames : 0, clipped: x.length ? clipped / x.length : 0 };
}

/** Why a clip isn't kept, or null to keep it. */
export function clipVerdict(c: { text: string; seconds: number; speech: number; clipped: number }, room: { today: number; perDay: number; pending: number }): string | null {
  if (room.today >= room.perDay) return "enough clips today";
  if (room.pending >= CLIP.maxPending) return "the review list is full";
  if (c.seconds < CLIP.minS || c.seconds > CLIP.maxS) return "too short or too long";
  if (c.text.split(/\s+/).filter((w) => /[a-z]/i.test(w)).length < CLIP.minWords) return "too few words";
  if (c.speech < CLIP.minSpeech) return "mostly silence";
  if (c.clipped > CLIP.maxClipped) return "distorted";
  return null;
}

/** Cosine similarity of two speaker embeddings, 0..1 for display. */
export function likeness(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) { dot += a[i]! * b[i]!; na += a[i]! ** 2; nb += b[i]! ** 2; }
  return na && nb ? Math.max(0, dot / Math.sqrt(na * nb)) : 0;
}

/** Ticked clips, each levelled, with a short pause between, up to `maxS`. */
export function joinClips(clips: Float32Array[], rate: number, maxS: number, gapS = 0.3): Float32Array {
  const gap = new Float32Array(Math.round(rate * gapS));
  const parts: Float32Array[] = [];
  let total = 0;
  for (const c of clips) {
    let peak = 0;
    for (const v of c) peak = Math.max(peak, Math.abs(v));
    if (!peak) continue;
    if (parts.length) { parts.push(gap); total += gap.length; }
    parts.push(c.map((v) => (v / peak) * 0.9));
    total += c.length;
    if (total >= rate * maxS) break;
  }
  const out = new Float32Array(Math.min(total, rate * maxS));
  let at = 0;
  for (const p of parts) { if (at >= out.length) break; out.set(p.subarray(0, out.length - at), at); at += p.length; }
  return out;
}

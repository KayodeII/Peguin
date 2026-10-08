// Audio helpers for generated speech (pure): trim silence, fade joins, level
// loudness, join sentences with natural pauses, and WAV in/out.

export const SAMPLE_RATE = 24000;

/** Cut leading and trailing quiet (below peak - topDb), keeping 30 ms so consonants aren't clipped. */
export function trimSilence(wav: Float32Array, topDb = 40, sr = SAMPLE_RATE): Float32Array {
  let peak = 0;
  for (const v of wav) peak = Math.max(peak, Math.abs(v));
  if (!peak) return wav.subarray(0, 0);
  const floor = peak * 10 ** (-topDb / 20);
  const frame = Math.round(sr * 0.01);
  const loud = (i: number) => {
    let sum = 0;
    const end = Math.min(wav.length, i + frame);
    for (let j = i; j < end; j++) sum += wav[j]! * wav[j]!;
    return Math.sqrt(sum / Math.max(1, end - i)) > floor;
  };
  let a = 0, b = wav.length;
  while (a < wav.length && !loud(a)) a += frame;
  while (b > a && !loud(Math.max(a, b - frame))) b -= frame;
  const pad = Math.round(sr * 0.03);
  return wav.subarray(Math.max(0, a - pad), Math.min(wav.length, b + pad));
}

export function fade(wav: Float32Array, ms = 12, sr = SAMPLE_RATE): Float32Array {
  const out = Float32Array.from(wav);
  const n = Math.min(Math.floor(out.length / 2), Math.round((sr * ms) / 1000));
  for (let i = 0; i < n; i++) {
    const g = i / n;
    out[i]! *= g;
    out[out.length - 1 - i]! *= g;
  }
  return out;
}

/** Even loudness across sentences and lines, without clipping. */
export function level(wav: Float32Array, targetRms = 0.08): Float32Array {
  let sum = 0, peak = 0;
  for (const v of wav) { sum += v * v; peak = Math.max(peak, Math.abs(v)); }
  const rms = Math.sqrt(sum / Math.max(1, wav.length));
  if (!rms) return wav;
  let gain = targetRms / rms;
  if (peak * gain > 0.95) gain = 0.95 / peak;
  return wav.map((v) => v * gain);
}

/** Sentences with the owner's chosen pause between them, and half that at the end. */
export function joinSentences(parts: Float32Array[], pauseS: number, sr = SAMPLE_RATE): Float32Array {
  const gap = Math.round(sr * pauseS), tail = Math.round((sr * pauseS) / 2);
  const total = parts.reduce((n, p) => n + p.length, 0) + gap * Math.max(0, parts.length - 1) + tail;
  const out = new Float32Array(total);
  let at = 0;
  parts.forEach((p, i) => { if (i) at += gap; out.set(p, at); at += p.length; });
  return out;
}

/** 16-bit PCM mono WAV. */
export function encodeWav(samples: Float32Array, sr = SAMPLE_RATE): Buffer {
  const buf = Buffer.alloc(44 + samples.length * 2);
  buf.write("RIFF", 0); buf.writeUInt32LE(36 + samples.length * 2, 4); buf.write("WAVE", 8);
  buf.write("fmt ", 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sr, 24); buf.writeUInt32LE(sr * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write("data", 36); buf.writeUInt32LE(samples.length * 2, 40);
  samples.forEach((v, i) => buf.writeInt16LE(Math.round(Math.max(-1, Math.min(1, v)) * 32767), 44 + i * 2));
  return buf;
}

/** Reads the mono 16-bit PCM WAVs we write (the stored voice sample). */
export function decodeWav(buf: Buffer): { samples: Float32Array; sampleRate: number } {
  if (buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WAVE") throw new Error("Not a WAV file");
  let at = 12, sampleRate = SAMPLE_RATE, bits = 16, channels = 1;
  while (at + 8 <= buf.length) {
    const id = buf.toString("ascii", at, at + 4), size = buf.readUInt32LE(at + 4);
    if (id === "fmt ") { channels = buf.readUInt16LE(at + 10); sampleRate = buf.readUInt32LE(at + 12); bits = buf.readUInt16LE(at + 22); }
    if (id === "data") {
      if (bits !== 16 || channels !== 1) throw new Error("Expected mono 16-bit audio");
      const n = Math.floor(size / 2);
      const samples = new Float32Array(n);
      for (let i = 0; i < n; i++) samples[i] = buf.readInt16LE(at + 8 + i * 2) / 32768;
      return { samples, sampleRate };
    }
    at += 8 + size + (size % 2);
  }
  throw new Error("WAV has no audio data");
}

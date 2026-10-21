// Cuts the tab's audio into utterances for whisper: speech starts when a frame
// is clearly louder than the room's noise floor, and ends after `silenceMs` of
// quiet (or at `maxMs`, so a monologue still gets transcribed as it goes).
// The floor adapts slowly to the call's background. Pure: frames in, cuts out.

export type VadOptions = { sampleRate: number; silenceMs: number; minMs: number; maxMs: number; preRollMs: number };
export const DEFAULT_VAD: VadOptions = { sampleRate: 16000, silenceMs: 700, minMs: 400, maxMs: 15000, preRollMs: 200 };

export type Utterance = { samples: Float32Array; start: number; end: number };

export const rms = (f: Float32Array) => { let s = 0; for (const v of f) s += v * v; return Math.sqrt(s / Math.max(1, f.length)); };

export class Vad {
  private floor = 0.004;
  private speech: Float32Array[] = [];
  private pre: Float32Array[] = [];
  private speechStart = 0;
  private quietSince = 0;
  /** The last frame's loudness over the floor, 0 to 1, for the panel's meter. */
  level = 0;

  constructor(private o: VadOptions = DEFAULT_VAD) {}

  private ms = (n: number) => (n / this.o.sampleRate) * 1000;
  private length = (fs: Float32Array[]) => fs.reduce((n, f) => n + f.length, 0);

  /** One frame of mono samples captured at `now` (epoch ms, end of the frame). Returns a finished utterance, if any. */
  push(frame: Float32Array, now: number): Utterance | null {
    const e = rms(frame);
    const loud = e > Math.max(this.floor * 3, 0.012);
    this.level = Math.min(1, e / Math.max(this.floor * 12, 0.08));
    if (!loud && !this.speech.length) this.floor = this.floor * 0.98 + e * 0.02;
    if (!this.speech.length) {
      this.pre.push(frame);
      while (this.ms(this.length(this.pre)) > this.o.preRollMs && this.pre.length > 1) this.pre.shift();
      if (!loud) return null;
      this.speech = [...this.pre];
      this.pre = [];
      this.speechStart = now - this.ms(this.length(this.speech));
      this.quietSince = 0;
      return null;
    }
    this.speech.push(frame);
    if (loud) this.quietSince = 0;
    else if (!this.quietSince) this.quietSince = now;
    const long = this.ms(this.length(this.speech)) >= this.o.maxMs;
    if (long || (this.quietSince && now - this.quietSince >= this.o.silenceMs)) return this.finish(now);
    return null;
  }

  private finish(now: number): Utterance | null {
    const total = this.length(this.speech);
    const frames = this.speech;
    this.speech = [];
    if (this.ms(total) < this.o.minMs) return null;
    const samples = new Float32Array(total);
    let at = 0;
    for (const f of frames) { samples.set(f, at); at += f.length; }
    return { samples, start: this.speechStart, end: now };
  }
}

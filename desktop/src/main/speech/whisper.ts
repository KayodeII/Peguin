// Local speech-to-text: whisper.cpp's server with the model loaded once, fed
// utterances cut from the call's 16 kHz PCM by a simple energy gate.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createServer } from "node:net";
import { vadModelPath, whisperPaths } from "../paths.js";
import { whisperPrompt } from "./hints.js";

const RATE = 16000;
const VOICE_RMS = 0.012;       // above this a chunk counts as speech
const END_SILENCE_MS = 700;    // pause that ends an utterance (default; see endSilenceMs)
const EARLY_MS = 400;          // pause after which transcribing starts; a question ending in "?" finishes then
const MIN_SPEECH_MS = 300;     // shorter blips are ignored
const MAX_UTTERANCE_MS = 15000;
const PREROLL_CHUNKS = 3;      // keep ~250 ms before speech starts

export type Whisper = { url: string; stop: () => void };

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer().listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      srv.close(() => (addr && typeof addr === "object" ? resolve(addr.port) : reject(new Error("no port"))));
    });
  });
}

export async function startWhisper(): Promise<Whisper> {
  const { bin, model } = whisperPaths();
  if (!existsSync(bin)) throw new Error("Speech recognition is missing from this install. Reinstall Peguin, or run `npm run setup:whisper` in desktop/.");
  if (!existsSync(model)) throw new Error("The speech model hasn't finished downloading yet.");
  const port = await freePort();
  // Silero VAD keeps only the parts that are a voice. Measured on 2026-10-21: without it, more than half
  // of what the owner's mic sent (hiss, hum, music, typing) came back as "Thank you." or "Okay.";
  // with it, noise comes back empty and speech word for word (docs/features/voice-control.md).
  const vad = existsSync(vadModelPath()) ? ["--vad", "-vm", vadModelPath()] : [];
  const proc = spawn(bin, ["-m", model, "--host", "127.0.0.1", "--port", String(port), "-l", "en", ...vad], { stdio: "ignore" });
  // However Peguin ends (even killed or force-quit in development), the server goes with it.
  const kill = () => { try { proc.kill(); } catch { /* gone */ } };
  process.once("exit", kill);
  proc.once("exit", () => process.removeListener("exit", kill));
  const url = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 80; i++) {
    if (proc.exitCode !== null) throw new Error(`whisper-server exited with code ${proc.exitCode}`);
    try { await fetch(url); return { url, stop: () => proc.kill() }; } catch { await new Promise((r) => setTimeout(r, 250)); }
  }
  proc.kill();
  throw new Error("whisper-server did not start in time");
}

function wav(pcm: Buffer): Buffer {
  const h = Buffer.alloc(44);
  h.write("RIFF", 0); h.writeUInt32LE(36 + pcm.length, 4); h.write("WAVE", 8);
  h.write("fmt ", 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(RATE, 24); h.writeUInt32LE(RATE * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write("data", 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

/** Whisper invents text on noise ("[BLANK_AUDIO]", "(music)"). */
function clean(text: string): string {
  return text.replace(/\[[^\]]*\]|\([^)]*\)|\*[^*]*\*/g, " ").replace(/\s+/g, " ").trim();
}

async function transcribe(whisperUrl: string, pcm: Buffer, names: string[], vocab: string[] = [], prompt?: string): Promise<string> {
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(wav(pcm))], { type: "audio/wav" }), "utterance.wav");
  form.append("response_format", "json");
  form.append("prompt", prompt ?? whisperPrompt(names, vocab)); // nudges spelling of names and jargon
  const res = await fetch(`${whisperUrl}/inference`, { method: "POST", body: form });
  if (!res.ok) throw new Error(`whisper returned ${res.status}`);
  const body = (await res.json()) as { text?: string };
  return clean(body.text ?? "");
}

/** Transcribes 24 kHz float audio (Peguin's own speech), to check generated lines. */
export function transcribeSamples(whisperUrl: string, samples: Float32Array, names: string[] = []): Promise<string> {
  const n = Math.floor((samples.length * RATE) / 24000);
  const pcm = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) {
    const x = (i * 24000) / RATE, j = Math.floor(x), f = x - j;
    const v = (samples[j] ?? 0) * (1 - f) + (samples[j + 1] ?? 0) * f; // linear resample 24k -> 16k
    pcm.writeInt16LE(Math.round(Math.max(-1, Math.min(1, v)) * 32767), i * 2);
  }
  return transcribe(whisperUrl, pcm, names);
}

/** `pcm` is the utterance as heard: PCM16 at the listener's `rate`. */
export type Utterance = { text: string; sttMs: number; endedAt: number; pcm: Buffer };

/** PCM16 from `rate` to whisper's 16 kHz (linear; 24 kHz mic audio is kept for the voice clips). */
export function to16k(pcm: Buffer, rate: number): Buffer {
  if (rate === RATE) return pcm;
  const aligned = pcm.byteOffset % 2 ? Buffer.from(pcm) : pcm;
  const src = new Int16Array(aligned.buffer, aligned.byteOffset, Math.floor(aligned.length / 2));
  const n = Math.floor((src.length * RATE) / rate);
  const out = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) {
    const x = (i * rate) / RATE, j = Math.floor(x), f = x - j;
    out.writeInt16LE(Math.round((src[j] ?? 0) * (1 - f) + (src[j + 1] ?? src[j] ?? 0) * f), i * 2);
  }
  return out;
}

/** Feed PCM chunks in; finished utterances come out in order, one at a time. */
export function createListener(opts: {
  whisperUrl: string;
  names: string[];
  /** Jargon to spell right (from the owner's facts). */
  vocab?: () => string[];
  /** A whole prompt instead of the meeting one (voice control primes for "Hey Peguin, ..."). */
  prompt?: () => string;
  /** Pause that ends an utterance. Longer keeps questions with a mid-sentence pause whole. */
  endSilenceMs?: number;
  /** Sample rate of the chunks fed in (default 16 kHz). */
  rate?: number;
  onUtterance: (u: Utterance) => void;
  onError: (e: unknown) => void;
  /** Called once per utterance, as soon as someone has spoken for `sustainedMs` (talk-over detection). */
  onSustainedSpeech?: () => void;
  sustainedMs?: number;
  /** When false, don't end on silence / max length (push-to-talk holds open until flush). */
  canAutoFinish?: () => boolean;
}): ((chunk: ArrayBuffer) => void) & { flush: () => boolean } {
  let chunks: Buffer[] = [], preroll: Buffer[] = [];
  let speaking = false, speechMs = 0, silentMs = 0, totalMs = 0, sustained = false;
  let queue = Promise.resolve();
  const rate = opts.rate ?? RATE;
  // A transcript started early in the pause; dropped if they speak again.
  let early: { text: Promise<string>; started: number } | null = null;

  const run = (pcm: Buffer) => {
    const started = Date.now();
    const text = transcribe(opts.whisperUrl, to16k(pcm, rate), opts.names, opts.vocab?.() ?? [], opts.prompt?.());
    text.catch(() => {}); // reported once, through the queue
    return { text, started };
  };
  const finish = () => {
    const pcm = Buffer.concat(chunks), ms = speechMs, done = early;
    chunks = []; speaking = false; sustained = false; speechMs = silentMs = totalMs = 0; early = null;
    if (ms < MIN_SPEECH_MS) return;
    const endedAt = Date.now();
    // Utterances come out in the order they were spoken.
    const job = done ?? run(pcm);
    queue = queue.then(async () => {
      const text = await job.text;
      if (text) opts.onUtterance({ text, sttMs: Date.now() - job.started, endedAt, pcm });
    }).catch(opts.onError);
  };
  const endSilence = opts.endSilenceMs ?? END_SILENCE_MS;
  const earlyMs = Math.min(EARLY_MS, endSilence);
  const startEarly = () => {
    const mine = early = run(Buffer.concat(chunks));
    // Whisper ends a finished question with "?": no need to sit out the rest of the pause.
    void mine.text.then((text) => { if (early === mine && /\?\s*$/.test(text)) finish(); }, () => {});
  };

  const feed = ((arrayBuffer: ArrayBuffer) => {
    const chunk = Buffer.from(arrayBuffer);
    const samples = new Int16Array(arrayBuffer);
    let sum = 0;
    for (const s of samples) sum += (s / 0x8000) ** 2;
    const voiced = Math.sqrt(sum / (samples.length || 1)) > VOICE_RMS;
    const ms = (samples.length / rate) * 1000;

    if (!speaking) {
      preroll.push(chunk);
      if (preroll.length > PREROLL_CHUNKS) preroll.shift();
      if (!voiced) return;
      speaking = true; chunks = [...preroll]; preroll = [];
    } else {
      chunks.push(chunk);
    }
    totalMs += ms;
    if (voiced) { speechMs += ms; silentMs = 0; early = null; } else silentMs += ms;
    if (!sustained && opts.onSustainedSpeech && speechMs >= (opts.sustainedMs ?? Infinity)) { sustained = true; opts.onSustainedSpeech(); }
    const auto = opts.canAutoFinish?.() ?? true;
    if (auto && (silentMs >= endSilence || totalMs >= MAX_UTTERANCE_MS)) finish();
    else if (auto && !early && silentMs >= earlyMs && speechMs >= MIN_SPEECH_MS) startEarly();
  }) as ((chunk: ArrayBuffer) => void) & { flush: () => boolean };
  /** End the current utterance now (push-to-talk release). True if there was enough speech to send. */
  feed.flush = () => {
    if (!(speaking || chunks.length) || speechMs < MIN_SPEECH_MS) {
      chunks = []; speaking = false; sustained = false; speechMs = silentMs = totalMs = 0; early = null; preroll = [];
      return false;
    }
    finish();
    return true;
  };
  return feed;
}

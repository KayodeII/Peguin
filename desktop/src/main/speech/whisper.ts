// Local speech-to-text: whisper.cpp's server with the model loaded once, fed
// utterances cut from the call's 16 kHz PCM by a simple energy gate.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createServer } from "node:net";
import { whisperPaths } from "../paths.js";

const RATE = 16000;
const VOICE_RMS = 0.012;       // above this a chunk counts as speech
const END_SILENCE_MS = 700;    // pause that ends an utterance
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
  const proc = spawn(bin, ["-m", model, "--host", "127.0.0.1", "--port", String(port), "-l", "en"], { stdio: "ignore" });
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

async function transcribe(whisperUrl: string, pcm: Buffer, names: string[]): Promise<string> {
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(wav(pcm))], { type: "audio/wav" }), "utterance.wav");
  form.append("response_format", "json");
  form.append("prompt", `Daily standup. ${names.join(", ")}.`); // nudges spelling of names
  const res = await fetch(`${whisperUrl}/inference`, { method: "POST", body: form });
  if (!res.ok) throw new Error(`whisper returned ${res.status}`);
  const body = (await res.json()) as { text?: string };
  return clean(body.text ?? "");
}

export type Utterance = { text: string; sttMs: number; endedAt: number };

/** Feed PCM chunks in; finished utterances come out in order, one at a time. */
export function createListener(opts: {
  whisperUrl: string;
  names: string[];
  onUtterance: (u: Utterance) => void;
  onError: (e: unknown) => void;
}): (chunk: ArrayBuffer) => void {
  let chunks: Buffer[] = [], preroll: Buffer[] = [];
  let speaking = false, speechMs = 0, silentMs = 0, totalMs = 0;
  let queue = Promise.resolve();

  const finish = () => {
    const pcm = Buffer.concat(chunks), ms = speechMs;
    chunks = []; speaking = false; speechMs = silentMs = totalMs = 0;
    if (ms < MIN_SPEECH_MS) return;
    const endedAt = Date.now();
    queue = queue.then(async () => {
      const started = Date.now();
      const text = await transcribe(opts.whisperUrl, pcm, opts.names);
      if (text) opts.onUtterance({ text, sttMs: Date.now() - started, endedAt });
    }).catch(opts.onError);
  };

  return (arrayBuffer) => {
    const chunk = Buffer.from(arrayBuffer);
    const samples = new Int16Array(arrayBuffer);
    let sum = 0;
    for (const s of samples) sum += (s / 0x8000) ** 2;
    const voiced = Math.sqrt(sum / (samples.length || 1)) > VOICE_RMS;
    const ms = (samples.length / RATE) * 1000;

    if (!speaking) {
      preroll.push(chunk);
      if (preroll.length > PREROLL_CHUNKS) preroll.shift();
      if (!voiced) return;
      speaking = true; chunks = [...preroll]; preroll = [];
    } else {
      chunks.push(chunk);
    }
    totalMs += ms;
    if (voiced) { speechMs += ms; silentMs = 0; } else silentMs += ms;
    if (silentMs >= END_SILENCE_MS || totalMs >= MAX_UTTERANCE_MS) finish();
  };
}

// Speech-to-text for the spike: cut the call's 16 kHz PCM into utterances
// with a simple energy gate, then transcribe each one with a local
// whisper.cpp server. Stands in for the future STT port's whisper adapter.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

const RATE = 16000;
const VOICE_RMS = 0.012;      // above this a chunk counts as speech
const END_SILENCE_MS = 700;   // pause that ends an utterance
const MIN_SPEECH_MS = 300;    // shorter blips are ignored
const MAX_UTTERANCE_MS = 15000;
const PREROLL_CHUNKS = 3;     // keep ~250 ms before speech starts

/** Start whisper-server with the model loaded once. */
export async function startWhisper(dir, port = 8178) {
  const bin = path.join(dir, "vendor/whisper.cpp/build/bin/whisper-server");
  const model = path.join(dir, "vendor/whisper.cpp/models/ggml-base.en.bin");
  if (!existsSync(bin) || !existsSync(model)) throw new Error("whisper not set up: run ./setup-whisper.sh");
  const proc = spawn(bin, ["-m", model, "--port", String(port), "-l", "en"], { stdio: "ignore" });
  const url = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 60; i++) {
    if (proc.exitCode !== null) throw new Error(`whisper-server exited (${proc.exitCode}); is port ${port} in use?`);
    try { await fetch(url); return { url, stop: () => proc.kill() }; } catch { await new Promise((r) => setTimeout(r, 250)); }
  }
  proc.kill();
  throw new Error("whisper-server did not start");
}

function wav(pcm) {
  const h = Buffer.alloc(44);
  h.write("RIFF", 0); h.writeUInt32LE(36 + pcm.length, 4); h.write("WAVE", 8);
  h.write("fmt ", 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(RATE, 24); h.writeUInt32LE(RATE * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write("data", 36); h.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([h, pcm]);
}

/** Whisper invents text on noise ("[BLANK_AUDIO]", "(music)", "Thank you."). */
function clean(text) {
  return text.replace(/\[[^\]]*\]|\([^)]*\)|\*[^*]*\*/g, " ").replace(/\s+/g, " ").trim();
}

async function transcribe(whisperUrl, pcm, names) {
  const form = new FormData();
  form.append("file", new Blob([wav(pcm)], { type: "audio/wav" }), "utterance.wav");
  form.append("response_format", "json");
  form.append("prompt", `Daily standup. ${names.join(", ")}.`); // nudges spelling of names
  const res = await fetch(`${whisperUrl}/inference`, { method: "POST", body: form });
  if (!res.ok) throw new Error(`whisper ${res.status}`);
  return clean((await res.json()).text ?? "");
}

/**
 * Feed PCM chunks in; get finished utterances out via onUtterance(text, ms).
 * Transcriptions run one at a time, in order.
 */
export function createListener({ whisperUrl, names, onUtterance, onError }) {
  let chunks = [], preroll = [], speaking = false, speechMs = 0, silentMs = 0, totalMs = 0;
  let queue = Promise.resolve();

  const finish = () => {
    const pcm = Buffer.concat(chunks), ms = speechMs;
    chunks = []; speaking = false; speechMs = silentMs = totalMs = 0;
    if (ms < MIN_SPEECH_MS) return;
    const endedAt = Date.now();
    queue = queue.then(async () => {
      const started = Date.now();
      const text = await transcribe(whisperUrl, pcm, names);
      if (text) onUtterance(text, { sttMs: Date.now() - started, endedAt });
    }).catch(onError);
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

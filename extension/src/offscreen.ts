// The second ear: the Meet tab's audio, transcribed in the browser by whisper
// (transformers.js, WebGPU when there is one, WebAssembly otherwise). The tab's
// audio is what the owner hears, i.e. everyone else; their own mic never
// reaches it. Capturing a tab mutes it, so the audio is played straight back.
import { env, pipeline, type AutomaticSpeechRecognitionPipeline } from "@huggingface/transformers";
import type { FromAudio, ToAudio } from "./messages.js";
import type { WhisperModel } from "./settings.js";
import { Vad } from "./vad.js";

// No code from the network: onnxruntime's WebAssembly ships inside the extension. Model weights come from Hugging Face once and are cached.
env.allowLocalModels = false;
if (env.backends.onnx.wasm) {
  env.backends.onnx.wasm.wasmPaths = chrome.runtime.getURL("ort/");
  env.backends.onnx.wasm.numThreads = 1; // offscreen pages aren't cross-origin isolated
}

const MODELS: Record<WhisperModel, { id: string; gpuOnly: boolean }> = {
  base: { id: "onnx-community/whisper-base.en", gpuOnly: false },
  turbo: { id: "onnx-community/whisper-large-v3-turbo", gpuOnly: true },
};

const send = (m: FromAudio) => chrome.runtime.sendMessage(m).catch(() => { /* panel closed */ });

let asr: { model: WhisperModel; run: AutomaticSpeechRecognitionPipeline } | null = null;
let session: { stream: MediaStream; play: AudioContext; capture: AudioContext } | null = null;
let seq = 0;

async function loadModel(model: WhisperModel): Promise<AutomaticSpeechRecognitionPipeline> {
  if (asr?.model === model) return asr.run;
  const gpu = "gpu" in navigator && !!(await (navigator as Navigator & { gpu: { requestAdapter(): Promise<unknown> } }).gpu.requestAdapter().catch(() => null));
  const chosen = MODELS[model].gpuOnly && !gpu ? "base" : model;
  if (chosen !== model) void send({ type: "audio:status", status: "loading", detail: "No GPU here, so Peguin uses the fast model." });
  const files = new Map<string, number>();
  const run = await pipeline("automatic-speech-recognition", MODELS[chosen].id, {
    device: gpu ? "webgpu" : "wasm",
    dtype: chosen === "turbo" ? { encoder_model: "fp16", decoder_model_merged: "q4" } : "q8",
    progress_callback: (p: { status: string; file?: string; progress?: number }) => {
      if (p.status !== "progress" || !p.file) return;
      files.set(p.file, p.progress ?? 0);
      const avg = [...files.values()].reduce((a, b) => a + b, 0) / files.size;
      void send({ type: "audio:status", status: "loading", progress: Math.round(avg) });
    },
  }) as AutomaticSpeechRecognitionPipeline;
  asr = { model, run };
  return run;
}

/** Utterances wait here so a slow transcription never drops the next one. */
const queue: { samples: Float32Array; start: number; end: number }[] = [];
let busy = false;

async function drain() {
  if (busy || !asr) return;
  busy = true;
  try {
    for (let u = queue.shift(); u; u = queue.shift()) {
      if (queue.length > 4) continue; // badly behind: skip ahead rather than answer stale speech
      const out = await asr.run(u.samples) as { text: string } | { text: string }[];
      const text = (Array.isArray(out) ? out.map((o) => o.text).join(" ") : out.text).trim();
      if (text) void send({ type: "audio:heard", heard: { source: "audio", id: `a${++seq}`, text, start: u.start, end: u.end, final: true } });
    }
  } catch (e) {
    void send({ type: "audio:status", status: "error", detail: `Whisper failed: ${e instanceof Error ? e.message : e}` });
  } finally { busy = false; }
}

async function start(streamId: string, model: WhisperModel) {
  stop();
  void send({ type: "audio:status", status: "loading", progress: 0 });
  try {
    await loadModel(model);
  } catch (e) {
    void send({ type: "audio:status", status: "error", detail: `Couldn't load whisper: ${e instanceof Error ? e.message : e}` });
    return;
  }
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { mandatory: { chromeMediaSource: "tab", chromeMediaSourceId: streamId } } as MediaTrackConstraints,
  });
  const play = new AudioContext();
  play.createMediaStreamSource(stream).connect(play.destination); // keep the meeting audible
  const capture = new AudioContext({ sampleRate: 16000 });
  await capture.audioWorklet.addModule(chrome.runtime.getURL("pcm-worklet.js"));
  const node = new AudioWorkletNode(capture, "pcm-frames");
  capture.createMediaStreamSource(stream).connect(node);
  const vad = new Vad();
  let lastLevel = 0;
  node.port.onmessage = (e: MessageEvent<Float32Array>) => {
    const now = Date.now();
    const u = vad.push(e.data, now);
    if (now - lastLevel > 100) { lastLevel = now; void send({ type: "audio:level", level: vad.level }); }
    if (u) { queue.push(u); void drain(); }
  };
  session = { stream, play, capture };
  void send({ type: "audio:status", status: "listening" });
}

function stop() {
  if (!session) return;
  session.stream.getTracks().forEach((t) => t.stop());
  void session.play.close();
  void session.capture.close();
  session = null;
  queue.length = 0;
  void send({ type: "audio:status", status: "stopped" });
}

chrome.runtime.onMessage.addListener((m: ToAudio) => {
  if (m.type === "audio:start") void start(m.streamId, m.model).catch((e) => send({ type: "audio:status", status: "error", detail: `Couldn't hear the tab: ${e instanceof Error ? e.message : e}` }));
  if (m.type === "audio:stop") stop();
});

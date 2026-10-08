// The owner's-voice model (Chatterbox Turbo, MIT, ~3.3 GB) is downloaded only
// when someone turns the feature on. Pinned to one revision with exact sizes, so
// a partial or changed file is never used. Files already complete are skipped.
import { app } from "electron";
import { createWriteStream, existsSync, mkdirSync, renameSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const REPO = "ResembleAI/chatterbox-turbo-ONNX";
const REVISION = "d21799bd0354adb85e348b8a0442a8405110a2cf";

export const VOICE_FILES: { name: string; bytes: number }[] = [
  { name: "onnx/conditional_decoder.onnx", bytes: 1_889_468 },
  { name: "onnx/conditional_decoder.onnx_data", bytes: 768_593_792 },
  { name: "onnx/speech_encoder.onnx", bytes: 1_172_072 },
  { name: "onnx/speech_encoder.onnx_data", bytes: 1_044_712_832 },
  { name: "onnx/embed_tokens.onnx", bytes: 2_058 },
  { name: "onnx/embed_tokens.onnx_data", bytes: 232_812_544 },
  { name: "onnx/language_model.onnx", bytes: 207_266 },
  { name: "onnx/language_model.onnx_data", bytes: 1_269_724_812 },
  { name: "tokenizer.json", bytes: 3_562_272 },
  { name: "tokenizer_config.json", bytes: 414 },
];
export const VOICE_MODEL_BYTES = VOICE_FILES.reduce((n, f) => n + f.bytes, 0);

/** PEGUIN_VOICE_MODEL_DIR lets development reuse a copy instead of downloading again. */
export const voiceModelDir = () => process.env.PEGUIN_VOICE_MODEL_DIR || path.join(app.getPath("userData"), "models", "chatterbox-turbo");

const complete = (f: { name: string; bytes: number }) => {
  const p = path.join(voiceModelDir(), f.name);
  return existsSync(p) && statSync(p).size === f.bytes;
};

export const voiceModelReady = () => VOICE_FILES.every(complete);

let inflight: Promise<void> | null = null;

export function ensureVoiceModel(onProgress: (fraction: number) => void): Promise<void> {
  if (voiceModelReady()) return Promise.resolve();
  inflight ??= (async () => {
    let done = VOICE_FILES.filter(complete).reduce((n, f) => n + f.bytes, 0);
    let last = 0;
    const report = () => { if (done - last > VOICE_MODEL_BYTES / 200) { last = done; onProgress(done / VOICE_MODEL_BYTES); } };
    for (const f of VOICE_FILES) {
      if (complete(f)) continue;
      const target = path.join(voiceModelDir(), f.name);
      mkdirSync(path.dirname(target), { recursive: true });
      const res = await fetch(`https://huggingface.co/${REPO}/resolve/${REVISION}/${f.name}`);
      if (!res.ok || !res.body) throw new Error(`Couldn't download the voice model (${res.status}). Check your connection and try again.`);
      const tmp = `${target}.part`;
      const body = Readable.fromWeb(res.body as any);
      body.on("data", (c: Buffer) => { done += c.length; report(); });
      try {
        await pipeline(body, createWriteStream(tmp));
        if (statSync(tmp).size !== f.bytes) throw new Error("The voice model download was incomplete. Try again.");
        renameSync(tmp, target);
      } finally {
        rmSync(tmp, { force: true });
      }
    }
    onProgress(1);
  })().finally(() => { inflight = null; });
  return inflight;
}

export function deleteVoiceModel() {
  if (!process.env.PEGUIN_VOICE_MODEL_DIR) rmSync(voiceModelDir(), { recursive: true, force: true });
}

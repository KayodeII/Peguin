// The speech model (~550 MB) is downloaded on first run rather than shipped
// in the installer. One download at a time; partial files never count.
import { createWriteStream, existsSync, mkdirSync, renameSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { MODEL_URL, whisperPaths } from "../paths.js";

const MIN_BYTES = 500 * 1024 * 1024; // large-v3-turbo-q5_0 is ~547 MB; anything smaller is broken

export const modelReady = () => { const m = whisperPaths().model; return existsSync(m) && statSync(m).size > MIN_BYTES; };

let inflight: Promise<void> | null = null;

export function ensureModel(onProgress: (fraction: number) => void): Promise<void> {
  if (modelReady()) return Promise.resolve();
  inflight ??= (async () => {
    const target = whisperPaths().model;
    mkdirSync(path.dirname(target), { recursive: true });
    const res = await fetch(MODEL_URL);
    if (!res.ok || !res.body) throw new Error(`Couldn't download the speech model (${res.status}). Check your connection and try again.`);
    const total = Number(res.headers.get("content-length")) || 0;
    let done = 0, last = 0;
    const counted = Readable.fromWeb(res.body as any);
    counted.on("data", (c: Buffer) => {
      done += c.length;
      if (total && done - last > total / 100) { last = done; onProgress(done / total); }
    });
    const tmp = `${target}.part`;
    try {
      await pipeline(counted, createWriteStream(tmp));
      if (statSync(tmp).size < MIN_BYTES) throw new Error("The speech model download was incomplete. Try again.");
      renameSync(tmp, target);
      rmSync(path.join(path.dirname(target), "ggml-base.en.bin"), { force: true }); // the model before 0.6.2
      onProgress(1);
    } finally {
      rmSync(tmp, { force: true });
    }
  })().finally(() => { inflight = null; });
  return inflight;
}

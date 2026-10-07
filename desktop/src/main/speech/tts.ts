import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

/**
 * Text to WAV. macOS `say` for now; Piper (all platforms) replaces it, then
 * the user's own voice (opt-in) behind the same function.
 */
export async function synthesize(text: string): Promise<Buffer> {
  if (process.platform !== "darwin") throw new Error("Speech output currently needs macOS (Piper support is coming).");
  const dir = await mkdtemp(path.join(tmpdir(), "penguin-tts-"));
  try {
    const file = path.join(dir, "line.wav");
    await promisify(execFile)("say", ["-o", file, "--file-format=WAVE", "--data-format=LEI16@24000", text]);
    return await readFile(file);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

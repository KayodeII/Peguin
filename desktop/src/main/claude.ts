// The owner's Claude Code sign-in, streamed. Starting the CLI takes ~1.7 s
// before Claude sees the prompt, so during a meeting one process is kept
// started and waiting (a "spare"); each question uses it once and a fresh
// spare starts behind it. Every question still gets its own process, so no
// conversation carries over between answers.
import { spawn, type ChildProcess } from "node:child_process";
import { tmpdir } from "node:os";
import { createInterface } from "node:readline";

const ARGS = ["-p", "--input-format", "stream-json", "--output-format", "stream-json", "--include-partial-messages", "--verbose", "--max-turns", "1"];

export type CliEvent = { text: string } | { done: true; error?: string } | null;

/** One line of the CLI's stream-json output: a piece of the reply, the end of it, or nothing of interest (pure). */
export function parseLine(line: string): CliEvent {
  let e: any;
  try { e = JSON.parse(line); } catch { return null; }
  if (e?.type === "stream_event" && e.event?.type === "content_block_delta" && e.event.delta?.type === "text_delta") {
    return typeof e.event.delta.text === "string" ? { text: e.event.delta.text } : null;
  }
  if (e?.type === "result") {
    return e.is_error || e.subtype !== "success" ? { done: true, error: String(e.result || e.subtype || "unknown error") } : { done: true };
  }
  return null;
}

const start = (): ChildProcess => {
  const child = spawn("claude", ARGS, { cwd: tmpdir(), env: process.env });
  child.on("error", () => {}); // reported by the question that uses it
  return child;
};
const alive = (c: ChildProcess | null): c is ChildProcess => !!c && c.exitCode === null && c.signalCode === null && !c.killed;

let spare: ChildProcess | null = null;
let warm = 0;

/** Keep a started CLI waiting while a meeting runs; call `cool` when it ends. Counted, so a copilot and a participant can overlap. */
export function warmUp(): () => void {
  warm++;
  if (!alive(spare)) spare = start();
  let done = false;
  return () => {
    if (done) return;
    done = true;
    if (--warm === 0) { spare?.kill(); spare = null; }
  };
}

/** One prompt in, the reply streamed out in pieces as Claude writes it. */
export async function* claudeStream(prompt: string, timeoutMs: number): AsyncGenerator<string> {
  const child = alive(spare) ? spare : start();
  spare = warm > 0 ? start() : null;
  const failed = new Promise<never>((_, reject) => {
    child.once("error", (e) => reject(new Error(`Couldn't run the Claude CLI: ${e.message}`)));
  });
  failed.catch(() => {});
  let err = "";
  child.stderr?.on("data", (d) => (err += d));
  const timer = setTimeout(() => child.kill(), timeoutMs);
  try {
    child.stdin!.write(`${JSON.stringify({ type: "user", message: { role: "user", content: prompt } })}\n`);
    const lines = createInterface({ input: child.stdout! })[Symbol.asyncIterator]();
    for (;;) {
      const next = await Promise.race([lines.next(), failed]);
      if (next.done) throw new Error(child.killed ? "Claude took too long to reply" : `Claude CLI failed: ${err.trim().slice(0, 300) || `exit ${child.exitCode}`}`);
      const ev = parseLine(next.value);
      if (!ev) continue;
      if ("text" in ev) { yield ev.text; continue; }
      if (ev.error) throw new Error(`Claude CLI failed: ${ev.error.slice(0, 300)}`);
      return;
    }
  } finally {
    clearTimeout(timer);
    child.stdin?.end();
    child.kill();
  }
}

/** Whole sentences out of a stream of pieces, each as soon as the next one starts, then whatever is left (pure apart from the input). */
export async function* bySentence(pieces: AsyncIterable<string>): AsyncGenerator<string> {
  let buf = "";
  for await (const p of pieces) {
    buf += p;
    // A sentence is done once its end mark is followed by space and more text ("v0.8" and "e.g." need the space).
    for (let m = buf.match(/^([\s\S]*?[.!?]["”')\]]*)\s+(?=\S)/); m; m = buf.match(/^([\s\S]*?[.!?]["”')\]]*)\s+(?=\S)/)) {
      const s = m[1]!.trim();
      buf = buf.slice(m[0].length);
      if (s) yield s;
    }
  }
  if (buf.trim()) yield buf.trim();
}

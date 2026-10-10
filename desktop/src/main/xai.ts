// xAI (Grok) with the owner's own API key: answers and drafts through its chat
// API, and the standard voice through its text-to-speech API. The key is kept
// encrypted on this Mac (sealed with the Keychain) and only ever sent to xAI.
import { execFile } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { app } from "electron";
import { readSealed, writeSealed } from "./sealed.js";

const API = "https://api.x.ai/v1";

export type XaiAccount = { apiKey: string; models: string[] };

const file = () => path.join(app.getPath("userData"), "xai.sealed");

export function loadXai(): XaiAccount | null {
  try { return existsSync(file()) ? JSON.parse(readSealed(file()).toString("utf8")) as XaiAccount : null; } catch { return null; }
}
export const saveXai = (a: XaiAccount) => writeSealed(file(), JSON.stringify(a));
export const clearXai = () => rmSync(file(), { force: true });

async function call(apiKey: string, pathname: string, init: RequestInit = {}, fetcher: typeof fetch = fetch): Promise<Response> {
  const res = await fetcher(`${API}${pathname}`, { ...init, headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json", ...init.headers } });
  if (res.ok) return res;
  const body = await res.text().catch(() => "");
  if (res.status === 401 || res.status === 403) throw new Error("xAI didn't accept that API key. Check it at console.x.ai and paste it again.");
  throw new Error(`xAI returned ${res.status}${body ? `: ${body.slice(0, 200)}` : ""}`);
}

/** Chat models the key can use, for the owner to pick from (pure). Image, video, speech and embedding models are left out. */
export function chatModels(ids: string[]): string[] {
  return ids.filter((id) => /grok/i.test(id) && !/image|imagine|video|vision|tts|speech|voice|embed/i.test(id)).sort();
}

/** Checks the key and lists the chat models it can use. */
export async function checkXaiKey(apiKey: string, fetcher: typeof fetch = fetch): Promise<string[]> {
  const res = await call(apiKey, "/models", {}, fetcher);
  const body = (await res.json()) as { data?: { id: string }[] };
  const models = chatModels((body.data ?? []).map((m) => m.id));
  if (!models.length) throw new Error("That xAI key works but can't use any Grok chat models. Check your xAI plan.");
  return models;
}

/** One prompt in, one reply out. */
export async function grokChat(apiKey: string, model: string, prompt: string, timeoutMs: number, fetcher: typeof fetch = fetch): Promise<string> {
  const res = await call(apiKey, "/chat/completions", {
    method: "POST",
    body: JSON.stringify({ model, messages: [{ role: "user", content: prompt }] }),
    signal: AbortSignal.timeout(timeoutMs),
  }, fetcher);
  const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const text = body.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("Grok returned an empty reply.");
  return text;
}

/** Text to 24 kHz 16-bit WAV (what Peguin plays into the meeting), in one of xAI's voices. */
export async function grokSpeak(apiKey: string, voiceId: string, text: string, fetcher: typeof fetch = fetch): Promise<Buffer> {
  const res = await call(apiKey, "/tts", { method: "POST", body: JSON.stringify({ text, voice_id: voiceId, language: "en" }), signal: AbortSignal.timeout(30000) }, fetcher);
  const mp3 = Buffer.from(await res.arrayBuffer());
  const dir = await mkdtemp(path.join(tmpdir(), "peguin-grok-"));
  try {
    await writeFile(path.join(dir, "line.mp3"), mp3);
    await promisify(execFile)("afconvert", ["-f", "WAVE", "-d", "LEI16@24000", "-c", "1", path.join(dir, "line.mp3"), path.join(dir, "line.wav")]);
    return await readFile(path.join(dir, "line.wav"));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

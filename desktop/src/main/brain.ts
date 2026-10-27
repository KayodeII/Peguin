// Drafts the update, answers follow-ups, suggests copilot answers and summarises
// recaps, always with the owner's own AI: their Claude Code sign-in, their Codex
// CLI sign-in, or their xAI key (Settings > AI). Peguin's server never pays for it.
// When the chosen AI hits a session/rate limit, the next available one is tried;
// if none are left, callers get a clear "out of uses" error for the voice-control caption.
import { app } from "electron";
import { spawn, execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { answerContext, answerSystem, copilotRecapSystem, copilotSystem, copilotWebSystem, plainSpoken, draftSystem, draftUser, parseDraft, parseRecap, recapSystem, recapUser } from "../../../src/core/brain/prompts.js";
import { gatherContext, type SourceReport } from "./context/index.js";
import { trackerSources } from "./trackerKeys.js";
import { workLogActivity } from "./watch/index.js";
import { wantsCues, type Settings } from "./settings.js";
import { grokChat, grokChatStream, grokSearch, loadXai } from "./xai.js";
import { claudeStream } from "./claude.js";

type AiKind = Settings["ai"];
const AI_ORDER: AiKind[] = ["claude", "codex", "grok"];
/** AIs that hit a session/rate limit this run, until the time they said they reset (or one hour). */
const exhausted = new Map<AiKind, number>();

/** Session / rate / quota limits — worth trying another of the owner's AIs. */
export function isQuotaError(msg: string): boolean {
  return /session limit|rate.?limit|usage.?limit|quota|too many requests|\b429\b|resets\s+\d|hit your limit|capacity|overloaded|tokens? (?:per|limit)|usage_limit|billing|insufficient_quota/i.test(msg);
}

/**
 * Turn Codex CLI stderr into a short owner-facing line. Skips the version banner
 * and JSON noise so we don't show "Codex CLI failed: OpenAI Codex v0.160.1".
 */
export function interpretCodexError(stderr: string, code: number | null, hasReply = false): string {
  const raw = stderr.replace(/\r/g, "").trim();
  // Nested JSON: ERROR: {"error":{"message":"..."}} or "message":"..."
  for (const m of raw.matchAll(/"message"\s*:\s*"((?:\\.|[^"\\])*)"/g)) {
    const text = m[1]!.replace(/\\n/g, " ").replace(/\\"/g, '"').trim();
    if (text && !/^openai codex\b/i.test(text)) {
      if (/not supported when using Codex with a ChatGPT account|model_not_found/i.test(text)) {
        return "Codex's model isn't available on your ChatGPT plan. Pick another model in Codex, or switch Peguin to Claude or Grok in Settings → AI.";
      }
      if (/auth|login|unauthorized|401|forbidden|403/i.test(text)) {
        return "Codex isn't signed in. Run `codex login` in Terminal, or switch Peguin to Claude or Grok in Settings → AI.";
      }
      if (isQuotaError(text)) return `Codex is out of uses: ${text.slice(0, 180)}`;
      return `Codex: ${text.slice(0, 220)}`;
    }
  }
  const lines = raw.split("\n").map((l) => l.trim()).filter(Boolean);
  const useful = lines.find((l) => {
    if (!l || /^openai codex\b/i.test(l)) return false;
    if (/^-{3,}$/.test(l)) return false;
    if (/^(workdir|model|provider|approval|sandbox|reasoning|session id|tokens used|user|codex):?\s/i.test(l)) return false;
    if (/^warning:/i.test(l)) return false;
    return /error|fail|limit|denied|unauthorized|login|sign in|quota|rate|billing|unsupported|not found|invalid/i.test(l);
  });
  if (useful) {
    const cleaned = useful.replace(/^ERROR:\s*/i, "").replace(/^\S+Z\s+(ERROR|WARN)\s+\S+:\s*/, "").slice(0, 220);
    if (isQuotaError(cleaned)) return `Codex is out of uses: ${cleaned}`;
    if (/login|sign in|unauthorized/i.test(cleaned)) {
      return "Codex isn't signed in. Run `codex login` in Terminal, or switch Peguin to Claude or Grok in Settings → AI.";
    }
    return `Codex: ${cleaned}`;
  }
  if (hasReply) return `Codex exited with code ${code ?? "?"} after writing a reply.`;
  // SIGTERM / SIGKILL (timeout) often leaves only the version banner on stderr.
  if (code === 143 || code === 137 || code === 15 || code === null) {
    return "Codex took too long to reply. Try again, or switch Peguin to Claude or Grok in Settings → AI.";
  }
  return "Codex didn't answer. Check you're signed in (`codex login`) or switch Peguin to Claude or Grok in Settings → AI.";
}

/** Failures where another of the owner's AIs should be tried (not a hard stop). */
export function isFallbackAiError(msg: string): boolean {
  if (isQuotaError(msg)) return true;
  return /couldn't run|not found|ENOENT|no xAI|API key|sign in|isn't signed in|didn't answer|isn't available on your ChatGPT|out of uses|took too long|couldn't reach|overloaded|capacity/i.test(msg);
}

/** When the limit lifts, from errors like "resets 9pm (Africa/Lagos)". */
export function parseResetAt(msg: string, now = new Date()): number | null {
  const m = msg.match(/resets\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/i);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2] ?? 0);
  const ap = (m[3] ?? "").toLowerCase();
  if (ap === "pm" && h < 12) h += 12;
  if (ap === "am" && h === 12) h = 0;
  const at = new Date(now);
  at.setSeconds(0, 0);
  at.setHours(h, min, 0, 0);
  if (at.getTime() <= now.getTime()) at.setDate(at.getDate() + 1);
  return at.getTime();
}

/** Tests only: clear the in-memory "this AI is at its limit" map. */
export function clearAiExhaustion() { exhausted.clear(); }

function markExhausted(ai: AiKind, msg: string) {
  exhausted.set(ai, parseResetAt(msg) ?? Date.now() + 60 * 60_000);
}

function stillExhausted(ai: AiKind, now = Date.now()): boolean {
  const until = exhausted.get(ai);
  if (until == null) return false;
  if (now >= until) { exhausted.delete(ai); return false; }
  return true;
}

function hasBin(name: string): boolean {
  try { execFileSync("which", [name], { stdio: "ignore" }); return true; } catch { return false; }
}

/** Which of the owner's AIs look usable on this Mac right now (binary / key present). */
export function availableAis(): AiKind[] {
  const out: AiKind[] = [];
  if (hasBin("claude")) out.push("claude");
  if (hasBin("codex")) out.push("codex");
  if (loadXai()) out.push("grok");
  return out;
}

/** Preferred first, then other installed AIs that aren't sitting out a limit. */
export function aiCandidates(preferred: AiKind, avail = availableAis()): AiKind[] {
  const rest = AI_ORDER.filter((a) => a !== preferred && avail.includes(a));
  return [preferred, ...rest].filter((a, i, xs) => xs.indexOf(a) === i && avail.includes(a) && !stillExhausted(a));
}

/** Short line for the voice-control caption under the cursor. */
export function outOfQuotaMessage(tried: AiKind[], err?: Error | null): string {
  const reset = err?.message.match(/resets\s+([^.·\n]+)/i)?.[1]?.trim().replace(/\s*\([^)]*\)\s*$/, "").trim();
  const when = reset ? ` Resets ${reset}.` : "";
  if (tried.length <= 1) {
    return `Your AI is out of uses for now.${when} Add Codex or Grok in Settings → AI, or try again later.`;
  }
  return `Every AI you have set up is out of uses for now.${when} Try again later.`;
}

async function* generateStreamOne(ai: AiKind, s: Settings, prompt: string, timeoutMs: number): AsyncGenerator<string> {
  if (ai === "codex") { yield await codex(prompt, timeoutMs); return; }
  if (ai === "grok") { const g = grok(s); yield* grokChatStream(g.key, g.model, prompt, timeoutMs); return; }
  yield* claudeStream(prompt, timeoutMs);
}

async function generateOne(ai: AiKind, s: Settings, prompt: string, timeoutMs: number, web: boolean): Promise<string> {
  if (ai === "codex") return codex(prompt, timeoutMs, web);
  if (ai === "grok") { const g = grok(s); return web ? grokSearch(g.key, g.model, prompt, timeoutMs) : grokChat(g.key, g.model, prompt, timeoutMs); }
  return claude(prompt, timeoutMs, web);
}

export type Draft = {
  script: string;
  facts: string[];
  generatedAt: string;
  since: string;
  /** Which of the owner's AIs wrote it. */
  via: Settings["ai"];
  reports: SourceReport[];
  activityCount: number;
};

/** One prompt in, one reply out. Runs outside any project so no CLAUDE.md applies. */
function claude(prompt: string, timeoutMs: number, web = false): Promise<string> {
  return new Promise((resolve, reject) => {
    // --no-session-persistence: Peguin's own prompts mustn't show up as the owner's Claude Code work.
    const args = ["-p", "--no-session-persistence", "--output-format", "json", "--max-turns", web ? "4" : "1", ...(web ? ["--allowedTools", "WebSearch"] : [])];
    const child = spawn("claude", args, { cwd: tmpdir(), env: process.env });
    let out = "", err = "";
    const timer = setTimeout(() => { child.kill(); reject(new Error("Claude took too long to reply")); }, timeoutMs);
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("error", (e) => { clearTimeout(timer); reject(new Error(`Couldn't run the Claude CLI: ${e.message}`)); });
    child.on("close", (code) => {
      clearTimeout(timer);
      try {
        const res = JSON.parse(out) as { result?: string; is_error?: boolean };
        if (code !== 0 || res.is_error || typeof res.result !== "string") throw new Error(res.result || err || `exit ${code}`);
        resolve(res.result);
      } catch (e) { reject(new Error(`Claude CLI failed: ${String(e instanceof Error ? e.message : e).slice(0, 300)}`)); }
    });
    child.stdin.end(prompt);
  });
}

/** One prompt in, one reply out, through the owner's Codex CLI sign-in. Read-only sandbox, no saved session. */
function codex(prompt: string, timeoutMs: number, web = false): Promise<string> {
  return new Promise((resolve, reject) => {
    const dir = mkdtempSync(path.join(tmpdir(), "peguin-codex-"));
    const out = path.join(dir, "reply.txt");
    const child = spawn("codex", [...(web ? ["--search"] : []), "exec", "--sandbox", "read-only", "--skip-git-repo-check", "--ephemeral", "-C", dir,
      "-c", 'model_reasoning_effort="low"', "-o", out, "-"], { cwd: dir, env: process.env });
    let err = "", stdout = "";
    let settled = false;
    const finish = (f: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { rmSync(dir, { recursive: true, force: true }); } catch { /* best effort */ }
      f();
    };
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
      // Give it a moment to exit; close handler publishes the message.
      setTimeout(() => {
        finish(() => reject(new Error("Codex took too long to reply. Try again, or switch Peguin to Claude or Grok in Settings → AI.")));
      }, 400);
    }, timeoutMs);
    child.stderr.on("data", (d) => (err += d));
    child.stdout.on("data", (d) => (stdout += d));
    child.on("error", (e) => finish(() => reject(new Error(`Couldn't run the Codex CLI (${e.message}). Install it and sign in with \`codex login\`, or switch to Claude or Grok in Settings → AI.`))));
    child.on("close", (code) => finish(() => {
      let text = "";
      try { text = readFileSync(out, "utf8").trim(); } catch { /* no reply written */ }
      if (!text) text = stdout.trim();
      if (text && (code === 0 || !/ERROR:/i.test(err))) { resolve(text); return; }
      if (timedOut) {
        reject(new Error("Codex took too long to reply. Try again, or switch Peguin to Claude or Grok in Settings → AI."));
        return;
      }
      if (/connection failed|error sending request|network|dns|timed out/i.test(err)) {
        reject(new Error("Codex couldn't reach OpenAI. Check your internet connection and try again."));
        return;
      }
      reject(new Error(interpretCodexError(err || stdout, code, !!text)));
    }));
    child.stdin.end(prompt);
  });
}

const grok = (s: Settings) => {
  const x = loadXai();
  if (!x) throw new Error("Grok is chosen in Settings > AI but there's no xAI key. Add one there, or pick Claude or Codex.");
  return { key: x.apiKey, model: s.grokModel && x.models.includes(s.grokModel) ? s.grokModel : x.models[0]! };
};

/**
 * One prompt to the owner's chosen AI; on a session/rate limit, the next available
 * AI on this Mac is tried. `web` lets it search first (much slower; no cross-AI retry for web).
 */
async function generate(s: Settings, prompt: string, timeoutMs: number, web = false): Promise<{ text: string; via: AiKind }> {
  if (web) return { text: await generateOne(s.ai, s, prompt, timeoutMs, true), via: s.ai };
  const tried: AiKind[] = [];
  let last: Error | null = null;
  for (const ai of aiCandidates(s.ai)) {
    tried.push(ai);
    try { return { text: await generateOne(ai, s, prompt, timeoutMs, false), via: ai }; }
    catch (e) {
      last = e instanceof Error ? e : new Error(String(e));
      if (isQuotaError(last.message)) markExhausted(ai, last.message);
      if (isFallbackAiError(last.message)) continue;
      throw last;
    }
  }
  throw new Error(last && !isQuotaError(last.message) ? last.message : outOfQuotaMessage(tried.length ? tried : [s.ai], last));
}

/** The same, streamed: Claude and Grok stream; Codex comes in one piece. Session-limit falls back like `generate`. */
async function* generateStream(s: Settings, prompt: string, timeoutMs: number): AsyncGenerator<string> {
  const tried: AiKind[] = [];
  let last: Error | null = null;
  for (const ai of aiCandidates(s.ai)) {
    tried.push(ai);
    try {
      yield* generateStreamOne(ai, s, prompt, timeoutMs);
      return;
    } catch (e) {
      last = e instanceof Error ? e : new Error(String(e));
      if (isQuotaError(last.message)) markExhausted(ai, last.message);
      if (isFallbackAiError(last.message)) continue;
      throw last;
    }
  }
  throw new Error(last && !isQuotaError(last.message) ? last.message : outOfQuotaMessage(tried.length ? tried : [s.ai], last));
}

const collect = async (pieces: AsyncIterable<string>) => { let out = ""; for await (const p of pieces) out += p; return out.trim(); };

const draftFile = () => path.join(app.getPath("userData"), "draft.json");

/**
 * Voice control: a line that started with "Hey Peguin" but that Peguin couldn't
 * understand ("Eypegül, can you swipe to Chrome"). Only the words go to the owner's
 * AI, never audio; it answers with one command Peguin knows, or NONE.
 */
export async function interpretCommand(s: Settings, heard: string): Promise<string | null> {
  const prompt = `You turn a spoken request to a Mac voice assistant into ONE command it understands. The words came from speech recognition, so some may be misheard.
Commands it understands (use these exact shapes):
click <button name> | click <number> | double click | right click | show numbers | hide numbers
open <app name> | go to <website.com> | open my browser | search for <words>
scroll up | scroll down | scroll down a bit | go back | go forward | new tab | close tab | reload
type <text> | press enter | press <key> | find <words>
draw a circle | draw an arrow | highlight this | underline this | clear | stop
Reply with the single best command and nothing else. If it isn't a request to do something on the computer, reply NONE.
Spoken: ${JSON.stringify(heard.slice(0, 300))}`;
  const out = (await collect(generateStream(s, prompt, 20000))).split("\n")[0]!.replace(/^["'`]|["'`.]$/g, "").trim();
  return !out || /^none\b/i.test(out) ? null : out.slice(0, 200);
}

/** One prompt to the owner's AI, the reply in full (the warm Claude CLI when voice control has one ready). */
export const think = (s: Settings, prompt: string, timeoutMs = 30000) => collect(generateStream(s, prompt, timeoutMs));

export function loadDraft(): Draft | null {
  try { return JSON.parse(readFileSync(draftFile(), "utf8")) as Draft; } catch { return null; }
}

/** Gather today's work, have Claude write the spoken update + facts, and keep it. */
export async function prepareDraft(s: Settings): Promise<Draft> {
  const trackers = trackerSources(s);
  const ctx = await gatherContext({ ...s.sources, ...trackers.enabled, mac: s.watch.enabled }, s.timezone, new Date(), { ...trackers.extra, mac: (since) => workLogActivity(since, s) });
  // Only titles, statuses and times leave the machine; never code.
  const activity = ctx.activity.map(({ source, kind, title, status, at }) => ({ source, kind, title, status, at }));
  const cues = wantsCues(s);
  const { text, via } = await generate(s, `${draftSystem(s.displayName, { cues })}\n\n${draftUser(s.displayName, activity, "", ctx.failed)}`, 120000);
  const { script, facts } = parseDraft(text);
  const draft: Draft = {
    script, facts, generatedAt: new Date().toISOString(), since: ctx.since, reports: ctx.reports,
    activityCount: ctx.activity.length, via,
  };
  mkdirSync(path.dirname(draftFile()), { recursive: true });
  writeFileSync(`${draftFile()}.tmp`, JSON.stringify(draft, null, 2));
  renameSync(`${draftFile()}.tmp`, draftFile());
  return draft;
}

/** A spoken answer from the facts only, streamed so Peguin can start on the first sentence; the prompt makes Claude defer otherwise. */
export function answerQuestion(s: Settings, draft: Draft | null, question: string, recent: string[]): AsyncIterable<string> {
  const cues = wantsCues(s);
  return generateStream(s, `${answerSystem(s.displayName, { cues })}\n\n${answerContext(draft?.facts ?? [], draft?.script, recent, question)}`, 25000);
}

/** A private copilot suggestion for the owner to say themselves. */
export async function suggestAnswer(s: Settings, draft: Draft | null, question: string, recent: string[]): Promise<string> {
  return plainSpoken(await collect(generateStream(s, `${copilotSystem(s.displayName, s.copilot.mode)}\n\n${answerContext(draft?.facts ?? [], draft?.script, recent, question)}`, 45000)));
}

/** A general-knowledge suggestion checked on the web: the answer, and the site it came from. */
export async function checkOnline(s: Settings, question: string, quick: string, recent: string[]): Promise<{ answer: string; source?: string }> {
  const { text } = await generate(s, `${copilotWebSystem(s.displayName, s.copilot.mode)}\n\nRecent conversation:\n${recent.join("\n")}\n\nQuestion: ${question}\n\nQuick answer from memory: ${quick}`, 75000, true);
  const reply = plainSpoken(text);
  const m = reply.match(/\n?\s*Source:\s*(.+)\s*$/i);
  return m ? { answer: reply.slice(0, m.index).trim(), source: m[1]!.trim() } : { answer: reply };
}

/** Summary and extra follow-ups for a meeting, from its transcript only. `copilot`: the owner was there themselves. */
export async function summarizeMeeting(s: Settings, lines: string[], copilot = false): Promise<{ summary: string; followUps: string[] }> {
  const system = copilot ? copilotRecapSystem(s.displayName) : recapSystem(s.displayName);
  const { text } = await generate(s, `${system}\n\n${recapUser(lines)}`, 60000);
  return parseRecap(text);
}

/** Is this draft from today (in the user's timezone)? */
export function isFresh(d: Draft | null, timezone: string, now = new Date()): boolean {
  if (!d) return false;
  const day = (x: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(x);
  return day(new Date(d.generatedAt)) === day(now);
}

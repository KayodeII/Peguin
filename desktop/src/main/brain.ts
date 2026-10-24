// Drafts the update, answers follow-ups, suggests copilot answers and summarises
// recaps, always with the owner's own AI: their Claude Code sign-in, their Codex
// CLI sign-in, or their xAI key (Settings > AI). Peguin's server never pays for it.
import { app } from "electron";
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { answerContext, answerSystem, copilotSystem, copilotWebSystem, plainSpoken, draftSystem, draftUser, parseDraft, parseRecap, recapSystem, recapUser } from "../../../src/core/brain/prompts.js";
import { gatherContext, type SourceReport } from "./context/index.js";
import { workLogActivity } from "./watch/index.js";
import { wantsCues, type Settings } from "./settings.js";
import { grokChat, grokChatStream, grokSearch, loadXai } from "./xai.js";
import { claudeStream } from "./claude.js";

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
    let err = "";
    const done = (f: () => void) => { clearTimeout(timer); f(); rmSync(dir, { recursive: true, force: true }); };
    const timer = setTimeout(() => { child.kill(); done(() => reject(new Error("Codex took too long to reply"))); }, timeoutMs);
    child.stderr.on("data", (d) => (err += d));
    child.on("error", (e) => done(() => reject(new Error(`Couldn't run the Codex CLI (${e.message}). Install it and sign in with \`codex login\`, or switch the copilot back to Claude in Settings.`))));
    child.on("close", (code) => done(() => {
      let text = "";
      try { text = readFileSync(out, "utf8").trim(); } catch { /* no reply written */ }
      if (code === 0 && text) resolve(text);
      else if (/connection failed|error sending request|network|dns|timed out/i.test(err)) reject(new Error("Codex couldn't reach OpenAI. Check your internet connection and try again."));
      else reject(new Error(`Codex CLI failed: ${(err.match(/"message":"([^"]+)"/)?.[1] ?? err.split("\n").map((l) => l.replace(/^\S+Z\s+(ERROR|WARN)\s+\S+:\s*/, "")).find((l) => l.trim()) ?? `exit ${code}`).slice(0, 300)}`));
    }));
    child.stdin.end(prompt);
  });
}

const grok = (s: Settings) => {
  const x = loadXai();
  if (!x) throw new Error("Grok is chosen in Settings > AI but there's no xAI key. Add one there, or pick Claude or Codex.");
  return { key: x.apiKey, model: s.grokModel && x.models.includes(s.grokModel) ? s.grokModel : x.models[0]! };
};

/** One prompt to the owner's chosen AI; `web` lets it search the web first (much slower). */
async function generate(s: Settings, prompt: string, timeoutMs: number, web = false): Promise<string> {
  if (s.ai === "codex") return codex(prompt, timeoutMs, web);
  if (s.ai === "grok") { const g = grok(s); return web ? grokSearch(g.key, g.model, prompt, timeoutMs) : grokChat(g.key, g.model, prompt, timeoutMs); }
  return claude(prompt, timeoutMs, web);
}

/** The same, streamed as it's written: Claude and Grok stream; Codex comes in one piece. Uses the warm Claude CLI in meetings. */
async function* generateStream(s: Settings, prompt: string, timeoutMs: number): AsyncGenerator<string> {
  if (s.ai === "codex") { yield await codex(prompt, timeoutMs); return; }
  if (s.ai === "grok") { const g = grok(s); yield* grokChatStream(g.key, g.model, prompt, timeoutMs); return; }
  yield* claudeStream(prompt, timeoutMs);
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
  const ctx = await gatherContext({ ...s.sources, mac: s.watch.enabled }, s.timezone, new Date(), { mac: (since) => workLogActivity(since, s) });
  // Only titles, statuses and times leave the machine; never code.
  const activity = ctx.activity.map(({ source, kind, title, status, at }) => ({ source, kind, title, status, at }));
  const cues = wantsCues(s);
  const { script, facts } = parseDraft(await generate(s, `${draftSystem(s.displayName, { cues })}\n\n${draftUser(s.displayName, activity, "", ctx.failed)}`, 120000));
  const via = s.ai;
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
  const reply = plainSpoken(await generate(s, `${copilotWebSystem(s.displayName, s.copilot.mode)}\n\nRecent conversation:\n${recent.join("\n")}\n\nQuestion: ${question}\n\nQuick answer from memory: ${quick}`, 75000, true));
  const m = reply.match(/\n?\s*Source:\s*(.+)\s*$/i);
  return m ? { answer: reply.slice(0, m.index).trim(), source: m[1]!.trim() } : { answer: reply };
}

/** Is this draft from today (in the user's timezone)? */
export function isFresh(d: Draft | null, timezone: string, now = new Date()): boolean {
  if (!d) return false;
  const day = (x: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(x);
  return day(new Date(d.generatedAt)) === day(now);
}

/** Summary and extra follow-ups for a meeting, from its transcript only. */
export async function summarizeMeeting(s: Settings, lines: string[]): Promise<{ summary: string; followUps: string[] }> {
  return parseRecap(await generate(s, `${recapSystem(s.displayName)}\n\n${recapUser(lines)}`, 60000));
}

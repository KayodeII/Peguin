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
import { wantsCues, type Settings } from "./settings.js";
import { grokChat, grokSearch, loadXai } from "./xai.js";

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
    const args = ["-p", "--output-format", "json", "--max-turns", web ? "4" : "1", ...(web ? ["--allowedTools", "WebSearch"] : [])];
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
      else reject(new Error(`Codex CLI failed: ${(err.match(/"message":"([^"]+)"/)?.[1] ?? err ?? `exit ${code}`).slice(0, 300)}`));
    }));
    child.stdin.end(prompt);
  });
}

/** One prompt to the owner's chosen AI; `web` lets it search the web first (much slower). */
function generate(s: Settings, prompt: string, timeoutMs: number, web = false): Promise<string> {
  if (s.ai === "codex") return codex(prompt, timeoutMs, web);
  if (s.ai === "grok") {
    const x = loadXai();
    if (!x) return Promise.reject(new Error("Grok is chosen in Settings > AI but there's no xAI key. Add one there, or pick Claude or Codex."));
    const model = s.grokModel && x.models.includes(s.grokModel) ? s.grokModel : x.models[0]!;
    return web ? grokSearch(x.apiKey, model, prompt, timeoutMs) : grokChat(x.apiKey, model, prompt, timeoutMs);
  }
  return claude(prompt, timeoutMs, web);
}

const draftFile = () => path.join(app.getPath("userData"), "draft.json");

export function loadDraft(): Draft | null {
  try { return JSON.parse(readFileSync(draftFile(), "utf8")) as Draft; } catch { return null; }
}

/** Gather today's work, have Claude write the spoken update + facts, and keep it. */
export async function prepareDraft(s: Settings): Promise<Draft> {
  const ctx = await gatherContext(s.sources, s.timezone);
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

/** A spoken answer from the facts only; the prompt makes Claude defer otherwise. */
export async function answerQuestion(s: Settings, draft: Draft | null, question: string, recent: string[]): Promise<string> {
  const cues = wantsCues(s);
  return generate(s, `${answerSystem(s.displayName, { cues })}\n\n${answerContext(draft?.facts ?? [], draft?.script, recent, question)}`, 25000);
}

/** A private copilot suggestion for the owner to say themselves. */
export async function suggestAnswer(s: Settings, draft: Draft | null, question: string, recent: string[]): Promise<string> {
  return plainSpoken(await generate(s, `${copilotSystem(s.displayName, s.copilot.mode)}\n\n${answerContext(draft?.facts ?? [], draft?.script, recent, question)}`, 45000));
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

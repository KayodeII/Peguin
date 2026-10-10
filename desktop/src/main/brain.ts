// Drafts the update and answers follow-ups: through the Peguin account's
// server-side Claude when subscribed, otherwise through the Claude Code CLI
// with the user's own Claude login (development and power users).
import { app } from "electron";
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { answerContext, answerSystem, copilotSystem, draftSystem, draftUser, parseDraft, parseRecap, recapSystem, recapUser } from "../../../src/core/brain/prompts.js";
import { cloudAnswer, cloudDraft, cloudRecap, cloudSuggest, offlineLicense } from "./account.js";
import { gatherContext, type SourceReport } from "./context/index.js";
import { wantsCues, type Settings } from "./settings.js";

export type Draft = {
  script: string;
  facts: string[];
  generatedAt: string;
  since: string;
  via: "account" | "claude_cli";
  reports: SourceReport[];
  activityCount: number;
};

/** One prompt in, one reply out. Runs outside any project so no CLAUDE.md applies. */
function claude(prompt: string, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn("claude", ["-p", "--output-format", "json", "--max-turns", "1"], { cwd: tmpdir(), env: process.env });
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
function codex(prompt: string, timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const dir = mkdtempSync(path.join(tmpdir(), "peguin-codex-"));
    const out = path.join(dir, "reply.txt");
    const child = spawn("codex", ["exec", "--sandbox", "read-only", "--skip-git-repo-check", "--ephemeral", "-C", dir,
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

/** The server's AI is unavailable (no credit, outage): use the owner's own Claude Code sign-in instead. */
const serverAiDown = (e: unknown) => (e as { status?: number }).status === 503;

async function viaAccount<T>(subscribed: boolean, server: () => Promise<T>, local: () => Promise<T>): Promise<{ value: T; via: Draft["via"] }> {
  if (subscribed) {
    try { return { value: await server(), via: "account" }; }
    catch (e) { if (!serverAiDown(e)) throw e; }
  }
  return { value: await local(), via: "claude_cli" };
}

const draftFile = () => path.join(app.getPath("userData"), "draft.json");

export function loadDraft(): Draft | null {
  try { return JSON.parse(readFileSync(draftFile(), "utf8")) as Draft; } catch { return null; }
}

/** Gather today's work, have Claude write the spoken update + facts, and keep it. */
export async function prepareDraft(s: Settings): Promise<Draft> {
  const ctx = await gatherContext(s.sources, s.timezone);
  const subscribed = !!(await offlineLicense());
  // Only titles, statuses and times leave the machine; never code.
  const activity = ctx.activity.map(({ source, kind, title, status, at }) => ({ source, kind, title, status, at }));
  const cues = wantsCues(s);
  const { value: { script, facts }, via } = await viaAccount(subscribed,
    () => cloudDraft(s.displayName, activity, ctx.failed, cues),
    async () => parseDraft(await claude(`${draftSystem(s.displayName, { cues })}\n\n${draftUser(s.displayName, activity, "", ctx.failed)}`, 120000)));
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
  return (await viaAccount(!!(await offlineLicense()),
    () => cloudAnswer(s.displayName, draft?.facts ?? [], draft?.script, recent, question, cues),
    () => claude(`${answerSystem(s.displayName, { cues })}\n\n${answerContext(draft?.facts ?? [], draft?.script, recent, question)}`, 25000))).value;
}

/** A private copilot suggestion for the owner to say themselves: same routing as answers, or the owner's Codex CLI if they chose it. */
export async function suggestAnswer(s: Settings, draft: Draft | null, question: string, recent: string[]): Promise<string> {
  const prompt = () => `${copilotSystem(s.displayName)}\n\n${answerContext(draft?.facts ?? [], draft?.script, recent, question)}`;
  if (s.copilotAi === "codex") return codex(prompt(), 45000);
  return (await viaAccount(!!(await offlineLicense()),
    () => cloudSuggest(s.displayName, draft?.facts ?? [], draft?.script, recent, question),
    () => claude(prompt(), 40000))).value;
}

/** Is this draft from today (in the user's timezone)? */
export function isFresh(d: Draft | null, timezone: string, now = new Date()): boolean {
  if (!d) return false;
  const day = (x: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(x);
  return day(new Date(d.generatedAt)) === day(now);
}

/** Summary and extra follow-ups for a meeting, from its transcript only (same routing as drafts). */
export async function summarizeMeeting(s: Settings, lines: string[]): Promise<{ summary: string; followUps: string[] }> {
  return (await viaAccount(!!(await offlineLicense()),
    () => cloudRecap(s.displayName, lines),
    async () => parseRecap(await claude(`${recapSystem(s.displayName)}\n\n${recapUser(lines)}`, 60000)))).value;
}

// Drafts the update and answers follow-ups: through the Peguin account's
// server-side Claude when subscribed, otherwise through the Claude Code CLI
// with the user's own Claude login (development and power users).
import { app } from "electron";
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { answerContext, answerSystem, draftSystem, draftUser, parseDraft, parseRecap, recapSystem, recapUser } from "../../../src/core/brain/prompts.js";
import { cloudAnswer, cloudDraft, cloudRecap, offlineLicense } from "./account.js";
import { gatherContext, type SourceReport } from "./context/index.js";
import type { Settings } from "./settings.js";

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
  const { script, facts } = subscribed
    ? await cloudDraft(s.displayName, activity, ctx.failed)
    : parseDraft(await claude(`${draftSystem(s.displayName)}\n\n${draftUser(s.displayName, activity, "", ctx.failed)}`, 120000));
  const draft: Draft = {
    script, facts, generatedAt: new Date().toISOString(), since: ctx.since, reports: ctx.reports,
    activityCount: ctx.activity.length, via: subscribed ? "account" : "claude_cli",
  };
  mkdirSync(path.dirname(draftFile()), { recursive: true });
  writeFileSync(`${draftFile()}.tmp`, JSON.stringify(draft, null, 2));
  renameSync(`${draftFile()}.tmp`, draftFile());
  return draft;
}

/** A spoken answer from the facts only; the prompt makes Claude defer otherwise. */
export async function answerQuestion(s: Settings, draft: Draft | null, question: string, recent: string[]): Promise<string> {
  if (await offlineLicense()) return cloudAnswer(s.displayName, draft?.facts ?? [], draft?.script, recent, question);
  return claude(`${answerSystem(s.displayName)}\n\n${answerContext(draft?.facts ?? [], draft?.script, recent, question)}`, 25000);
}

/** Is this draft from today (in the user's timezone)? */
export function isFresh(d: Draft | null, timezone: string, now = new Date()): boolean {
  if (!d) return false;
  const day = (x: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(x);
  return day(new Date(d.generatedAt)) === day(now);
}

/** Summary and extra follow-ups for a meeting, from its transcript only (same routing as drafts). */
export async function summarizeMeeting(s: Settings, lines: string[]): Promise<{ summary: string; followUps: string[] }> {
  if (await offlineLicense()) return cloudRecap(s.displayName, lines);
  return parseRecap(await claude(`${recapSystem(s.displayName)}\n\n${recapUser(lines)}`, 60000));
}

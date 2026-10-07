// What the user asked Claude Code to work on, read from its local session
// files (~/.claude/projects/<project>/<session>.jsonl). Opt-in, read only on
// this machine, and only the user's own prompts: never tool output or code.
import { createReadStream } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { createInterface } from "node:readline";
import type { Activity, SourceResult } from "./types.js";

const MAX_SESSIONS = 15;
const PROMPTS_PER_SESSION = 6;
const PROMPT_CHARS = 220;

/** A real prompt typed by the user, not a command, tool result or system note. */
function promptText(entry: any): string | null {
  if (entry?.type !== "user" || entry.isMeta || entry.isSidechain) return null;
  const c = entry.message?.content;
  const text = typeof c === "string" ? c
    : Array.isArray(c) ? c.filter((b: any) => b?.type === "text").map((b: any) => b.text).join(" ") : "";
  const t = text.replace(/\s+/g, " ").trim();
  if (!t || t.startsWith("<") || /^caveat:/i.test(t) || t.startsWith("[Request interrupted")) return null;
  return t.length > PROMPT_CHARS ? `${t.slice(0, PROMPT_CHARS)}…` : t;
}

async function readSession(file: string, since: Date) {
  const prompts: { text: string; at: string }[] = [];
  let project = "";
  const lines = createInterface({ input: createReadStream(file, { encoding: "utf8" }), crlfDelay: Infinity });
  for await (const line of lines) {
    let entry: any;
    try { entry = JSON.parse(line); } catch { continue; }
    if (entry.cwd && !project) project = path.basename(entry.cwd);
    const at = entry.timestamp ? new Date(entry.timestamp) : null;
    if (!at || at < since) continue;
    const text = promptText(entry);
    if (text) prompts.push({ text, at: at.toISOString() });
  }
  return { project, prompts };
}

export async function claudeCodeActivity(since: Date, root = path.join(homedir(), ".claude/projects")): Promise<SourceResult> {
  let dirs: string[];
  try { dirs = await readdir(root); } catch {
    return { activity: [], report: { id: "claude_code", ok: false, items: 0, summary: "No Claude Code sessions on this computer" } };
  }
  const files = (await Promise.all(dirs.map(async (d) => {
    const names = await readdir(path.join(root, d)).catch(() => [] as string[]);
    return Promise.all(names.filter((n) => n.endsWith(".jsonl")).map(async (n) => {
      const f = path.join(root, d, n);
      return { f, mtime: (await stat(f)).mtime };
    }));
  }))).flat().filter((x) => x.mtime >= since).sort((a, b) => +b.mtime - +a.mtime).slice(0, MAX_SESSIONS);

  const activity: Activity[] = [];
  const projects = new Set<string>();
  for (const { f } of files) {
    const { project, prompts } = await readSession(f, since);
    if (!prompts.length) continue;
    projects.add(project);
    // First prompts set the task; the last ones show where it ended up.
    const pick = prompts.length <= PROMPTS_PER_SESSION ? prompts
      : [...prompts.slice(0, PROMPTS_PER_SESSION / 2), ...prompts.slice(-PROMPTS_PER_SESSION / 2)];
    for (const p of pick) activity.push({ source: "claude_code", kind: "ai_session", title: `${project}: ${p.text}`, at: p.at, project });
  }
  const summary = activity.length ? `${files.length} sessions across ${projects.size} project${projects.size === 1 ? "" : "s"}` : "No sessions since then";
  return { activity, report: { id: "claude_code", ok: true, items: activity.length, summary } };
}

// Opt-in AI coding sessions: the owner's own prompts from tools on this Mac.
// Never tool output, never code. Same rules as Claude Code.
import { createReadStream, existsSync } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { createInterface } from "node:readline";
import { claudeCodeActivity } from "./claudeCode.js";
import type { Activity, SourceId, SourceResult } from "./types.js";

const MAX = 40;
const PROMPT_CHARS = 220;

const clip = (t: string) => {
  const s = t.replace(/\s+/g, " ").trim();
  if (!s) return null;
  return s.length > PROMPT_CHARS ? `${s.slice(0, PROMPT_CHARS)}…` : s;
};

const projectName = (cwd: string) => {
  const base = path.basename(cwd.replace(/\/$/, "") || "");
  return base && base !== "." ? base : "";
};

/** Cursor project folder slug → last path segment. */
export const cursorProject = (slug: string) => {
  const parts = slug.split("-").filter(Boolean);
  return parts[parts.length - 1] || slug;
};

/** Pull the owner's typed ask out of a Cursor agent transcript line. */
export function cursorPrompt(raw: string): string | null {
  const q = raw.match(/<user_query>\s*([\s\S]*?)\s*<\/user_query>/i)?.[1] ?? raw;
  const t = q.replace(/<\/?timestamp[^>]*>/gi, "").replace(/<\/?user_query>/gi, "").replace(/\s+/g, " ").trim();
  if (!t || t.startsWith("<") || t.startsWith("{")) return null;
  return clip(t);
}

async function readJsonl(file: string, each: (obj: any) => void) {
  const lines = createInterface({ input: createReadStream(file, { encoding: "utf8" }), crlfDelay: Infinity });
  for await (const line of lines) {
    if (!line.trim()) continue;
    try { each(JSON.parse(line)); } catch { /* torn line */ }
  }
}

function result(id: SourceId, activity: Activity[], missing: string): SourceResult {
  const summary = activity.length
    ? `${activity.length} prompt${activity.length === 1 ? "" : "s"}`
    : "No sessions since then";
  return { activity, report: { id, ok: true, items: activity.length, summary: activity.length ? summary : missing.includes("No ") ? missing : summary } };
}

function absent(id: SourceId, summary: string): SourceResult {
  return { activity: [], report: { id, ok: false, items: 0, summary } };
}

/** Codex CLI: `~/.codex/history.jsonl` is prompts only (`ts` unix seconds). */
export async function codexActivity(since: Date, root = process.env.CODEX_HOME || path.join(homedir(), ".codex")): Promise<SourceResult> {
  const file = path.join(root, "history.jsonl");
  if (!existsSync(file)) return absent("codex", "No Codex sessions on this computer");
  const sinceSec = Math.floor(since.getTime() / 1000);
  const activity: Activity[] = [];
  await readJsonl(file, (o) => {
    if (typeof o?.ts !== "number" || o.ts < sinceSec) return;
    const text = typeof o.text === "string" ? clip(o.text) : null;
    if (!text) return;
    activity.push({ source: "codex", kind: "ai_session", title: text, at: new Date(o.ts * 1000).toISOString(), project: "Codex" });
  });
  return result("codex", activity.slice(-MAX), "No sessions since then");
}

/** Cursor agent transcripts: `~/.cursor/projects/<slug>/agent-transcripts/<id>/<id>.jsonl`. */
export async function cursorActivity(since: Date, root = path.join(homedir(), ".cursor/projects")): Promise<SourceResult> {
  let projects: string[];
  try { projects = await readdir(root); } catch {
    return absent("cursor", "No Cursor sessions on this computer");
  }
  type File = { f: string; project: string; mtime: Date };
  const files: File[] = [];
  for (const slug of projects) {
    const dir = path.join(root, slug, "agent-transcripts");
    const ids = await readdir(dir).catch(() => [] as string[]);
    for (const id of ids) {
      const f = path.join(dir, id, `${id}.jsonl`);
      const st = await stat(f).catch(() => null);
      if (st && st.mtime >= since) files.push({ f, project: cursorProject(slug), mtime: st.mtime });
    }
  }
  files.sort((a, b) => +b.mtime - +a.mtime);
  const activity: Activity[] = [];
  for (const { f, project, mtime } of files.slice(0, 20)) {
    const fallbackAt = mtime.toISOString();
    await readJsonl(f, (o) => {
      if (o?.role !== "user") return;
      const parts = Array.isArray(o.message?.content) ? o.message.content : [];
      const raw = parts.filter((b: any) => b?.type === "text").map((b: any) => String(b.text ?? "")).join("\n");
      const text = cursorPrompt(raw);
      if (!text) return;
      // Transcripts often lack per-line timestamps; the file's mtime is the session's day.
      const at = typeof o.timestamp === "string" && new Date(o.timestamp) >= since ? o.timestamp : fallbackAt;
      activity.push({ source: "cursor", kind: "ai_session", title: `${project}: ${text}`, at, project });
    });
    if (activity.length >= MAX) break;
  }
  return result("cursor", activity.slice(0, MAX), "No sessions since then");
}

/** Gemini CLI chats under `~/.gemini/tmp/<hash>/chats/`. */
export async function geminiActivity(since: Date, root = process.env.GEMINI_CLI_HOME || path.join(homedir(), ".gemini")): Promise<SourceResult> {
  const tmp = path.join(root, "tmp");
  let hashes: string[];
  try { hashes = await readdir(tmp); } catch {
    return absent("gemini", "No Gemini CLI sessions on this computer");
  }
  const activity: Activity[] = [];
  for (const hash of hashes) {
    const chatDir = path.join(tmp, hash, "chats");
    const names = await readdir(chatDir).catch(() => [] as string[]);
    for (const name of names) {
      const f = path.join(chatDir, name);
      const st = await stat(f).catch(() => null);
      if (!st || st.mtime < since) continue;
      if (name.endsWith(".jsonl")) {
        await readJsonl(f, (o) => {
          const role = o?.role ?? o?.type;
          if (role !== "user") return;
          const raw = typeof o.content === "string" ? o.content
            : typeof o.message === "string" ? o.message
            : Array.isArray(o.content) ? o.content.map((c: any) => c?.text ?? "").join(" ") : "";
          const text = clip(raw);
          const at = o.timestamp ? new Date(o.timestamp) : st.mtime;
          if (text && at >= since) activity.push({ source: "gemini", kind: "ai_session", title: text, at: at.toISOString(), project: "Gemini" });
        });
      } else if (name.endsWith(".json")) {
        try {
          const data = JSON.parse(await readFile(f, "utf8")) as { messages?: any[] };
          for (const m of data.messages ?? []) {
            if (m?.role !== "user") continue;
            const text = clip(typeof m.content === "string" ? m.content : "");
            const at = m.timestamp ? new Date(m.timestamp) : st.mtime;
            if (text && at >= since) activity.push({ source: "gemini", kind: "ai_session", title: text, at: at.toISOString(), project: "Gemini" });
          }
        } catch { /* ignore */ }
      }
    }
  }
  return result("gemini", activity.slice(-MAX), "No sessions since then");
}

/** GitHub Copilot CLI: `~/.copilot/session-state/<id>/events.jsonl`. */
export async function copilotActivity(since: Date, root = process.env.COPILOT_HOME || path.join(homedir(), ".copilot")): Promise<SourceResult> {
  const dir = path.join(root, "session-state");
  let ids: string[];
  try { ids = await readdir(dir); } catch {
    return absent("copilot", "No Copilot CLI sessions on this computer");
  }
  const activity: Activity[] = [];
  for (const id of ids) {
    const f = path.join(dir, id, "events.jsonl");
    const st = await stat(f).catch(() => null);
    if (!st || st.mtime < since) continue;
    await readJsonl(f, (o) => {
      const role = o?.role ?? o?.type ?? o?.event;
      if (role !== "user" && role !== "user_message" && o?.type !== "user.prompt") return;
      const raw = typeof o.text === "string" ? o.text : typeof o.content === "string" ? o.content : typeof o.prompt === "string" ? o.prompt : "";
      const text = clip(raw);
      const at = o.timestamp ? new Date(o.timestamp) : st.mtime;
      if (text && at >= since) activity.push({ source: "copilot", kind: "ai_session", title: text, at: at.toISOString(), project: "Copilot" });
    });
  }
  return result("copilot", activity.slice(-MAX), "No sessions since then");
}

/** Continue IDE/CLI: `~/.continue/sessions/*.json`. */
export async function continueActivity(since: Date, root = process.env.CONTINUE_GLOBAL_DIR || path.join(homedir(), ".continue")): Promise<SourceResult> {
  const dir = path.join(root, "sessions");
  let names: string[];
  try { names = await readdir(dir); } catch {
    return absent("continue", "No Continue sessions on this computer");
  }
  const activity: Activity[] = [];
  for (const name of names) {
    if (!name.endsWith(".json") || name === "sessions.json") continue;
    const f = path.join(dir, name);
    const st = await stat(f).catch(() => null);
    if (!st || st.mtime < since) continue;
    try {
      const data = JSON.parse(await readFile(f, "utf8")) as { history?: any[]; workspaceDirectory?: string };
      const project = projectName(data.workspaceDirectory ?? "") || "Continue";
      for (const m of data.history ?? []) {
        if (m?.role !== "user") continue;
        const raw = typeof m.content === "string" ? m.content
          : Array.isArray(m.content) ? m.content.map((c: any) => c?.text ?? "").join(" ") : "";
        const text = clip(raw);
        const at = m.date ? new Date(m.date) : st.mtime;
        if (text && at >= since) activity.push({ source: "continue", kind: "ai_session", title: `${project}: ${text}`, at: at.toISOString(), project });
      }
    } catch { /* ignore */ }
  }
  return result("continue", activity.slice(-MAX), "No sessions since then");
}

/**
 * DeepSeek: desktop app chats under Application Support when installed, else
 * any `~/.deepseek` CLI history. Prompts only.
 */
export async function deepseekActivity(since: Date): Promise<SourceResult> {
  const roots = [
    path.join(homedir(), "Library/Application Support/DeepSeek"),
    path.join(homedir(), "Library/Application Support/deepseek-desktop"),
    path.join(homedir(), ".deepseek"),
  ];
  const root = roots.find((r) => existsSync(r));
  if (!root) return absent("deepseek", "No DeepSeek sessions on this computer");

  const activity: Activity[] = [];
  const walk = async (dir: string, depth = 0) => {
    if (depth > 4 || activity.length >= MAX) return;
    const names = await readdir(dir).catch(() => [] as string[]);
    for (const name of names) {
      const f = path.join(dir, name);
      const st = await stat(f).catch(() => null);
      if (!st) continue;
      if (st.isDirectory()) { await walk(f, depth + 1); continue; }
      if (st.mtime < since) continue;
      if (name.endsWith(".jsonl")) {
        await readJsonl(f, (o) => {
          if (o?.role !== "user" && o?.type !== "user") return;
          const text = clip(typeof o.content === "string" ? o.content : typeof o.text === "string" ? o.text : "");
          const at = o.timestamp ? new Date(o.timestamp) : st.mtime;
          if (text && at >= since) activity.push({ source: "deepseek", kind: "ai_session", title: text, at: at.toISOString(), project: "DeepSeek" });
        });
      } else if (name.endsWith(".json") && /chat|session|message|history/i.test(name)) {
        try {
          const data = JSON.parse(await readFile(f, "utf8")) as any;
          const list = Array.isArray(data) ? data : data.messages ?? data.chats ?? data.history ?? [];
          for (const m of list) {
            if (m?.role !== "user") continue;
            const text = clip(typeof m.content === "string" ? m.content : typeof m.text === "string" ? m.text : "");
            const at = m.timestamp || m.createdAt ? new Date(m.timestamp ?? m.createdAt) : st.mtime;
            if (text && at >= since) activity.push({ source: "deepseek", kind: "ai_session", title: text, at: at.toISOString(), project: "DeepSeek" });
          }
        } catch { /* ignore */ }
      }
    }
  };
  await walk(root);
  return result("deepseek", activity.slice(-MAX), "No sessions since then");
}

export const SESSION_SOURCES: Partial<Record<SourceId, (since: Date) => Promise<SourceResult>>> = {
  claude_code: claudeCodeActivity,
  codex: codexActivity,
  cursor: cursorActivity,
  gemini: geminiActivity,
  copilot: copilotActivity,
  continue: continueActivity,
  deepseek: deepseekActivity,
};

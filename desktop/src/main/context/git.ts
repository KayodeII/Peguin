// Commits by the user across local repos, found without any login.
import { existsSync } from "node:fs";
import { readdir } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";
import { sh } from "./exec.js";
import type { Activity, SourceResult } from "./types.js";

const ROOTS = ["Desktop", "Documents", "Developer", "code", "Code", "projects", "Projects", "dev", "src", "work", "repos", "git", "workspace"];
const SKIP = new Set(["node_modules", "Library", "vendor", "dist", "build", "out", ".cache", "Pods", "venv", ".venv"]);
const MAX_DEPTH = 3;

/** Folders containing a .git, up to MAX_DEPTH below the usual code folders. */
export async function findRepos(home = homedir()): Promise<string[]> {
  const found = new Set<string>();
  async function walk(dir: string, depth: number) {
    if (existsSync(path.join(dir, ".git"))) { found.add(dir); return; }
    if (depth >= MAX_DEPTH) return;
    let entries;
    try { entries = await readdir(dir, { withFileTypes: true }); } catch { return; }
    await Promise.all(entries
      .filter((e) => e.isDirectory() && !e.name.startsWith(".") && !SKIP.has(e.name))
      .map((e) => walk(path.join(dir, e.name), depth + 1)));
  }
  await Promise.all(ROOTS.map((r) => path.join(home, r)).filter(existsSync).map((r) => walk(r, 0)));
  return [...found];
}

export async function gitActivity(since: Date): Promise<SourceResult> {
  const email = (await sh("git", ["config", "--global", "user.email"]).catch(() => "")).trim();
  if (!email) {
    return { activity: [], report: { id: "git", ok: false, items: 0, summary: "No git identity found", hint: "Set it with: git config --global user.email you@example.com" } };
  }
  const repos = await findRepos();
  const activity: Activity[] = [];
  let active = 0;
  await Promise.all(repos.map(async (repo) => {
    const out = await sh("git", ["log", "--all", "--no-merges", `--since=${since.toISOString()}`, `--author=${email}`,
      "--format=%aI%x1f%s", "-n", "40"], { cwd: repo }).catch(() => "");
    const lines = out.split("\n").filter(Boolean);
    if (lines.length) active++;
    for (const line of lines) {
      const [at = "", subject = ""] = line.split("\x1f");
      activity.push({ source: "git", kind: "commit", title: `${path.basename(repo)}: ${subject}`, at, project: path.basename(repo) });
    }
  }));
  const summary = activity.length
    ? `${activity.length} commit${activity.length === 1 ? "" : "s"} in ${active} repo${active === 1 ? "" : "s"}`
    : `No commits since then in ${repos.length} repos`;
  return { activity, report: { id: "git", ok: true, items: activity.length, summary } };
}

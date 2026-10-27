// GitHub as a Source: the owner's existing `gh` CLI login. Connect opens the
// browser via `gh auth login -w`; Peguin never sees a token.
import { spawn } from "node:child_process";
import { sh } from "./exec.js";

export type GithubStatus = { installed: boolean; signedIn: boolean; who: string | null };

export async function githubStatus(): Promise<GithubStatus> {
  const installed = await sh("gh", ["--version"]).then(() => true, () => false);
  if (!installed) return { installed: false, signedIn: false, who: null };
  try {
    const out = await sh("gh", ["api", "user", "--jq", ".login"]);
    return { installed: true, signedIn: true, who: out.trim() || null };
  } catch {
    return { installed: true, signedIn: false, who: null };
  }
}

/** Opens the browser for `gh auth login`. Resolves when the CLI finishes. */
export async function githubConnect(): Promise<GithubStatus> {
  const st = await githubStatus();
  if (!st.installed) throw new Error("Install the GitHub CLI (gh) first, then come back to Connect.");
  if (st.signedIn) return st;
  // -w: browser; -p https: no SSH prompt; -h: github.com only.
  await sh("gh", ["auth", "login", "-h", "github.com", "-p", "https", "-w"], { timeoutMs: 300_000 });
  return githubStatus();
}

export async function githubDisconnect(): Promise<GithubStatus> {
  const st = await githubStatus();
  if (!st.signedIn) return st;
  // gh prompts "Are you sure?"; answer yes on stdin.
  await new Promise<void>((resolve) => {
    const p = spawn("gh", ["auth", "logout", "-h", "github.com"], { stdio: ["pipe", "ignore", "ignore"] });
    p.stdin.write("y\n");
    p.stdin.end();
    const t = setTimeout(() => { p.kill(); resolve(); }, 15_000);
    p.on("exit", () => { clearTimeout(t); resolve(); });
  });
  return githubStatus();
}

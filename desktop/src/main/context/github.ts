// PRs the user opened or reviewed, through the GitHub CLI's existing login.
// (The Penguin account's GitHub connection replaces this for users without gh.)
import { sh } from "./exec.js";
import type { Activity, SourceResult } from "./types.js";

type Pr = { title: string; state: string; isDraft?: boolean; updatedAt: string; repository: { nameWithOwner: string } };

const day = (d: Date) => d.toISOString().slice(0, 10);

export async function githubActivity(since: Date): Promise<SourceResult> {
  const signedIn = await sh("gh", ["auth", "status"]).then(() => true, () => false);
  if (!signedIn) {
    return { activity: [], report: { id: "github", ok: false, items: 0, summary: "GitHub CLI isn't signed in", hint: "Run: gh auth login" } };
  }
  const search = (...filters: string[]) => sh("gh", ["search", "prs", ...filters, `--updated=>=${day(since)}`, "--limit", "30",
    "--json", "title,state,isDraft,updatedAt,repository"]).then((o) => JSON.parse(o) as Pr[]);
  // Search reports merged PRs as "closed", so ask for merged ones separately.
  const [authored, merged, reviewed] = await Promise.all([
    search("--author=@me"), search("--author=@me", "--merged").catch(() => [] as Pr[]), search("--reviewed-by=@me").catch(() => [] as Pr[]),
  ]);
  const isMerged = (p: Pr) => merged.some((m) => m.title === p.title && m.repository.nameWithOwner === p.repository.nameWithOwner);
  const repo = (p: Pr) => p.repository.nameWithOwner.split("/")[1] ?? p.repository.nameWithOwner;
  const activity: Activity[] = [
    ...authored.map((p): Activity => ({
      source: "github", kind: isMerged(p) ? "pr_merged" : p.isDraft ? "pr_draft" : p.state === "closed" ? "pr_closed" : "pr_opened",
      status: isMerged(p) ? "merged" : p.state, title: `${repo(p)}: ${p.title}`, at: p.updatedAt, project: repo(p),
    })),
    ...reviewed.filter((r) => !authored.some((a) => a.title === r.title)).map((p): Activity => ({
      source: "github", kind: "review", status: p.state, title: `${repo(p)}: ${p.title}`, at: p.updatedAt, project: repo(p),
    })),
  ];
  return { activity, report: { id: "github", ok: true, items: activity.length, summary: `${authored.length} PRs, ${activity.length - authored.length} reviews` } };
}

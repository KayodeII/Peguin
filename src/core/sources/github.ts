import type { ActivityItem, Source } from "./types.js";

async function gh(token: string, path: string) {
  const res = await fetch(`https://api.github.com${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "penguin-standup" },
  });
  if (!res.ok) throw new Error(`GitHub ${path} failed: ${res.status} ${await res.text()}`);
  return res.json() as Promise<any>;
}

const day = (d: Date) => d.toISOString().slice(0, 10);
const repoOf = (repositoryUrl: string) => repositoryUrl.split("/repos/")[1] ?? "";

/** config: { username, orgs?: string[] } — orgs narrows results to work repos. */
export const github: Source = async (token, cfg, since) => {
  const user: string = cfg.username ?? (await gh(token, "/user")).login;
  const scope = (cfg.orgs as string[] | undefined)?.map((o) => ` org:${o}`).join("") ?? "";
  const q = (s: string) => encodeURIComponent(s + scope);
  const items: ActivityItem[] = [];

  const [authored, reviewed, commits] = await Promise.all([
    gh(token, `/search/issues?per_page=50&q=${q(`is:pr author:${user} updated:>=${day(since)}`)}`),
    gh(token, `/search/issues?per_page=30&q=${q(`is:pr reviewed-by:${user} -author:${user} updated:>=${day(since)}`)}`),
    gh(token, `/search/commits?per_page=50&sort=committer-date&q=${q(`author:${user} committer-date:>=${day(since)}`)}`).catch(() => ({ items: [] })),
  ]);

  for (const pr of authored.items ?? []) {
    const merged = pr.pull_request?.merged_at;
    items.push({
      source: "github",
      kind: merged ? "pr_merged" : pr.state === "closed" ? "pr_closed" : pr.draft ? "pr_draft" : "pr_open",
      title: `${pr.title} (${repoOf(pr.repository_url)})`,
      url: pr.html_url, status: merged ? "merged" : pr.state, at: merged ?? pr.updated_at,
    });
  }
  for (const pr of reviewed.items ?? []) {
    items.push({ source: "github", kind: "review", title: `Reviewed: ${pr.title} by ${pr.user?.login}`, url: pr.html_url, status: pr.state, at: pr.updated_at });
  }
  const seenPrTitles = new Set<string>((authored.items ?? []).map((pr: any) => String(pr.title).toLowerCase()));
  for (const c of commits.items ?? []) {
    const msg = String(c.commit?.message ?? "").split("\n")[0]!;
    if (!msg || /^merge /i.test(msg) || seenPrTitles.has(msg.toLowerCase())) continue;
    items.push({ source: "github", kind: "commit", title: `${msg} (${c.repository?.full_name})`, url: c.html_url, at: c.commit?.committer?.date });
  }
  return items.filter((i) => new Date(i.at) >= since);
};

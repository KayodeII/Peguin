import type { Source } from "./types.js";

/** config: { baseUrl: "https://acme.atlassian.net", email } ; token = Atlassian API token. */
export const jira: Source = async (token, cfg, since) => {
  const base = String(cfg.baseUrl ?? "").replace(/\/$/, "");
  if (!base || !cfg.email) throw new Error("Jira needs config.baseUrl and config.email");
  const mins = Math.max(1, Math.ceil((Date.now() - since.getTime()) / 60000));
  const res = await fetch(`${base}/rest/api/3/search/jql`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${cfg.email}:${token}`).toString("base64")}`,
      Accept: "application/json", "Content-Type": "application/json",
    },
    body: JSON.stringify({
      jql: `assignee = currentUser() AND updated >= -${mins}m ORDER BY updated DESC`,
      fields: ["summary", "status", "updated", "resolutiondate"],
      maxResults: 50,
    }),
  });
  if (!res.ok) throw new Error(`Jira failed: ${res.status} ${await res.text()}`);
  const json: any = await res.json();
  return (json.issues ?? []).map((i: any) => ({
    source: "jira" as const,
    kind: i.fields?.resolutiondate ? "issue_done" : "issue",
    title: `${i.key} ${i.fields?.summary}`,
    url: `${base}/browse/${i.key}`,
    status: i.fields?.status?.name,
    at: i.fields?.resolutiondate ?? i.fields?.updated,
  }));
};

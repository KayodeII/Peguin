import type { Source } from "./types.js";

const QUERY = `query($since: DateTimeOrDuration!) {
  viewer {
    assignedIssues(first: 50, filter: { updatedAt: { gte: $since } }, orderBy: updatedAt) {
      nodes { identifier title url updatedAt completedAt state { name type } }
    }
  }
}`;

export const linear: Source = async (token, _cfg, since) => {
  const res = await fetch("https://api.linear.app/graphql", {
    method: "POST",
    headers: { Authorization: token, "Content-Type": "application/json" },
    body: JSON.stringify({ query: QUERY, variables: { since: since.toISOString() } }),
  });
  if (!res.ok) throw new Error(`Linear failed: ${res.status} ${await res.text()}`);
  const json: any = await res.json();
  if (json.errors) throw new Error(`Linear: ${JSON.stringify(json.errors)}`);
  return (json.data?.viewer?.assignedIssues?.nodes ?? []).map((i: any) => ({
    source: "linear" as const,
    kind: i.completedAt ? "issue_done" : "issue",
    title: `${i.identifier} ${i.title}`,
    url: i.url,
    status: i.state?.name,
    at: i.completedAt ?? i.updatedAt,
  }));
};

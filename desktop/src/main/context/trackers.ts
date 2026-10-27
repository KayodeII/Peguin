// Issues assigned to the owner in Linear and Jira, with their own API keys.
// Reuses the server stack's sources; only titles, statuses and times are kept.
import { jira } from "../../../../src/core/sources/jira.js";
import { linear } from "../../../../src/core/sources/linear.js";
import type { ActivityItem } from "../../../../src/core/sources/types.js";
import type { Activity, SourceResult } from "./types.js";

export type LinearKey = { apiKey: string; who: string };
export type JiraKey = { site: string; email: string; token: string; who: string };
export type TrackerKeys = { linear?: LinearKey; jira?: JiraKey };

const NAME = { linear: "Linear", jira: "Jira" } as const;
const rejected = (e: unknown) => /\b40[13]\b/.test(String(e));

/** "acme", "acme.atlassian.net" or any page on the site, as https://acme.atlassian.net (pure). */
export function jiraSite(input: string): string {
  const raw = input.trim().replace(/\/+$/, "");
  if (!raw) throw new Error("Enter your Jira site, like acme.atlassian.net.");
  if (/^http:\/\//i.test(raw)) throw new Error("Use your Jira site's https address.");
  const host = raw.includes(".") || raw.includes("/") ? raw : `${raw}.atlassian.net`;
  let url: URL;
  try { url = new URL(/^https:\/\//i.test(host) ? host : `https://${host}`); } catch { throw new Error("That doesn't look like a Jira site. Use the address you open Jira at, like acme.atlassian.net."); }
  return url.origin;
}

/** An issue as an activity line; the project is the key's prefix ("ENG-12" is ENG) (pure). */
export function issueActivity(i: ActivityItem, source: "linear" | "jira"): Activity {
  const key = i.title.split(" ")[0] ?? "";
  return { source, kind: i.kind, title: i.title, status: i.status, at: i.at, project: key.includes("-") ? key.split("-")[0] : undefined };
}

async function issues(source: "linear" | "jira", fetchIssues: () => Promise<ActivityItem[]>): Promise<SourceResult> {
  try {
    const activity = (await fetchIssues()).map((i) => issueActivity(i, source));
    const done = activity.filter((a) => a.kind === "issue_done").length;
    return { activity, report: { id: source, ok: true, items: activity.length, summary: `${activity.length} issues${done ? `, ${done} done` : ""}` } };
  } catch (e) {
    return {
      activity: [],
      report: rejected(e)
        ? { id: source, ok: false, items: 0, summary: `${NAME[source]} didn't accept your API key`, hint: `Disconnect and connect ${NAME[source]} again in Sources` }
        : { id: source, ok: false, items: 0, summary: `Couldn't reach ${NAME[source]}: ${String(e).slice(0, 100)}` },
    };
  }
}

export const linearActivity = (k: LinearKey) => (since: Date) => issues("linear", () => linear(k.apiKey, {}, since));
export const jiraActivity = (k: JiraKey) => (since: Date) => issues("jira", () => jira(k.token, { baseUrl: k.site, email: k.email }, since));

/** Checks a Linear personal API key and returns whose it is. */
export async function checkLinear(apiKey: string, fetcher: typeof fetch = fetch): Promise<string> {
  const res = await fetcher("https://api.linear.app/graphql", {
    method: "POST",
    headers: { Authorization: apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({ query: "{ viewer { name email } }" }),
  });
  if (res.status === 400 || res.status === 401 || res.status === 403) throw new Error("Linear didn't accept that API key. Make a personal API key in Linear, Settings, Security & access, and paste it again.");
  if (!res.ok) throw new Error(`Linear returned ${res.status}. Try again in a minute.`);
  const body = (await res.json()) as { data?: { viewer?: { name?: string; email?: string } }; errors?: unknown[] };
  const viewer = body.data?.viewer;
  if (!viewer || body.errors?.length) throw new Error("Linear didn't accept that API key. Make a personal API key in Linear, Settings, Security & access, and paste it again.");
  return viewer.name || viewer.email || "your account";
}

/** Checks a Jira site, email and API token, and returns whose they are. */
export async function checkJira(site: string, email: string, token: string, fetcher: typeof fetch = fetch): Promise<string> {
  const res = await fetcher(`${site}/rest/api/3/myself`, {
    headers: { Authorization: `Basic ${Buffer.from(`${email}:${token}`).toString("base64")}`, Accept: "application/json" },
  }).catch(() => { throw new Error(`Couldn't reach ${site}. Check the site address.`); });
  if (res.status === 401 || res.status === 403) throw new Error("Jira didn't accept that email and API token. Make a token at id.atlassian.com, Security, API tokens, and use the email you sign in to Jira with.");
  if (res.status === 404) throw new Error(`${site} doesn't look like a Jira site. Use the address you open Jira at.`);
  if (!res.ok) throw new Error(`Jira returned ${res.status}. Try again in a minute.`);
  const me = (await res.json().catch(() => ({}))) as { displayName?: string; emailAddress?: string };
  return me.displayName || me.emailAddress || email;
}

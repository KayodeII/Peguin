import { log } from "../log.js";
import type { Integration } from "../repo.js";
import { github } from "./github.js";
import { jira } from "./jira.js";
import { linear } from "./linear.js";
import type { ActivityItem, Source } from "./types.js";

export * from "./types.js";

const sources: Record<string, Source> = { github, linear, jira };

/** Pull activity from every connected tool in parallel. One failing source
 *  never blocks the update; it's reported so the draft can say so. */
export async function gatherActivity(integrations: Integration[], since: Date) {
  const results = await Promise.allSettled(integrations.map((i) => sources[i.kind]!(i.token, i.config, since)));
  const items: ActivityItem[] = [];
  const failed: string[] = [];
  results.forEach((r, idx) => {
    const kind = integrations[idx]!.kind;
    if (r.status === "fulfilled") items.push(...r.value);
    else { failed.push(kind); log.warn({ kind, err: String(r.reason) }, "activity source failed"); }
  });
  items.sort((a, b) => a.at.localeCompare(b.at));
  return { items, failed };
}

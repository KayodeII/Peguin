// The owner's Linear and Jira API keys, kept encrypted on this Mac (sealed with
// the Keychain) and only ever sent to Linear or to their own Jira site.
import { app } from "electron";
import { existsSync } from "node:fs";
import path from "node:path";
import { jiraActivity, linearActivity, type TrackerKeys } from "./context/trackers.js";
import type { SourceResult } from "./context/types.js";
import { readSealed, writeSealed } from "./sealed.js";
import type { Settings } from "./settings.js";

const file = () => path.join(app.getPath("userData"), "trackers.sealed");

export function loadTrackers(): TrackerKeys {
  try { return existsSync(file()) ? JSON.parse(readSealed(file()).toString("utf8")) as TrackerKeys : {}; } catch { return {}; }
}
export const saveTrackers = (k: TrackerKeys) => writeSealed(file(), JSON.stringify(k));

/** What the Sources screen shows: connected or not, and as whom. Never the keys. */
export const trackerStatus = (k = loadTrackers()) => ({
  linear: k.linear ? { who: k.linear.who } : null,
  jira: k.jira ? { who: k.jira.who, site: k.jira.site } : null,
});

/** Linear and Jira count as sources only once connected, and while their toggle is on. */
export function trackerSources(s: Settings): { enabled: { linear: boolean; jira: boolean }; extra: Partial<Record<"linear" | "jira", (since: Date) => Promise<SourceResult>>> } {
  const k = loadTrackers();
  return {
    enabled: { linear: !!k.linear && s.sources.linear, jira: !!k.jira && s.sources.jira },
    extra: { ...(k.linear && { linear: linearActivity(k.linear) }), ...(k.jira && { jira: jiraActivity(k.jira) }) },
  };
}

import { previousWorkdayStart } from "../../../../src/core/sources/types.js";
import { claudeCodeActivity } from "./claudeCode.js";
import { gitActivity } from "./git.js";
import { githubActivity } from "./github.js";
import type { Activity, SourceId, SourceReport, SourceResult } from "./types.js";

export type { Activity, SourceId, SourceReport } from "./types.js";

const SOURCES: Record<SourceId, (since: Date) => Promise<SourceResult>> = {
  git: gitActivity,
  github: githubActivity,
  claude_code: claudeCodeActivity,
};

/** Everything the user worked on since the previous workday, from every enabled source. */
export async function gatherContext(enabled: Record<SourceId, boolean>, timezone: string, now = new Date()) {
  const since = previousWorkdayStart(now, timezone);
  const ids = (Object.keys(SOURCES) as SourceId[]).filter((id) => enabled[id]);
  const results = await Promise.all(ids.map((id) => SOURCES[id](since).catch((e): SourceResult => ({
    activity: [], report: { id, ok: false, items: 0, summary: `Failed: ${String(e).slice(0, 120)}` },
  }))));
  const activity: Activity[] = results.flatMap((r) => r.activity).sort((a, b) => a.at.localeCompare(b.at));
  const reports: SourceReport[] = results.map((r) => r.report);
  return { since: since.toISOString(), activity, reports, failed: reports.filter((r) => !r.ok).map((r) => r.id) };
}

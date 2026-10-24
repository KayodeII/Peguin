// The context bank: everything Peguin has gathered about the owner's work, in one
// place they can read: activity from every enabled source, today's work log,
// the facts it answers from, their voice and recaps. Read on demand, on this Mac.
import { loadDraft } from "./brain.js";
import { gatherContext, type Activity, type SourceReport } from "./context/index.js";
import { listMeetings } from "./meetings.js";
import type { Settings } from "./settings.js";
import { listClips } from "./speech/voice/clips.js";
import { sampleInfo } from "./speech/voice/store.js";
import { readLog, workLogActivity } from "./watch/index.js";
import { summarise, type Stint } from "./watch/summary.js";

export type ContextBank = {
  since: string;
  activity: Activity[];
  reports: SourceReport[];
  /** The work log today, time per window. Null when the work log is off. */
  today: Stint[] | null;
  facts: string[];
  factsAt: string | null;
  voice: { sampleSeconds: number | null; clipsWaiting: number };
  recaps: number;
  gatheredAt: string;
};

export async function contextBank(s: Settings): Promise<ContextBank> {
  const ctx = await gatherContext({ ...s.sources, mac: s.watch.enabled }, s.timezone, new Date(), { mac: (since) => workLogActivity(since, s) });
  const midnight = new Date(); midnight.setHours(0, 0, 0, 0);
  const draft = loadDraft();
  return {
    since: ctx.since,
    activity: [...ctx.activity].reverse(), // newest first
    reports: ctx.reports,
    today: s.watch.enabled ? summarise(readLog(), midnight, s.watch.everyMinutes, { minMinutes: s.watch.everyMinutes, max: 30 }) : null,
    facts: draft?.facts ?? [],
    factsAt: draft?.generatedAt ?? null,
    voice: { sampleSeconds: sampleInfo()?.seconds ?? null, clipsWaiting: listClips().length },
    recaps: listMeetings(s.recap.keepDays).length,
    gatheredAt: new Date().toISOString(),
  };
}

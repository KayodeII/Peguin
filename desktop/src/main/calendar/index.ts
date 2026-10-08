// All the owner's calendars together: which are connected, what's coming up,
// and the next standup to attend. Results are cached briefly so the scheduler
// can ask every 20 seconds without hammering anyone's calendar.
import type { Settings } from "../settings.js";
import { calendlySource } from "./calendly.js";
import { googleSource } from "./google.js";
import { icsSource } from "./ics.js";
import { macSource } from "./mac.js";
import { microsoftSource } from "./microsoft.js";
import { nearMisses, standups, type Standup } from "./match.js";
import { loadCalendarSecrets } from "./secrets.js";
import type { CalendarEvent, CalendarKind, CalendarSource } from "./types.js";

export type Upcoming = {
  standups: Standup[];
  /** Meetings with a link that didn't match the owner's words, so they can add one. */
  others: { title: string; start: number; calendar: string }[];
  errors: { source: CalendarKind; message: string }[];
  checkedAt: number;
};

const LOOK_BACK_MS = 15 * 60_000; // a standup that started a few minutes ago can still be joined
const LOOK_AHEAD_MS = 7 * 86_400_000;
const CACHE_MS = 5 * 60_000;

export function connectedSources(s: Settings): CalendarSource[] {
  const secrets = loadCalendarSecrets();
  const out: CalendarSource[] = [];
  if (s.calendar.mac) out.push(macSource);
  for (const a of secrets.accounts) {
    if (a.provider === "google") out.push(googleSource(a.id, a.account));
    if (a.provider === "microsoft") out.push(microsoftSource(a.id, a.account));
    if (a.provider === "calendly") out.push(calendlySource({ accountId: a.id }));
  }
  if (secrets.links.length) out.push(icsSource(secrets.links));
  if (secrets.calendlyToken) out.push(calendlySource(secrets.calendlyToken));
  return out;
}

/** What's connected, without any secret (tokens change on every refresh, so they mustn't key the cache). */
function cacheKey(s: Settings): string {
  const { accounts, links, calendlyToken } = loadCalendarSecrets();
  return JSON.stringify([s.calendar, accounts.map((a) => a.id), links, !!calendlyToken]);
}

let cache: { key: string; at: number; value: Upcoming } | null = null;

/** Clears the cache after the owner changes calendars or words. */
export function refreshCalendars() { cache = null; }

export async function upcoming(s: Settings, now = Date.now()): Promise<Upcoming> {
  const key = cacheKey(s);
  if (cache && cache.key === key && now - cache.at < CACHE_MS) return cache.value;
  const from = new Date(now - LOOK_BACK_MS), to = new Date(now + LOOK_AHEAD_MS);
  const events: CalendarEvent[] = [];
  const errors: Upcoming["errors"] = [];
  await Promise.all(connectedSources(s).map(async (src) => {
    try { events.push(...await src.events(from, to)); }
    catch (e) { errors.push({ source: src.kind, message: e instanceof Error ? e.message : String(e) }); }
  }));
  const value: Upcoming = {
    standups: standups(events, s.calendar.words).filter((x) => x.end > now),
    others: nearMisses(events, s.calendar.words).filter((e) => e.start > now).sort((a, b) => a.start - b.start).slice(0, 5)
      .map((e) => ({ title: e.title, start: e.start, calendar: e.calendar })),
    errors,
    checkedAt: now,
  };
  cache = { key, at: now, value };
  return value;
}

/** The next standup from the calendars, if calendars are on and one is coming up. */
export async function nextCalendarStandup(s: Settings, now = Date.now()): Promise<Standup | null> {
  if (!s.calendar.enabled) return null;
  return (await upcoming(s, now)).standups[0] ?? null;
}

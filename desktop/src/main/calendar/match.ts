// Finding standups in calendar events (pure): which events count, and the
// meeting link to join. The words that make an event a standup are the
// owner's setting.
import { detectPlatform, type Platform } from "../meeting/platform.js";
import type { CalendarEvent } from "./types.js";

export type Standup = { id: string; title: string; start: number; end: number; url: string; platform: Exclude<Platform, "unknown">; calendar: string; source: CalendarEvent["source"] };

const URL_RE = /https?:\/\/[^\s<>"')\]]+/gi;

/** The first Meet, Zoom or Teams link in the event, tidied of trailing punctuation. */
export function joinLink(texts: string[]): { url: string; platform: Exclude<Platform, "unknown"> } | null {
  for (const text of texts) {
    for (const raw of text.match(URL_RE) ?? []) {
      const url = raw.replace(/[.,;:!?]+$/, "");
      const platform = detectPlatform(url);
      if (platform !== "unknown") return { url, platform };
    }
  }
  return null;
}

/** Does the title contain one of the owner's standup words (whole words, any case)? */
export function matchesStandup(title: string, words: string[]): boolean {
  const t = ` ${title.toLowerCase().replace(/[^a-z0-9]+/g, " ")} `;
  return words.some((w) => {
    const k = w.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    return k.length > 0 && t.includes(` ${k} `);
  });
}

/** Standups (matching title and a joinable link), deduplicated across calendars, soonest first. */
export function standups(events: CalendarEvent[], words: string[]): Standup[] {
  const seen = new Set<string>();
  const out: Standup[] = [];
  for (const e of [...events].sort((a, b) => a.start - b.start)) {
    if (!matchesStandup(e.title, words)) continue;
    const link = joinLink(e.text);
    if (!link) continue;
    // The same meeting can arrive from two calendars (the Mac's and a link): one per start and link.
    const key = `${e.start}|${link.url}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ id: e.id, title: e.title, start: e.start, end: e.end, url: link.url, platform: link.platform, calendar: e.calendar, source: e.source });
  }
  return out;
}

/** Events that look like meetings (have a link) but didn't match: shown so the owner can add a word. */
export function nearMisses(events: CalendarEvent[], words: string[]): CalendarEvent[] {
  return events.filter((e) => !matchesStandup(e.title, words) && joinLink(e.text));
}

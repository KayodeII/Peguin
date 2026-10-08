// Calendar links: the private iCal address Google, Outlook and iCloud each
// offer. Recurring standups are expanded (with moved or cancelled occurrences
// applied) using the time zones the calendar itself declares.
import ICAL from "ical.js";
import type { CalendarEvent, CalendarSource } from "./types.js";

/** Safety net for unbounded rules (a daily standup over a few weeks is ~30). */
const MAX_OCCURRENCES = 2000;

const textOf = (v: ICAL.Event) => [v.component.getFirstPropertyValue("url"), v.location, v.description]
  .map((x) => (x == null ? "" : String(x))).filter(Boolean);

/** Events overlapping [from, to] in one iCal document (pure). */
export function parseIcs(text: string, from: Date, to: Date, calendar: string): CalendarEvent[] {
  const root = new ICAL.Component(ICAL.parse(text));
  for (const tz of root.getAllSubcomponents("vtimezone")) ICAL.TimezoneService.register(tz);
  const name = String(root.getFirstPropertyValue("x-wr-calname") ?? calendar);
  const vevents = root.getAllSubcomponents("vevent").map((c) => new ICAL.Event(c));
  const masters = new Map<string, ICAL.Event>();
  for (const e of vevents) if (!e.isRecurrenceException()) masters.set(e.uid, e);
  // Moved or edited single occurrences belong to their series.
  for (const e of vevents) if (e.isRecurrenceException()) masters.get(e.uid)?.relateException(e);

  const out: CalendarEvent[] = [];
  const push = (e: ICAL.Event, start: Date, end: Date, occurrence: string) => {
    if (end.getTime() < from.getTime() || start.getTime() > to.getTime()) return;
    if (String(e.component.getFirstPropertyValue("status") ?? "").toUpperCase() === "CANCELLED") return;
    out.push({ id: `ics:${e.uid}:${occurrence}`, title: e.summary ?? "", start: start.getTime(), end: end.getTime(), text: textOf(e), calendar: name, source: "ics" });
  };
  for (const e of masters.values()) {
    if (!e.isRecurring()) { push(e, e.startDate.toJSDate(), e.endDate.toJSDate(), e.startDate.toString()); continue; }
    const it = e.iterator();
    for (let n = 0, next = it.next(); next && n < MAX_OCCURRENCES; n++, next = it.next()) {
      if (next.toJSDate().getTime() > to.getTime()) break;
      const d = e.getOccurrenceDetails(next);
      push(d.item, d.startDate.toJSDate(), d.endDate.toJSDate(), d.recurrenceId.toString());
    }
  }
  return out;
}

/** The owner's calendar links. `webcal://` is the same address over https. */
export function icsSource(links: string[], fetcher: typeof fetch = fetch): CalendarSource {
  return {
    kind: "ics",
    async events(from, to) {
      const all: CalendarEvent[] = [];
      for (const [i, link] of links.entries()) {
        const url = link.trim().replace(/^webcal:\/\//i, "https://");
        const res = await fetcher(url, { signal: AbortSignal.timeout(20000) }).catch(() => null);
        if (!res?.ok) throw new Error(`Calendar link ${i + 1} couldn't be read${res ? ` (${res.status})` : ""}. Check it's the private iCal address.`);
        try { all.push(...parseIcs(await res.text(), from, to, `Calendar link ${i + 1}`)); }
        catch { throw new Error(`Calendar link ${i + 1} isn't an iCal calendar.`); }
      }
      return all;
    },
  };
}

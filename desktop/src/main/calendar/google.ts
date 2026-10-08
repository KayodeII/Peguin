// Google Calendar, connected with one click: the primary calendar's events
// (where meeting invites land), read-only.
import type { CalendarEvent, CalendarSource } from "./types.js";
import { authedGet } from "./oauth.js";

const API = "https://www.googleapis.com/calendar/v3";

type GoogleEvent = {
  id: string; summary?: string; status?: string; location?: string; description?: string; hangoutLink?: string;
  start?: { dateTime?: string; date?: string }; end?: { dateTime?: string; date?: string };
  conferenceData?: { entryPoints?: { entryPointType?: string; uri?: string }[] };
  attendees?: { self?: boolean; responseStatus?: string }[];
};

/** Google's events in our shape (pure). All-day, cancelled and declined events are left out. */
export function fromGoogle(items: GoogleEvent[], calendar: string): CalendarEvent[] {
  return items.flatMap((e) => {
    if (e.status === "cancelled" || !e.start?.dateTime || !e.end?.dateTime) return [];
    if (e.attendees?.some((a) => a.self && a.responseStatus === "declined")) return [];
    const video = e.conferenceData?.entryPoints?.filter((p) => p.entryPointType === "video").map((p) => p.uri) ?? [];
    return [{
      id: `google:${e.id}`, title: e.summary ?? "", start: Date.parse(e.start.dateTime), end: Date.parse(e.end.dateTime),
      text: [e.hangoutLink, ...video, e.location, e.description].filter((x): x is string => !!x),
      calendar, source: "google" as const,
    }];
  });
}

export function googleSource(accountId: string, label: string): CalendarSource {
  return {
    kind: "google",
    async events(from, to) {
      const out: CalendarEvent[] = [];
      let pageToken: string | undefined;
      for (let page = 0; page < 5; page++) {
        const q = new URLSearchParams({
          timeMin: from.toISOString(), timeMax: to.toISOString(), singleEvents: "true", orderBy: "startTime", maxResults: "250",
          ...(pageToken ? { pageToken } : {}),
        });
        const r = await authedGet<{ items?: GoogleEvent[]; nextPageToken?: string }>(accountId, "Google Calendar", `${API}/calendars/primary/events?${q}`);
        out.push(...fromGoogle(r.items ?? [], label));
        if (!(pageToken = r.nextPageToken)) break;
      }
      return out;
    },
  };
}

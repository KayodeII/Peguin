// Calendly: meetings booked through the owner's Calendly, connected with one
// click (OAuth), or through a personal access token pasted before that existed.
import { authedGet } from "./oauth.js";
import type { CalendarEvent, CalendarSource } from "./types.js";

const API = "https://api.calendly.com";

type CalendlyEvent = {
  uri: string; name?: string; start_time: string; end_time: string; status?: string;
  location?: { type?: string; location?: string | null; join_url?: string | null } | null;
};

/** Calendly's scheduled events in our shape (pure). */
export function fromCalendly(collection: CalendlyEvent[]): CalendarEvent[] {
  return collection.filter((e) => e.status !== "canceled").map((e) => ({
    id: `calendly:${e.uri.split("/").pop()}`,
    title: e.name ?? "",
    start: Date.parse(e.start_time),
    end: Date.parse(e.end_time),
    text: [e.location?.join_url, e.location?.location].filter((x): x is string => !!x),
    calendar: "Calendly",
    source: "calendly" as const,
  }));
}

/** `auth` is a personal access token, or a connected account's id. */
export function calendlySource(auth: string | { accountId: string }, fetcher: typeof fetch = fetch): CalendarSource {
  const get = async <T>(url: string): Promise<T> => {
    if (typeof auth !== "string") return authedGet<T>(auth.accountId, "Calendly", url, {}, fetcher);
    const token = auth;
    const res = await fetcher(url, { headers: { authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20000) }).catch(() => null);
    if (res?.status === 401) throw new Error("Calendly didn't accept the saved token. Disconnect it and connect Calendly again.");
    if (!res?.ok) throw new Error(`Couldn't reach Calendly${res ? ` (${res.status})` : ""}. Try again in a minute.`);
    return res.json() as Promise<T>;
  };
  return {
    kind: "calendly",
    async events(from, to) {
      const me = await get<{ resource: { uri: string } }>(`${API}/users/me`);
      const out: CalendarEvent[] = [];
      let url: string | null = `${API}/scheduled_events?${new URLSearchParams({
        user: me.resource.uri, min_start_time: from.toISOString(), max_start_time: to.toISOString(), status: "active", count: "100",
      })}`;
      for (let page = 0; url && page < 5; page++) {
        const r: { collection: CalendlyEvent[]; pagination?: { next_page?: string | null } } = await get(url);
        out.push(...fromCalendly(r.collection));
        url = r.pagination?.next_page ?? null;
      }
      return out;
    },
  };
}

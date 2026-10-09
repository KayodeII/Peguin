// Outlook / Microsoft 365 calendar, connected with one click, through
// Microsoft Graph's calendar view (recurring meetings already expanded).
import type { CalendarEvent, CalendarSource } from "./types.js";
import { authedGet } from "./oauth.js";

const API = "https://graph.microsoft.com/v1.0";

type GraphEvent = {
  id: string; subject?: string; isCancelled?: boolean; isAllDay?: boolean;
  start: { dateTime: string }; end: { dateTime: string };
  onlineMeeting?: { joinUrl?: string } | null; location?: { displayName?: string } | null;
  body?: { content?: string } | null; responseStatus?: { response?: string } | null;
};

/** Graph gives UTC times without a zone marker (we ask for UTC). */
const utc = (s: string) => Date.parse(/[zZ]|[+-]\d\d:\d\d$/.test(s) ? s : `${s}Z`);

/** Graph's events in our shape (pure). All-day, cancelled and declined events are left out. */
export function fromGraph(items: GraphEvent[], calendar: string): CalendarEvent[] {
  return items.flatMap((e) => {
    if (e.isCancelled || e.isAllDay || e.responseStatus?.response === "declined") return [];
    return [{
      id: `microsoft:${e.id}`, title: e.subject ?? "", start: utc(e.start.dateTime), end: utc(e.end.dateTime),
      text: [e.onlineMeeting?.joinUrl, e.location?.displayName, e.body?.content].filter((x): x is string => !!x),
      calendar, source: "microsoft" as const,
    }];
  });
}

export function microsoftSource(accountId: string, label: string): CalendarSource {
  return {
    kind: "microsoft",
    async events(from, to) {
      const out: CalendarEvent[] = [];
      let url: string | undefined = `${API}/me/calendarView?${new URLSearchParams({
        startDateTime: from.toISOString(), endDateTime: to.toISOString(), $top: "100",
        $select: "id,subject,isCancelled,isAllDay,start,end,onlineMeeting,location,body,responseStatus",
      })}`;
      for (let page = 0; url && page < 5; page++) {
        const r: { value?: GraphEvent[]; "@odata.nextLink"?: string } = await authedGet(accountId, "Outlook", url, {
          prefer: 'outlook.timezone="UTC", outlook.body-content-type="text"',
        });
        out.push(...fromGraph(r.value ?? [], label));
        url = r["@odata.nextLink"];
      }
      return out;
    },
  };
}

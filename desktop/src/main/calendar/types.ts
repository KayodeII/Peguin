// One shape for events from every calendar Peguin can read (the Mac's
// Calendar, calendar links, Calendly, and later Google and Microsoft directly).

export type CalendarKind = "mac" | "ics" | "calendly";

export type CalendarEvent = {
  /** Stable for one occurrence: the same meeting on another day has a different id. */
  id: string;
  title: string;
  start: number;
  end: number;
  /** Where the event keeps links: its URL field, location and notes, in that order. */
  text: string[];
  /** The calendar it came from, for the UI ("Work", "you@company.com"). */
  calendar: string;
  source: CalendarKind;
};

export interface CalendarSource {
  kind: CalendarKind;
  /** Events overlapping [from, to]. Throws a plain-sentence error the UI can show. */
  events(from: Date, to: Date): Promise<CalendarEvent[]>;
}

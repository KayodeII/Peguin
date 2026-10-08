import { describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({ app: { getPath: () => "/tmp/peguin-test", isPackaged: false }, safeStorage: { isEncryptionAvailable: () => false } }));

const { joinLink, matchesStandup, nearMisses, standups } = await import("../desktop/src/main/calendar/match.js");
const { parseIcs } = await import("../desktop/src/main/calendar/ics.js");
const { fromCalendly } = await import("../desktop/src/main/calendar/calendly.js");
const { fromMac } = await import("../desktop/src/main/calendar/mac.js");
const { dueFor, whenLabel } = await import("../desktop/src/main/scheduler.js");
const { Settings } = await import("../desktop/src/main/settings.js");

const WORDS = ["standup", "stand-up", "stand up", "daily", "scrum"];
const ev = (o: Partial<{ id: string; title: string; start: number; text: string[] }>) =>
  ({ id: "1", title: "", start: 0, end: 900_000, text: [], calendar: "Work", source: "mac" as const, ...o });

describe("finding standups", () => {
  it("takes the first Meet, Zoom or Teams link, tidied", () => {
    expect(joinLink(["Join: https://meet.google.com/abc-defg-hij."])).toEqual({ url: "https://meet.google.com/abc-defg-hij", platform: "google_meet" });
    expect(joinLink(["https://example.com/doc", "Room 4 / https://acme.zoom.us/j/123456789?pwd=x"])?.platform).toBe("zoom");
    expect(joinLink(["<https://teams.microsoft.com/l/meetup-join/19%3a>"])?.platform).toBe("teams");
    expect(joinLink(["No link here", "https://docs.google.com/x"])).toBeNull();
  });
  it("matches the owner's words as whole words", () => {
    expect(matchesStandup("Engineering Daily Stand-up", WORDS)).toBe(true);
    expect(matchesStandup("Daily", WORDS)).toBe(true);
    expect(matchesStandup("Dailymotion partnership call", WORDS)).toBe(false); // not a whole word
    expect(matchesStandup("Team sync", WORDS)).toBe(false);
    expect(matchesStandup("Team sync", [...WORDS, "team sync"])).toBe(true);
  });
  it("needs a joinable link, drops duplicates from two calendars, soonest first", () => {
    const meet = ["https://meet.google.com/abc-defg-hij"];
    const out = standups([
      ev({ id: "b", title: "Daily standup", start: 2000, text: meet }),
      ev({ id: "a", title: "Daily standup", start: 1000, text: meet }),
      ev({ id: "a2", title: "Daily standup", start: 1000, text: meet }), // same meeting from a calendar link
      ev({ id: "c", title: "Standup (no link)", start: 1500 }),
    ], WORDS);
    expect(out.map((x) => x.id)).toEqual(["a", "b"]);
  });
  it("shows meetings with links that didn't match, so the owner can add a word", () => {
    expect(nearMisses([ev({ title: "Team sync", text: ["https://meet.google.com/xyz-abcd-efg"] }), ev({ title: "Lunch" })], WORDS).map((e) => e.title)).toEqual(["Team sync"]);
  });
});

const ICS = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//EN
X-WR-CALNAME:Work
BEGIN:VTIMEZONE
TZID:Africa/Lagos
BEGIN:STANDARD
DTSTART:19700101T000000
TZOFFSETFROM:+0100
TZOFFSETTO:+0100
TZNAME:WAT
END:STANDARD
END:VTIMEZONE
BEGIN:VEVENT
UID:standup-1
SUMMARY:Daily standup
DTSTART;TZID=Africa/Lagos:20261005T093000
DTEND;TZID=Africa/Lagos:20261005T094500
RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR
EXDATE;TZID=Africa/Lagos:20261009T093000
DESCRIPTION:Join with Google Meet: https://meet.google.com/abc-defg-hij
END:VEVENT
BEGIN:VEVENT
UID:standup-1
RECURRENCE-ID;TZID=Africa/Lagos:20261007T093000
SUMMARY:Daily standup (moved)
DTSTART;TZID=Africa/Lagos:20261007T100000
DTEND;TZID=Africa/Lagos:20261007T101500
DESCRIPTION:Join with Google Meet: https://meet.google.com/abc-defg-hij
END:VEVENT
BEGIN:VEVENT
UID:cancelled-1
SUMMARY:Scrum review
STATUS:CANCELLED
DTSTART;TZID=Africa/Lagos:20261006T140000
DTEND;TZID=Africa/Lagos:20261006T150000
LOCATION:https://acme.zoom.us/j/111
END:VEVENT
BEGIN:VEVENT
UID:sync-1
SUMMARY:Team sync
DTSTART:20261008T120000Z
DTEND:20261008T123000Z
LOCATION:https://acme.zoom.us/j/222
END:VEVENT
END:VCALENDAR`;

describe("calendar links (iCal)", () => {
  const from = new Date("2026-10-05T00:00:00+01:00"), to = new Date("2026-10-10T00:00:00+01:00");
  const events = parseIcs(ICS, from, to, "Calendar link 1");

  it("expands the weekday standup in its own time zone, skipping the removed day", () => {
    const daily = events.filter((e) => e.title.startsWith("Daily standup")).map((e) => new Date(e.start).toISOString());
    expect(daily).toEqual([
      "2026-10-05T08:30:00.000Z", "2026-10-06T08:30:00.000Z", "2026-10-07T09:00:00.000Z", "2026-10-08T08:30:00.000Z",
    ]); // Fri 9th removed; Wed 7th moved to 10:00 Lagos
  });
  it("uses the moved occurrence's title, drops cancelled events, keeps one-offs", () => {
    expect(events.find((e) => e.start === Date.parse("2026-10-07T09:00:00Z"))?.title).toBe("Daily standup (moved)");
    expect(events.some((e) => e.title === "Scrum review")).toBe(false);
    expect(events.find((e) => e.title === "Team sync")?.text).toContain("https://acme.zoom.us/j/222");
    expect(events[0]?.calendar).toBe("Work");
  });
  it("gives each occurrence its own id, so each day's standup is attended once", () => {
    const ids = events.filter((e) => e.title.startsWith("Daily")).map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it("feeds standups end to end", () => {
    expect(standups(events, WORDS).map((s) => s.platform)).toEqual(["google_meet", "google_meet", "google_meet", "google_meet"]);
  });
});

describe("Calendly and the Mac", () => {
  it("maps Calendly events, using the join link and skipping cancelled ones", () => {
    const out = fromCalendly([
      { uri: "https://api.calendly.com/scheduled_events/AAA", name: "Daily standup", start_time: "2026-10-08T08:30:00Z", end_time: "2026-10-08T08:45:00Z", location: { type: "google_conference", join_url: "https://meet.google.com/aaa-bbbb-ccc" } },
      { uri: "https://api.calendly.com/scheduled_events/BBB", name: "Intro", start_time: "2026-10-08T10:00:00Z", end_time: "2026-10-08T10:30:00Z", status: "canceled" },
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ id: "calendly:AAA", title: "Daily standup", source: "calendly", text: ["https://meet.google.com/aaa-bbbb-ccc"] });
  });
  it("maps the Mac helper's events", () => {
    expect(fromMac([{ id: "X@1", title: "Standup", start: 1, end: 2, url: "", location: "https://acme.zoom.us/j/9", notes: "", calendar: "" }])[0])
      .toMatchObject({ id: "mac:X@1", text: ["https://acme.zoom.us/j/9"], calendar: "Calendar" });
  });
});

describe("scheduling a calendar standup", () => {
  const start = Date.parse("2026-10-08T08:30:00Z");
  const p = { id: "ics:standup-1:x", url: "https://meet.google.com/abc-defg-hij", start };
  const none = () => ({ prepared: new Set<string>(), joined: new Set<string>() });
  it("prepares 15 minutes before and joins a minute before, up to 10 minutes late", () => {
    expect(dueFor(p, new Date(start - 20 * 60_000), none())).toBe(null);
    expect(dueFor(p, new Date(start - 15 * 60_000), none())).toBe("prepare");
    expect(dueFor(p, new Date(start - 60_000), none())).toBe("join");
    expect(dueFor(p, new Date(start + 9 * 60_000), none())).toBe("join");
    expect(dueFor(p, new Date(start + 11 * 60_000), none())).toBe(null);
  });
  it("does each step once per occurrence", () => {
    const done = { prepared: new Set([p.id]), joined: new Set([p.id]) };
    expect(dueFor(p, new Date(start - 10 * 60_000), done)).toBe(null);
    expect(dueFor(p, new Date(start), done)).toBe(null);
  });
  it("labels it in the owner's time zone", () => {
    expect(whenLabel(start, new Date("2026-10-08T07:00:00Z"), "Africa/Lagos")).toBe("Today at 09:30");
    expect(whenLabel(start, new Date("2026-10-07T07:00:00Z"), "Africa/Lagos")).toBe("Tomorrow at 09:30");
    expect(whenLabel(start, new Date("2026-10-05T07:00:00Z"), "Africa/Lagos")).toBe("Thursday at 09:30");
  });
  it("starts with calendars off and editable standup words", () => {
    expect(Settings.parse({}).calendar).toEqual({ enabled: false, mac: false, words: WORDS });
  });
});

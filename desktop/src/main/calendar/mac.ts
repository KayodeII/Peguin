// The Mac's Calendar (EventKit, through the bundled calendar-helper): every
// account the owner has added to macOS (Google, Exchange/Outlook, iCloud).
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { promisify } from "node:util";
import { calendarHelperPath } from "../paths.js";
import type { CalendarEvent, CalendarSource } from "./types.js";

export type MacCalendarAccess = "authorized" | "notDetermined" | "denied" | "restricted" | "writeOnly" | "unavailable";

async function helper(args: string[], timeoutMs = 15000): Promise<unknown> {
  const bin = calendarHelperPath();
  if (process.platform !== "darwin" || !existsSync(bin)) throw new Error("The Mac calendar reader is missing from this install.");
  // The helper exits non-zero with a JSON body when it has no access; read stdout either way.
  const { stdout } = await promisify(execFile)(bin, args, { timeout: timeoutMs }).catch((e: { stdout?: string }) => ({ stdout: e.stdout ?? "" }));
  try { return JSON.parse(String(stdout).trim()); } catch { throw new Error("The Mac calendar reader returned nothing."); }
}

export async function macCalendarAccess(): Promise<MacCalendarAccess> {
  try { return ((await helper(["status"])) as { status: MacCalendarAccess }).status; } catch { return "unavailable"; }
}

/** Shows macOS's permission prompt the first time; afterwards just reports the answer. */
export async function requestMacCalendarAccess(): Promise<MacCalendarAccess> {
  return ((await helper(["request"], 130000)) as { status: MacCalendarAccess }).status;
}

type Raw = { id: string; title: string; start: number; end: number; url: string; location: string; notes: string; calendar: string };

/** The helper's events in our shape (pure). */
export const fromMac = (raw: Raw[]): CalendarEvent[] => raw.map((e) => ({
  id: `mac:${e.id}`, title: e.title, start: e.start, end: e.end,
  text: [e.url, e.location, e.notes].filter(Boolean), calendar: e.calendar || "Calendar", source: "mac" as const,
}));

export const macSource: CalendarSource = {
  kind: "mac",
  async events(from, to) {
    const out = await helper(["events", String(from.getTime()), String(to.getTime())]);
    if (!Array.isArray(out)) {
      throw new Error("Peguin doesn't have access to your Mac's calendars. Allow it in System Settings, Privacy & Security, Calendars.");
    }
    return fromMac(out as Raw[]);
  },
};

// Past meetings and their recaps, encrypted on this Mac, kept for as long as
// the owner chooses (Settings), then deleted.
import { app } from "electron";
import { existsSync, readdirSync, rmSync } from "node:fs";
import path from "node:path";
import { expired, type MeetingRecord } from "./meeting/record.js";
import { readSealed, writeSealed } from "./sealed.js";

const dir = () => path.join(app.getPath("userData"), "meetings");
const file = (id: string) => path.join(dir(), `${id.replace(/[^a-z0-9-]/gi, "")}.bin`);

export function saveMeeting(r: MeetingRecord) {
  writeSealed(file(r.id), JSON.stringify(r));
}

export function loadMeeting(id: string): MeetingRecord | null {
  try { return JSON.parse(readSealed(file(id)).toString("utf8")) as MeetingRecord; } catch { return null; }
}

/** Newest first. Deletes anything past the retention period, and anything this install can't decrypt. */
export function listMeetings(keepDays: number, now = Date.now()): MeetingRecord[] {
  if (!existsSync(dir())) return [];
  const out: MeetingRecord[] = [];
  for (const name of readdirSync(dir()).filter((f) => f.endsWith(".bin"))) {
    const r = loadMeeting(name.slice(0, -4));
    if (!r || expired(r, keepDays, now)) { rmSync(path.join(dir(), name), { force: true }); continue; }
    out.push(r);
  }
  return out.sort((a, b) => b.startedAt - a.startedAt);
}

export function setFollowUpDone(id: string, index: number, done: boolean): MeetingRecord | null {
  const r = loadMeeting(id);
  const f = r?.recap?.followUps[index];
  if (!r || !f) return r;
  f.done = done;
  saveMeeting(r);
  return r;
}

export function deleteMeeting(id: string) { rmSync(file(id), { force: true }); }
export function deleteAllMeetings() { rmSync(dir(), { recursive: true, force: true }); }

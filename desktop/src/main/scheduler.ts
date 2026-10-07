// Attends the recurring standup: prepares the update shortly before, then
// joins. Pure timing logic is in `due()` so it can be tested without timers.
import type { Settings } from "./settings.js";

export const PREP_MINUTES = 15;
export const JOIN_MINUTES = 1;

/** Weekday (0 = Sunday) and minutes since midnight, in the user's timezone. */
export function localClock(now: Date, timeZone: string) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    .formatToParts(now).map((x) => [x.type, x.value]));
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(String(p.weekday));
  const date = new Intl.DateTimeFormat("en-CA", { timeZone }).format(now);
  return { weekday, minutes: Number(p.hour) * 60 + Number(p.minute), date };
}

/** What should happen right now, given what already happened today. */
export function due(s: Settings, now: Date, done: { prepared?: string; joined?: string }): "prepare" | "join" | null {
  const { url, time, days, auto } = s.standup;
  if (!auto || !url) return null;
  const { weekday, minutes, date } = localClock(now, s.timezone);
  if (!days.includes(weekday)) return null;
  const [h = 0, m = 0] = time.split(":").map(Number);
  const start = h * 60 + m;
  if (minutes >= start - JOIN_MINUTES && minutes < start + 10 && done.joined !== date) return "join";
  if (minutes >= start - PREP_MINUTES && minutes < start - JOIN_MINUTES && done.prepared !== date) return "prepare";
  return null;
}

/** Next standup start, for the UI ("Tomorrow 09:30"). */
export function nextStandup(s: Settings, now = new Date()): { label: string } | null {
  const { url, time, days } = s.standup;
  if (!url || !days.length) return null;
  const { weekday, minutes } = localClock(now, s.timezone);
  const [h = 0, m = 0] = time.split(":").map(Number);
  for (let i = 0; i < 8; i++) {
    const wd = (weekday + i) % 7;
    if (!days.includes(wd) || (i === 0 && minutes >= h * 60 + m + 10)) continue;
    const name = i === 0 ? "Today" : i === 1 ? "Tomorrow" : ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][wd];
    return { label: `${name} at ${time}` };
  }
  return null;
}

export function startScheduler(opts: {
  settings: () => Settings;
  prepare: () => Promise<unknown>;
  join: (url: string) => Promise<unknown>;
  log: (msg: string) => void;
}) {
  const done: { prepared?: string; joined?: string } = {};
  let busy = false;
  const tick = async () => {
    if (busy) return;
    const s = opts.settings();
    const action = due(s, new Date(), done);
    if (!action) return;
    busy = true;
    const today = localClock(new Date(), s.timezone).date;
    try {
      if (action === "prepare") { done.prepared = today; opts.log("Preparing today's update"); await opts.prepare(); }
      else { done.joined = today; opts.log("Joining your standup"); await opts.join(s.standup.url); }
    } catch (e) { opts.log(`Scheduled ${action} failed: ${e instanceof Error ? e.message : e}`); }
    finally { busy = false; }
  };
  const timer = setInterval(() => void tick(), 20000);
  void tick();
  return () => clearInterval(timer);
}

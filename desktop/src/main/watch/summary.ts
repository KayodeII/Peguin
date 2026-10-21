// The work log (pure): what was in front on this Mac every few minutes, app and
// window title only, turned into a few lines for the standup draft. No I/O.

export type Glance = { at: string; app: string; title: string };

/** Browser and editor suffixes, unread counts and the like: noise in a title. */
const SUFFIX = /\s+[-–—|]\s+(Google Chrome|Chromium|Safari|Mozilla Firefox|Firefox|Arc|Microsoft Edge|Brave|Visual Studio Code|Cursor|Zed)$/i;

export function cleanTitle(title: string, app: string): string {
  let t = title.replace(/^\(\d+\)\s*/, "").replace(/^[●•*]\s*/, "").replace(SUFFIX, "").replace(/\s+/g, " ").trim();
  if (t.toLowerCase() === app.toLowerCase()) t = "";
  return t.slice(0, 120);
}

/** Apps and titles the owner keeps out of the log, matched case-insensitively (the owner's list, from Settings). */
export function skipped(g: { app: string; bundle?: string; title: string }, skip: string[]): boolean {
  const app = g.app.toLowerCase(), bundle = (g.bundle ?? "").toLowerCase(), title = g.title.toLowerCase();
  if (!app || /peguin/.test(app) || /loginwindow|screensaver/.test(bundle)) return true;
  // Private windows announce themselves in the title in most browsers.
  if (/\b(incognito|private browsing|inprivate)\b/.test(title)) return true;
  return skip.some((w) => { const s = w.trim().toLowerCase(); return !!s && (app === s || bundle === s || title.includes(s)); });
}

/** Older than `keepDays`: dropped from the log. */
export const prune = (log: Glance[], keepDays: number, now: Date) =>
  log.filter((g) => now.getTime() - Date.parse(g.at) < keepDays * 86_400_000);

export type Stint = { app: string; title: string; minutes: number; first: string; last: string };

/**
 * Time per app and window since `since`, longest first. Each glance stands for
 * `everyMinutes`; stints shorter than `minMinutes` are passing glances, not work.
 */
export function summarise(log: Glance[], since: Date, everyMinutes: number, o: { minMinutes?: number; max?: number } = {}): Stint[] {
  const by = new Map<string, Stint>();
  for (const g of log) {
    if (Date.parse(g.at) < since.getTime()) continue;
    const title = cleanTitle(g.title, g.app);
    const key = `${g.app}\n${title}`;
    const s = by.get(key) ?? { app: g.app, title, minutes: 0, first: g.at, last: g.at };
    s.minutes += everyMinutes;
    if (g.at < s.first) s.first = g.at;
    if (g.at > s.last) s.last = g.at;
    by.set(key, s);
  }
  return [...by.values()]
    .filter((s) => s.minutes >= (o.minMinutes ?? 2 * everyMinutes))
    .sort((a, b) => b.minutes - a.minutes || a.first.localeCompare(b.first))
    .slice(0, o.max ?? 15);
}

/** "about 1 h 20 min" */
export function duration(minutes: number): string {
  const m = Math.round(minutes / 5) * 5 || minutes;
  if (m < 60) return `about ${m} min`;
  const h = Math.floor(m / 60), r = m % 60;
  return `about ${h} h${r ? ` ${r} min` : ""}`;
}

export const stintLine = (s: Stint) => `${s.app}${s.title ? `: ${s.title}` : ""} (${duration(s.minutes)})`;

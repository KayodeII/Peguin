export type ActivityItem = {
  source: "github" | "linear" | "jira";
  kind: string;          // e.g. "pr_opened", "pr_merged", "review", "commit", "issue"
  title: string;
  url?: string;
  status?: string;
  at: string;            // ISO timestamp
  detail?: string;
};

export type Source = (token: string, cfg: Record<string, any>, since: Date) => Promise<ActivityItem[]>;

/** Start of the previous working day in the user's timezone, so a Monday
 *  standup covers Friday onward. Returned as a UTC Date. */
export function previousWorkdayStart(now: Date, timeZone: string): Date {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", weekday: "short", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" })
      .formatToParts(now).map((p) => [p.type, p.value]),
  );
  const back: Record<string, number> = { Mon: 3, Sun: 2, Sat: 1 };
  const days = back[parts.weekday!] ?? 1;
  // Local midnight today, expressed in UTC
  const localNow = Date.UTC(+parts.year!, +parts.month! - 1, +parts.day!, +parts.hour!, +parts.minute!, +parts.second!);
  const offset = localNow - Math.floor(now.getTime() / 1000) * 1000;
  const localMidnight = Date.UTC(+parts.year!, +parts.month! - 1, +parts.day!);
  return new Date(localMidnight - days * 86400000 - offset);
}

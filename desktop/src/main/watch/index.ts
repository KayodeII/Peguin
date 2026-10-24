// The work log: every few minutes, the app in front and its window title (no
// screenshots, no window contents), so the standup draft knows what the owner
// spent time on beyond commits and PRs. Off until the owner turns it on; kept
// encrypted on this Mac for the owner's number of days, viewable and deletable.
import { app } from "electron";
import { existsSync, rmSync } from "node:fs";
import path from "node:path";
import { pointerHelperPath } from "../paths.js";
import { Helper } from "../pointer/index.js";
import { readSealed, writeSealed } from "../sealed.js";
import type { Settings } from "../settings.js";
import type { Activity, SourceResult } from "../context/types.js";
import { prune, skipped, stintLine, summarise, type Glance, type Stint } from "./summary.js";

/** Away from the keyboard this long: nothing is noted (a window left open isn't work). */
const IDLE_S = 5 * 60;

const file = () => path.join(app.getPath("userData"), "worklog", "log.bin");

export function readLog(): Glance[] {
  if (!existsSync(file())) return [];
  try { return JSON.parse(readSealed(file()).toString("utf8")) as Glance[]; } catch { return []; }
}

const writeLog = (log: Glance[]) => writeSealed(file(), JSON.stringify(log));

export function clearLog() { rmSync(path.dirname(file()), { recursive: true, force: true }); }

export type WorkLogStatus = { on: boolean; titles: boolean; today: Stint[]; glances: number; error?: string };

export class WorkLog {
  private helper = new Helper();
  private timer: NodeJS.Timeout | null = null;
  private error: string | undefined;

  /** `onGlance`: the window just noted, so Peguin's cursor can go and look at it. */
  constructor(private settings: () => Settings, private onGlance?: (win: { x: number; y: number; w: number; h: number } | undefined, app: string) => void) {}

  /** Starts or stops to match Settings. */
  apply() {
    const w = this.settings().watch;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (!w.enabled) { this.helper.stop(); return; }
    this.timer = setInterval(() => void this.glance(), w.everyMinutes * 60_000);
    void this.glance();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.helper.stop();
  }

  private async glance() {
    const w = this.settings().watch;
    if (!existsSync(pointerHelperPath())) { this.error = "The helper that reads window titles is missing. Reinstall Peguin, or run `npm run setup:pointer` in desktop/."; return; }
    try {
      const f = await this.helper.call<{ app: string; bundle: string; title: string; idle: number; frame?: { x: number; y: number; w: number; h: number } }>("front");
      this.error = undefined;
      if (f.idle >= IDLE_S || skipped(f, w.skipApps)) return;
      const now = new Date();
      writeLog([...prune(readLog(), w.keepDays, now), { at: now.toISOString(), app: f.app, title: f.title }]);
      this.onGlance?.(f.frame, f.app);
    } catch (e) {
      this.error = e instanceof Error ? e.message : String(e);
    }
  }

  async status(): Promise<WorkLogStatus> {
    const w = this.settings().watch;
    const since = new Date(); since.setHours(0, 0, 0, 0);
    const log = readLog();
    const titles = existsSync(pointerHelperPath()) ? await this.helper.call<{ trusted: boolean }>("status").then((r) => r.trusted, () => false) : false;
    if (!w.enabled) this.helper.stop();
    return { on: !!this.timer, titles, today: summarise(log, since, w.everyMinutes, { minMinutes: w.everyMinutes }), glances: log.length, error: this.error };
  }
}

/** The work log as a context source for the draft. */
export async function workLogActivity(since: Date, s: Settings): Promise<SourceResult> {
  const stints = summarise(readLog(), since, s.watch.everyMinutes);
  const activity: Activity[] = stints.map((st) => ({ source: "mac", kind: "window", title: stintLine(st), at: st.first, project: st.app }));
  return { activity, report: { id: "mac", ok: true, items: stints.length, summary: stints.length ? `${stints.length} windows you spent time in` : "Nothing noted yet" } };
}

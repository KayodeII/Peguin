// What the owner's plan includes, from the signed licence (offline), and the
// weekly standup count Free is limited by. Signed out counts as Free.
import { app } from "electron";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { isPlanId, PLANS, type Features, type PlanId } from "../../../src/core/plans.js";
import { localClock } from "./scheduler.js";
import type { Settings } from "./settings.js";

export async function currentPlan(): Promise<PlanId> {
  // Development only: try another plan's limits without changing the account.
  if (!app.isPackaged && isPlanId(process.env.PENGUIN_PLAN)) return process.env.PENGUIN_PLAN;
  const { offlineLicense, planOf } = await import("./account.js"); // lazily: keeps this module importable in tests
  return planOf(await offlineLicense());
}

export const currentFeatures = async (): Promise<Features> => PLANS[await currentPlan()].features;

/** Settings as the plan allows them: the owner's choices are kept, only what's used changes (pure). */
export function allowed(s: Settings, f: Features): Settings {
  return f.ownVoice || s.voice.mode === "standard" ? s : { ...s, voice: { ...s.voice, mode: "standard" } };
}

/** The Monday (YYYY-MM-DD) starting the week `at` falls in, in the owner's timezone (pure). */
export function weekOf(at: Date, timeZone: string): string {
  const { date } = localClock(at, timeZone);
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

/** How many standups were joined in the week of `now`, from the join times (pure). */
export const joinsThisWeek = (joins: number[], now: Date, timeZone: string) =>
  joins.filter((t) => weekOf(new Date(t), timeZone) === weekOf(now, timeZone)).length;

const joinsFile = () => path.join(app.getPath("userData"), "joins.json");

function loadJoins(): number[] {
  try { return (JSON.parse(readFileSync(joinsFile(), "utf8")) as unknown[]).filter((t): t is number => typeof t === "number"); }
  catch { return []; }
}

/** Throws a plain sentence when the plan's weekly standups are used up. */
export function checkWeeklyLimit(f: Features, timeZone: string, plan: PlanId, now = new Date()) {
  if (f.standupsPerWeek === null) return;
  const used = joinsThisWeek(loadJoins(), now, timeZone);
  if (used >= f.standupsPerWeek) {
    throw new Error(`That's your ${f.standupsPerWeek} standups for this week on the ${PLANS[plan].name} plan. It resets on Monday, or upgrade at peguin.co/account for every standup.`);
  }
}

export function recordJoin(now = Date.now()) {
  const keep = loadJoins().filter((t) => now - t < 14 * 86_400_000);
  writeFileSync(joinsFile(), JSON.stringify([...keep, now]));
}

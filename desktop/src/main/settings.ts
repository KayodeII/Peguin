import { app } from "electron";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";

const Time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use 24-hour time like 09:30");

/** The few things Penguin needs; everything else it works out. */
export const Settings = z.object({
  displayName: z.string().trim().max(40).default(""),
  aliases: z.array(z.string().trim().min(1).max(40)).max(10).default([]),
  timezone: z.string().default(Intl.DateTimeFormat().resolvedOptions().timeZone),
  /** The recurring standup Penguin attends for you. Calendar sync replaces this later. */
  standup: z.object({
    url: z.string().trim().default(""),
    time: Time.default("09:30"),
    days: z.array(z.number().int().min(0).max(6)).default([1, 2, 3, 4, 5]), // 0 = Sunday
    auto: z.boolean().default(false),
  }).default({ url: "", time: "09:30", days: [1, 2, 3, 4, 5], auto: false }),
  sources: z.object({
    git: z.boolean().default(true),
    github: z.boolean().default(true),
    claude_code: z.boolean().default(true),
  }).default({ git: true, github: true, claude_code: true }),
  voice: z.enum(["default"]).default("default"),
  runHidden: z.boolean().default(true),
  onboarded: z.boolean().default(false),
});
export type Settings = z.infer<typeof Settings>;

const file = () => path.join(app.getPath("userData"), "settings.json");

/** First run: take the name from git, which every developer has set. */
function defaults(): Settings {
  let name = "";
  try { name = execFileSync("git", ["config", "--global", "user.name"], { encoding: "utf8" }).trim(); } catch { /* none */ }
  return Settings.parse({ displayName: name.slice(0, 40) });
}

export function loadSettings(): Settings {
  try { return Settings.parse(JSON.parse(readFileSync(file(), "utf8"))); } catch { return defaults(); }
}

/** Validates, then writes atomically so a crash never leaves half a file. */
export function saveSettings(input: unknown): Settings {
  const s = Settings.parse(input);
  mkdirSync(path.dirname(file()), { recursive: true });
  writeFileSync(`${file()}.tmp`, JSON.stringify(s, null, 2));
  renameSync(`${file()}.tmp`, file());
  return s;
}

import { app } from "electron";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";

/** What the user sets in the preferences window. Stored in the OS app-data folder. */
export const Settings = z.object({
  displayName: z.string().trim().max(40).default(""),
  aliases: z.array(z.string().trim().min(1).max(40)).max(10).default([]),
  timezone: z.string().default(Intl.DateTimeFormat().resolvedOptions().timeZone),
  /** Spoken as the update until GitHub/Linear/Jira are connected. Never invented. */
  standingNotes: z.string().max(1000).default(""),
  voice: z.enum(["default"]).default("default"),
  /** Join in a hidden window. Off is useful to watch what Penguin does. */
  runHidden: z.boolean().default(true),
});
export type Settings = z.infer<typeof Settings>;

const file = () => path.join(app.getPath("userData"), "settings.json");

export function loadSettings(): Settings {
  try {
    return Settings.parse(JSON.parse(readFileSync(file(), "utf8")));
  } catch {
    return Settings.parse({});
  }
}

/** Validates, then writes atomically so a crash never leaves half a file. */
export function saveSettings(input: unknown): Settings {
  const s = Settings.parse(input);
  mkdirSync(path.dirname(file()), { recursive: true });
  const tmp = `${file()}.tmp`;
  writeFileSync(tmp, JSON.stringify(s, null, 2));
  renameSync(tmp, file());
  return s;
}

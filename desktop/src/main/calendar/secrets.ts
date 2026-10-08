// Calendar links and the Calendly token give read access to someone's
// calendar, so they're kept encrypted (Keychain), not in settings.json.
import { app } from "electron";
import { existsSync, rmSync } from "node:fs";
import path from "node:path";
import { readSealed, writeSealed } from "../sealed.js";

export type CalendarSecrets = { links: string[]; calendlyToken: string | null };

const file = () => path.join(app.getPath("userData"), "calendar.bin");

export function loadCalendarSecrets(): CalendarSecrets {
  if (!existsSync(file())) return { links: [], calendlyToken: null };
  try {
    const s = JSON.parse(readSealed(file()).toString("utf8")) as Partial<CalendarSecrets>;
    return { links: (s.links ?? []).filter((l) => typeof l === "string"), calendlyToken: s.calendlyToken ?? null };
  } catch { return { links: [], calendlyToken: null }; }
}

export function saveCalendarSecrets(s: CalendarSecrets) {
  const links = [...new Set(s.links.map((l) => l.trim()).filter((l) => /^(https?|webcal):\/\//i.test(l)))].slice(0, 10);
  const calendlyToken = s.calendlyToken?.trim() || null;
  if (!links.length && !calendlyToken) { rmSync(file(), { force: true }); return; }
  writeSealed(file(), JSON.stringify({ links, calendlyToken }));
}

/** For the UI: enough to recognise each link, never the secret part. */
export const maskLink = (link: string) => {
  try { const u = new URL(link.replace(/^webcal:/i, "https:")); return `${u.hostname}/…${u.pathname.slice(-6)}`; } catch { return "calendar link"; }
};

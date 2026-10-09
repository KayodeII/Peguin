// Calendar access is kept encrypted (Keychain), not in settings.json: connected
// accounts (OAuth tokens), calendar links, and a Calendly personal access token
// from before one-click connections.
import { app } from "electron";
import { existsSync, rmSync } from "node:fs";
import path from "node:path";
import { readSealed, writeSealed } from "../sealed.js";
import type { OAuthProvider } from "./types.js";

export type ConnectedAccount = {
  /** provider:account, so reconnecting the same account replaces it. */
  id: string;
  provider: OAuthProvider;
  /** The account's email, for the UI. */
  account: string;
  accessToken: string;
  refreshToken: string;
  /** Seconds since the epoch. */
  expiresAt: number;
};

export type CalendarSecrets = { accounts: ConnectedAccount[]; links: string[]; calendlyToken: string | null };

const EMPTY: CalendarSecrets = { accounts: [], links: [], calendlyToken: null };
const file = () => path.join(app.getPath("userData"), "calendar.bin");

const isAccount = (a: unknown): a is ConnectedAccount => {
  const x = a as ConnectedAccount;
  return !!x && typeof x.id === "string" && typeof x.provider === "string" && typeof x.accessToken === "string" && typeof x.refreshToken === "string";
};

export function loadCalendarSecrets(): CalendarSecrets {
  if (!existsSync(file())) return { ...EMPTY };
  try {
    const s = JSON.parse(readSealed(file()).toString("utf8")) as Partial<CalendarSecrets>;
    return {
      accounts: (s.accounts ?? []).filter(isAccount),
      links: (s.links ?? []).filter((l) => typeof l === "string"),
      calendlyToken: s.calendlyToken ?? null,
    };
  } catch { return { ...EMPTY }; }
}

export function saveCalendarSecrets(s: CalendarSecrets) {
  const links = [...new Set(s.links.map((l) => l.trim()).filter((l) => /^(https?|webcal):\/\//i.test(l)))].slice(0, 10);
  const calendlyToken = s.calendlyToken?.trim() || null;
  const accounts = [...new Map(s.accounts.map((a) => [a.id, a])).values()].slice(0, 10);
  if (!links.length && !calendlyToken && !accounts.length) { rmSync(file(), { force: true }); return; }
  writeSealed(file(), JSON.stringify({ accounts, links, calendlyToken }));
}

/** Adds or replaces one connected account. */
export function upsertAccount(a: Omit<ConnectedAccount, "id">) {
  const s = loadCalendarSecrets();
  const id = `${a.provider}:${a.account.toLowerCase()}`;
  saveCalendarSecrets({ ...s, accounts: [...s.accounts.filter((x) => x.id !== id), { ...a, id }] });
}

/** For the UI: enough to recognise each link, never the secret part. */
export const maskLink = (link: string) => {
  try { const u = new URL(link.replace(/^webcal:/i, "https:")); return `${u.hostname}/…${u.pathname.slice(-6)}`; } catch { return "calendar link"; }
};

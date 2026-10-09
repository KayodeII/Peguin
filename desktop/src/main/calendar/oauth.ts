// Access tokens for connected calendar accounts: used until a minute before
// they expire, then refreshed through the Peguin server (which holds the OAuth
// client secret). Rotated refresh tokens are saved straight back.
import { loadCalendarSecrets, saveCalendarSecrets, type ConnectedAccount } from "./secrets.js";

const inflight = new Map<string, Promise<string>>();

async function refresh(a: ConnectedAccount): Promise<string> {
  // Loaded when needed, so the calendar readers don't pull the account module (and Electron's app) in at import.
  const { refreshCalendarToken } = await import("../account.js");
  const t = await refreshCalendarToken(a.provider, a.refreshToken);
  const s = loadCalendarSecrets();
  saveCalendarSecrets({
    ...s,
    accounts: s.accounts.map((x) => (x.id === a.id ? { ...x, accessToken: t.accessToken, expiresAt: t.expiresAt, refreshToken: t.refreshToken ?? x.refreshToken } : x)),
  });
  return t.accessToken;
}

/** A working access token for the account. One refresh at a time per account, since some providers rotate refresh tokens. */
export async function accessToken(accountId: string, now = Date.now() / 1000): Promise<string> {
  const a = loadCalendarSecrets().accounts.find((x) => x.id === accountId);
  if (!a) throw new Error("That calendar was disconnected.");
  if (a.expiresAt - 60 > now) return a.accessToken;
  let p = inflight.get(a.id);
  if (!p) {
    p = refresh(a).finally(() => inflight.delete(a.id));
    inflight.set(a.id, p);
  }
  return p;
}

/** GET with the account's token; one retry with a fresh token if the provider says it's expired early. */
export async function authedGet<T>(accountId: string, name: string, url: string, headers: Record<string, string> = {}, fetcher: typeof fetch = fetch): Promise<T> {
  const get = async (token: string) => fetcher(url, { headers: { authorization: `Bearer ${token}`, ...headers }, signal: AbortSignal.timeout(20000) }).catch(() => null);
  let res = await get(await accessToken(accountId));
  if (res?.status === 401) res = await get(await accessToken(accountId, Infinity));
  if (res?.status === 401 || res?.status === 403) throw new Error(`${name} stopped allowing access. Connect it again.`);
  if (!res?.ok) throw new Error(`Couldn't reach ${name}${res ? ` (${res.status})` : ""}. Try again in a minute.`);
  return res.json() as Promise<T>;
}

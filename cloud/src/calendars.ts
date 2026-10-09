// One-click calendar connections for the desktop app. The Worker holds the
// OAuth client secrets, so it runs the consent flow and refreshes access
// tokens, but it keeps no calendar tokens: they're handed to the app (which
// stores them in the Keychain) and every refresh is a pass-through.
//
//   app opens  /calendar/connect?provider=google&challenge=<S256>&state=<random>
//   provider   -> consent -> /calendar/callback (code exchanged here)
//   browser    -> peguin://calendar?code=<one-time>&state=<random>
//   app posts  /api/calendar/token { code, verifier } -> tokens
//   later      /api/calendar/refresh { provider, refreshToken } -> fresh access token
import type { User } from "./auth.js";
import { b64url, b64urlDecode, randomToken, sha256 } from "./crypto.js";
import { HttpError, need, type Env } from "./env.js";
import { body, cookie, json, now, readCookie, redirect } from "./http.js";

export const PROVIDERS = ["google", "microsoft", "calendly"] as const;
export type Provider = (typeof PROVIDERS)[number];
export const isProvider = (v: unknown): v is Provider => typeof v === "string" && (PROVIDERS as readonly string[]).includes(v);

type Config = {
  name: string;
  authUrl: string;
  tokenUrl: string;
  /** Null: the provider has no scopes (Calendly grants the user's own data). */
  scope: string | null;
  clientId: keyof Env;
  clientSecret: keyof Env;
  authParams?: Record<string, string>;
};

export const CONFIG: Record<Provider, Config> = {
  google: {
    name: "Google Calendar",
    authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    scope: "openid email https://www.googleapis.com/auth/calendar.events.readonly",
    // The sign-in client, with the calendar callback added to its redirect URIs.
    clientId: "GOOGLE_CLIENT_ID",
    clientSecret: "GOOGLE_CLIENT_SECRET",
    // offline + consent: a refresh token every time, so reconnecting always works.
    authParams: { access_type: "offline", prompt: "consent", include_granted_scopes: "true" },
  },
  microsoft: {
    name: "Outlook calendar",
    authUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    tokenUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    scope: "openid email offline_access Calendars.Read",
    clientId: "MICROSOFT_CLIENT_ID",
    clientSecret: "MICROSOFT_CLIENT_SECRET",
    authParams: { prompt: "select_account" },
  },
  calendly: {
    name: "Calendly",
    authUrl: "https://auth.calendly.com/oauth/authorize",
    tokenUrl: "https://auth.calendly.com/oauth/token",
    scope: null,
    clientId: "CALENDLY_CLIENT_ID",
    clientSecret: "CALENDLY_CLIENT_SECRET",
  },
};

const COOKIE = "pg_cal";
const CODE_MINUTES = 5;
const callbackUrl = (env: Env) => `${env.APP_ORIGIN}/calendar/callback`;
const done = (to: string) => redirect(`/connected?what=calendar&to=${encodeURIComponent(to)}`);
const failed = (reason: string) => redirect(`/connected?what=calendar&error=${encodeURIComponent(reason)}`);

/** Which providers this server can connect (their OAuth clients are configured). */
export function availableProviders(env: Env): Provider[] {
  return PROVIDERS.filter((p) => env[CONFIG[p].clientId] && env[CONFIG[p].clientSecret]);
}

export async function connectStart(env: Env, url: URL): Promise<Response> {
  const provider = url.searchParams.get("provider");
  const challenge = url.searchParams.get("challenge") ?? "";
  const state = url.searchParams.get("state") ?? "";
  if (!isProvider(provider)) throw new HttpError(400, "Unknown calendar. Start again from the Peguin app.");
  if (!/^[A-Za-z0-9_-]{43}$/.test(challenge) || !/^[A-Za-z0-9_-]{16,128}$/.test(state)) {
    throw new HttpError(400, "This connect link is incomplete. Start again from the Peguin app.");
  }
  const c = CONFIG[provider];
  const oauthState = randomToken();
  const params = new URLSearchParams({
    client_id: need(env, c.clientId), response_type: "code", redirect_uri: callbackUrl(env), state: oauthState,
    ...(c.scope ? { scope: c.scope } : {}), ...c.authParams,
  });
  return redirect(`${c.authUrl}?${params}`, {
    "set-cookie": cookie(COOKIE, [oauthState, provider, challenge, state].join("|"), 600, env.APP_ORIGIN.startsWith("https://")),
  });
}

export type Tokens = { accessToken: string; refreshToken: string | null; expiresAt: number };
type TokenResponse = { access_token?: string; refresh_token?: string; expires_in?: number; id_token?: string; error?: string; error_description?: string };

async function tokenRequest(env: Env, provider: Provider, params: Record<string, string>): Promise<TokenResponse> {
  const c = CONFIG[provider];
  const res = await fetch(c.tokenUrl, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: new URLSearchParams({ client_id: need(env, c.clientId), client_secret: need(env, c.clientSecret), ...params }),
  });
  const data = (await res.json().catch(() => ({}))) as TokenResponse;
  if (!res.ok || !data.access_token) {
    // invalid_grant: the user revoked access, or the refresh token expired.
    if (data.error === "invalid_grant") throw new HttpError(401, `${c.name} access was removed or expired. Connect it again.`);
    throw new HttpError(502, `${c.name} didn't accept the request${data.error ? ` (${data.error})` : ""}. Try again.`);
  }
  return data;
}

const toTokens = (t: TokenResponse): Tokens => ({
  accessToken: t.access_token!, refreshToken: t.refresh_token ?? null, expiresAt: now() + (t.expires_in ?? 3600),
});

/** The id token's email claim. Received straight from the provider over TLS, so the signature needn't be re-checked. */
export function emailFromIdToken(idToken: string | undefined): string | null {
  try {
    const claims = JSON.parse(new TextDecoder().decode(b64urlDecode(idToken!.split(".")[1]!))) as { email?: string; preferred_username?: string };
    return claims.email ?? claims.preferred_username ?? null;
  } catch { return null; }
}

async function accountLabel(provider: Provider, t: TokenResponse): Promise<string> {
  if (provider !== "calendly") return emailFromIdToken(t.id_token) ?? CONFIG[provider].name;
  const res = await fetch("https://api.calendly.com/users/me", { headers: { authorization: `Bearer ${t.access_token}` } }).catch(() => null);
  const me = res?.ok ? ((await res.json()) as { resource?: { email?: string } }) : null;
  return me?.resource?.email ?? "Calendly";
}

/* The hand-off payload is encrypted with a key derived from the one-time code, which only the app gets. */
async function keyFor(code: string) {
  const raw = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`peguin-calendar|${code}`));
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function seal(code: string, payload: object): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await keyFor(code), new TextEncoder().encode(JSON.stringify(payload)));
  return `${b64url(iv)}.${b64url(ct)}`;
}

export async function unseal<T>(code: string, sealed: string): Promise<T> {
  const [iv, ct] = sealed.split(".");
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: b64urlDecode(iv!) }, await keyFor(code), b64urlDecode(ct!));
  return JSON.parse(new TextDecoder().decode(pt)) as T;
}

export async function connectCallback(env: Env, req: Request, url: URL): Promise<Response> {
  const [oauthState, provider, challenge, appState] = (readCookie(req, COOKIE) ?? "").split("|");
  if (!oauthState || oauthState !== url.searchParams.get("state") || !isProvider(provider) || !challenge || !appState) return failed("expired");
  if (url.searchParams.get("error")) return failed(url.searchParams.get("error") === "access_denied" ? "denied" : "provider");
  let t: TokenResponse;
  try { t = await tokenRequest(env, provider, { grant_type: "authorization_code", code: url.searchParams.get("code") ?? "", redirect_uri: callbackUrl(env) }); }
  catch (e) { console.error("calendar token exchange", provider, e); return failed("provider"); }
  if (!t.refresh_token) return failed("offline"); // without one the app would lose access within the hour

  const code = randomToken();
  const payload = { provider, account: await accountLabel(provider, t), ...toTokens(t) };
  await env.DB.batch([
    env.DB.prepare("DELETE FROM calendar_codes WHERE expires_at < ?").bind(now()),
    env.DB.prepare("INSERT INTO calendar_codes (code_hash, challenge, sealed, expires_at) VALUES (?, ?, ?, ?)")
      .bind(await sha256(code), challenge, await seal(code, payload), now() + CODE_MINUTES * 60),
  ]);
  const res = done(`peguin://calendar?code=${code}&state=${appState}`);
  res.headers.append("set-cookie", cookie(COOKIE, "", 0, env.APP_ORIGIN.startsWith("https://")));
  return res;
}

export type Connection = Tokens & { provider: Provider; account: string };

/** The app collects the connection once, proving it started the flow with the PKCE verifier. */
export async function connectToken(env: Env, req: Request, _user: User): Promise<Response> {
  const { code, verifier } = await body<{ code?: string; verifier?: string }>(req);
  if (!code || !verifier) throw new HttpError(400, "Missing code or verifier.");
  const challenge = b64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
  const row = await env.DB.prepare("DELETE FROM calendar_codes WHERE code_hash = ? AND challenge = ? AND expires_at > ? RETURNING sealed")
    .bind(await sha256(code), challenge, now()).first<{ sealed: string }>();
  if (!row) throw new HttpError(400, "This calendar connection expired or was already used. Connect it again from the app.");
  return json(await unseal<Connection>(code, row.sealed));
}

/** A fresh access token. Some providers also rotate the refresh token; the app keeps whichever comes back. */
export async function refreshToken(env: Env, req: Request, _user: User): Promise<Response> {
  const { provider, refreshToken: rt } = await body<{ provider?: string; refreshToken?: string }>(req);
  if (!isProvider(provider) || !rt) throw new HttpError(400, "Send provider and refreshToken.");
  const scope = CONFIG[provider].scope;
  const t = await tokenRequest(env, provider, { grant_type: "refresh_token", refresh_token: rt, ...(provider === "microsoft" && scope ? { scope } : {}) });
  return json(toTokens(t));
}

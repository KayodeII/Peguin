import { b64url, randomToken, sha256 } from "./crypto.js";
import { HttpError, need, type Env } from "./env.js";
import { body, cookie, json, now, readCookie, redirect, safeNext } from "./http.js";

export type User = { id: string; email: string; name: string | null; stripe_customer_id: string | null };

const SESSION_COOKIE = "pg_session";
const SESSION_DAYS = 30;
const LINK_MINUTES = 15;
const CODE_MINUTES = 5;
const secure = (env: Env) => env.APP_ORIGIN.startsWith("https://");

async function findOrCreateUser(env: Env, email: string, extra: { name?: string; googleSub?: string } = {}): Promise<User> {
  const e = email.trim().toLowerCase();
  const id = crypto.randomUUID();
  await env.DB.prepare(
    `INSERT INTO users (id, email, name, google_sub, created_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(email) DO UPDATE SET name = COALESCE(users.name, excluded.name), google_sub = COALESCE(users.google_sub, excluded.google_sub)`,
  ).bind(id, e, extra.name ?? null, extra.googleSub ?? null, now()).run();
  return (await env.DB.prepare("SELECT id, email, name, stripe_customer_id FROM users WHERE email = ?").bind(e).first<User>())!;
}

async function startSession(env: Env, userId: string, next: string): Promise<Response> {
  const token = randomToken();
  await env.DB.prepare("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)")
    .bind(await sha256(token), userId, now() + SESSION_DAYS * 86400).run();
  return redirect(next, { "set-cookie": cookie(SESSION_COOKIE, token, SESSION_DAYS * 86400, secure(env)) });
}

/** The signed-in browser user, or null. */
export async function sessionUser(env: Env, req: Request): Promise<User | null> {
  const token = readCookie(req, SESSION_COOKIE);
  if (!token) return null;
  return env.DB.prepare(
    `SELECT u.id, u.email, u.name, u.stripe_customer_id FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ? AND s.expires_at > ?`,
  ).bind(await sha256(token), now()).first<User>();
}

/** The user behind a desktop app's bearer token, or null. */
export async function appUser(env: Env, req: Request): Promise<User | null> {
  const token = req.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1];
  if (!token) return null;
  const hash = await sha256(token);
  const user = await env.DB.prepare(
    `SELECT u.id, u.email, u.name, u.stripe_customer_id FROM app_tokens t JOIN users u ON u.id = t.user_id
     WHERE t.token_hash = ? AND t.revoked_at IS NULL`,
  ).bind(hash).first<User>();
  if (user) await env.DB.prepare("UPDATE app_tokens SET last_used_at = ? WHERE token_hash = ?").bind(now(), hash).run();
  return user;
}

export async function requireUser(env: Env, req: Request): Promise<User> {
  const user = (await appUser(env, req)) ?? (await sessionUser(env, req));
  if (!user) throw new HttpError(401, "Sign in first.");
  return user;
}

/* ------------------------------------------------------------ email link */

async function sendEmail(env: Env, to: string, subject: string, text: string): Promise<boolean> {
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) return false;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ from: env.EMAIL_FROM, to, subject, text }),
  });
  if (!res.ok) throw new HttpError(502, "Couldn't send the sign-in email. Try again in a minute.");
  return true;
}

export async function emailStart(env: Env, req: Request): Promise<Response> {
  const { email, next } = await body<{ email?: string; next?: string }>(req);
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, "Enter a valid email address.");
  const token = randomToken();
  await env.DB.prepare("INSERT INTO magic_links (token_hash, email, next, expires_at) VALUES (?, ?, ?, ?)")
    .bind(await sha256(token), email.trim().toLowerCase(), safeNext(next), now() + LINK_MINUTES * 60).run();
  const link = `${env.APP_ORIGIN}/auth/email/verify?token=${token}`;
  const sent = await sendEmail(env, email, "Sign in to Peguin",
    `Sign in to Peguin:\n\n${link}\n\nThe link works once and expires in ${LINK_MINUTES} minutes. If you didn't ask for it, ignore this email.`);
  if (!sent) console.log(`[dev] sign-in link for ${email}: ${link}`);
  return json({ ok: true, ...(sent ? {} : { devLink: env.APP_ORIGIN.startsWith("http://localhost") ? link : undefined }) });
}

export async function emailVerify(env: Env, url: URL): Promise<Response> {
  const token = url.searchParams.get("token") ?? "";
  const row = await env.DB.prepare(
    "UPDATE magic_links SET used_at = ? WHERE token_hash = ? AND used_at IS NULL AND expires_at > ? RETURNING email, next",
  ).bind(now(), await sha256(token), now()).first<{ email: string; next: string }>();
  if (!row) return redirect("/signin?error=link");
  const user = await findOrCreateUser(env, row.email);
  return startSession(env, user.id, safeNext(row.next));
}

/* ------------------------------------------------------------ Google */

export async function googleStart(env: Env, url: URL): Promise<Response> {
  const clientId = need(env, "GOOGLE_CLIENT_ID");
  const state = randomToken();
  const params = new URLSearchParams({
    client_id: clientId, response_type: "code", scope: "openid email profile",
    redirect_uri: `${env.APP_ORIGIN}/auth/google/callback`, state, prompt: "select_account",
  });
  const next = safeNext(url.searchParams.get("next"));
  return redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`, {
    "set-cookie": cookie("pg_oauth", `${state}|${encodeURIComponent(next)}`, 600, secure(env)),
  });
}

export async function googleCallback(env: Env, req: Request, url: URL): Promise<Response> {
  const [state, nextEnc] = (readCookie(req, "pg_oauth") ?? "").split("|");
  if (!state || state !== url.searchParams.get("state")) return redirect("/signin?error=google");
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code: url.searchParams.get("code") ?? "", client_id: need(env, "GOOGLE_CLIENT_ID"),
      client_secret: need(env, "GOOGLE_CLIENT_SECRET"), redirect_uri: `${env.APP_ORIGIN}/auth/google/callback`,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) return redirect("/signin?error=google");
  const { id_token } = (await res.json()) as { id_token?: string };
  // Received directly from Google over TLS, so the payload can be trusted without re-verifying the signature.
  const claims = JSON.parse(atob((id_token ?? "").split(".")[1]!.replace(/-/g, "+").replace(/_/g, "/"))) as
    { sub: string; email: string; email_verified: boolean; name?: string; aud: string };
  if (!claims.email_verified || claims.aud !== env.GOOGLE_CLIENT_ID) return redirect("/signin?error=google");
  const user = await findOrCreateUser(env, claims.email, { name: claims.name, googleSub: claims.sub });
  return startSession(env, user.id, safeNext(decodeURIComponent(nextEnc ?? "")));
}

export async function signOut(env: Env, req: Request): Promise<Response> {
  const token = readCookie(req, SESSION_COOKIE);
  if (token) await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await sha256(token)).run();
  return redirect("/", { "set-cookie": cookie(SESSION_COOKIE, "", 0, secure(env)) });
}

/* ------------------------------------------------------------ desktop app sign-in */

/**
 * The app opens /app/connect?challenge=<S256 of a verifier>&state=<random> in the browser.
 * Once signed in, the browser is sent to peguin://auth with a one-time code, which the
 * app swaps (with its verifier) for an app token. A code caught by another app is useless
 * without the verifier.
 */
export async function appConnect(env: Env, req: Request, url: URL): Promise<Response> {
  const challenge = url.searchParams.get("challenge") ?? "";
  const state = url.searchParams.get("state") ?? "";
  if (!/^[A-Za-z0-9_-]{43}$/.test(challenge) || !/^[A-Za-z0-9_-]{16,128}$/.test(state)) throw new HttpError(400, "This sign-in link is incomplete. Start again from the Peguin app.");
  const user = await sessionUser(env, req);
  if (!user) return redirect(`/signin?next=${encodeURIComponent(url.pathname + url.search)}`);
  const code = randomToken();
  await env.DB.prepare("INSERT INTO app_codes (code_hash, user_id, challenge, expires_at) VALUES (?, ?, ?, ?)")
    .bind(await sha256(code), user.id, challenge, now() + CODE_MINUTES * 60).run();
  return redirect(`/connected?to=${encodeURIComponent(`peguin://auth?code=${code}&state=${state}`)}`);
}

export async function appToken(env: Env, req: Request): Promise<Response> {
  const { code, verifier, label } = await body<{ code?: string; verifier?: string; label?: string }>(req);
  if (!code || !verifier) throw new HttpError(400, "Missing code or verifier.");
  const challenge = b64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
  const row = await env.DB.prepare(
    "UPDATE app_codes SET used_at = ? WHERE code_hash = ? AND used_at IS NULL AND expires_at > ? AND challenge = ? RETURNING user_id",
  ).bind(now(), await sha256(code), now(), challenge).first<{ user_id: string }>();
  if (!row) throw new HttpError(400, "This sign-in code expired or was already used. Sign in again from the app.");
  const token = randomToken();
  await env.DB.prepare("INSERT INTO app_tokens (token_hash, user_id, label, created_at) VALUES (?, ?, ?, ?)")
    .bind(await sha256(token), row.user_id, (label ?? "Peguin desktop").slice(0, 60), now()).run();
  return json({ token });
}

export async function appSignOut(env: Env, req: Request): Promise<Response> {
  const token = req.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1];
  if (token) await env.DB.prepare("UPDATE app_tokens SET revoked_at = ? WHERE token_hash = ?").bind(now(), await sha256(token)).run();
  return json({ ok: true });
}

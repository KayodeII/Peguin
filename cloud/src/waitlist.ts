// The waitlist. With SIGNUPS = "waitlist" new accounts need an invite; people
// who already have one sign in as usual. Flipping SIGNUPS back to "open" lets
// anyone in again, with no code change.
import { isPlanId, PLANS, TRIAL_PLAN } from "../../src/core/plans.js";
import { timingSafeEqual } from "./crypto.js";
import { inviteEmail, sendEmail, waitlistEmail } from "./email.js";
import { HttpError, need, type Env } from "./env.js";
import { body, json, now } from "./http.js";
import { limit } from "./support.js";

const JOINS_PER_DAY = 10; // per IP
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const waitlistMode = (env: Env) => env.SIGNUPS === "waitlist";

/** Whether this email may get a new account: sign-ups are open, or it was invited. Existing accounts never ask. */
export async function mayCreateAccount(env: Env, email: string): Promise<boolean> {
  if (!waitlistMode(env)) return true;
  const row = await env.DB.prepare("SELECT invited_at FROM waitlist WHERE email = ?").bind(email.trim().toLowerCase()).first<{ invited_at: number | null }>();
  return !!row?.invited_at;
}

export async function userExists(env: Env, email: string): Promise<boolean> {
  return !!(await env.DB.prepare("SELECT 1 FROM users WHERE email = ?").bind(email.trim().toLowerCase()).first());
}

/** Always answers the same way, so the form can't be used to find out who's signed up. */
export async function joinWaitlist(env: Env, req: Request): Promise<Response> {
  const b = await body<{ email?: string; plan?: string; source?: string }>(req);
  const email = (b.email ?? "").trim().toLowerCase();
  if (!EMAIL_RE.test(email) || email.length > 254) throw new HttpError(400, "Enter a valid email address.");
  await limit(env, req, "waitlist", JOINS_PER_DAY);
  const added = await env.DB.prepare(
    "INSERT INTO waitlist (email, plan, source, created_at) VALUES (?, ?, ?, ?) ON CONFLICT(email) DO NOTHING RETURNING email",
  ).bind(email, isPlanId(b.plan) ? b.plan : null, (b.source ?? "").slice(0, 60) || null, now()).first();
  if (added) {
    try { await sendEmail(env, { to: email, ...waitlistEmail(env.APP_ORIGIN) }); }
    catch (e) { console.error("waitlist email failed", e); }
  }
  return json({ ok: true });
}

function requireAdmin(env: Env, req: Request) {
  const token = req.headers.get("authorization")?.match(/^Bearer (.+)$/)?.[1] ?? "";
  if (!timingSafeEqual(token, need(env, "ADMIN_TOKEN"))) throw new HttpError(401, "Wrong admin token.");
}

export async function listWaitlist(env: Env, req: Request): Promise<Response> {
  requireAdmin(env, req);
  const { results } = await env.DB.prepare("SELECT email, plan, source, created_at, invited_at FROM waitlist ORDER BY created_at LIMIT 1000").all();
  return json({ waitlist: results });
}

/** Invites the named emails, or the next `count` people in the order they joined, and emails each one. */
export async function invite(env: Env, req: Request): Promise<Response> {
  requireAdmin(env, req);
  const b = await body<{ emails?: string[]; count?: number }>(req);
  let emails = (b.emails ?? []).map((e) => String(e).trim().toLowerCase()).filter((e) => EMAIL_RE.test(e));
  if (!emails.length && b.count) {
    const { results } = await env.DB.prepare("SELECT email FROM waitlist WHERE invited_at IS NULL ORDER BY created_at LIMIT ?")
      .bind(Math.min(Math.max(1, Math.floor(b.count)), 200)).all<{ email: string }>();
    emails = results.map((r) => r.email);
  }
  if (!emails.length) throw new HttpError(400, "Send emails: [...] or count: N.");
  const trial = PLANS[TRIAL_PLAN].name;
  const sent: string[] = [], failed: string[] = [];
  for (const email of emails) {
    await env.DB.prepare(
      "INSERT INTO waitlist (email, source, created_at, invited_at) VALUES (?, 'invite', ?, ?) ON CONFLICT(email) DO UPDATE SET invited_at = COALESCE(waitlist.invited_at, excluded.invited_at)",
    ).bind(email, now(), now()).run();
    try { (await sendEmail(env, { to: email, ...inviteEmail(env.APP_ORIGIN, Number(env.TRIAL_DAYS), trial) })) ? sent.push(email) : failed.push(email); }
    catch { failed.push(email); }
  }
  return json({ invited: emails.length, emailed: sent, notEmailed: failed });
}

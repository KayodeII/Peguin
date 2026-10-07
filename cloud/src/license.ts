import type { User } from "./auth.js";
import { isEntitled, subscriptionOf } from "./billing.js";
import { signEd25519 } from "./crypto.js";
import { HttpError, need, type Env } from "./env.js";
import { json, now } from "./http.js";

const MAX_DAYS = 30;     // the app refreshes well before this
const OFFLINE_DAYS = 3;  // works this long past period end without reaching the server

export type License = { sub: string; email: string; status: string; iat: number; exp: number };

/** When the user's access ends, as far as we know now: trial end or paid period end, whichever is later. */
function accessEnds(trialEndsAt: number | null, sub: { status: string; current_period_end: number | null } | null): number | null {
  const paid = sub && sub.status !== "canceled" ? sub.current_period_end : null;
  return Math.max(trialEndsAt ?? 0, paid ?? 0) || null;
}

/** A signed licence the desktop app can check offline with the public key. */
export async function issueLicense(env: Env, user: User): Promise<Response> {
  const sub = await subscriptionOf(env, user.id);
  if (!isEntitled(sub, user.trial_ends_at)) throw new HttpError(402, "Your trial has ended and there's no active plan. Subscribe at /account.");
  const iat = now();
  const ends = accessEnds(user.trial_ends_at, sub);
  const end = ends ? ends + OFFLINE_DAYS * 86400 : iat + MAX_DAYS * 86400;
  const status = sub && sub.status !== "canceled" ? sub.status : "trialing";
  const payload: License = { sub: user.id, email: user.email, status, iat, exp: Math.min(end, iat + MAX_DAYS * 86400) };
  const token = await signEd25519(payload, JSON.parse(need(env, "LICENSE_PRIVATE_JWK")) as JsonWebKey);
  return json({ license: token, ...payload });
}

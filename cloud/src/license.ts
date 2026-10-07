import type { User } from "./auth.js";
import { isEntitled, subscriptionOf } from "./billing.js";
import { signEd25519 } from "./crypto.js";
import { HttpError, need, type Env } from "./env.js";
import { json, now } from "./http.js";

const MAX_DAYS = 30;     // the app refreshes well before this
const OFFLINE_DAYS = 3;  // works this long past period end without reaching the server

export type License = { sub: string; email: string; status: string; iat: number; exp: number };

/** A signed licence the desktop app can check offline with the public key. */
export async function issueLicense(env: Env, user: User): Promise<Response> {
  const sub = await subscriptionOf(env, user.id);
  if (!isEntitled(sub)) throw new HttpError(402, "No active subscription. Start one at /pricing.");
  const iat = now();
  const end = sub!.current_period_end ? sub!.current_period_end + OFFLINE_DAYS * 86400 : iat + MAX_DAYS * 86400;
  const payload: License = { sub: user.id, email: user.email, status: sub!.status, iat, exp: Math.min(end, iat + MAX_DAYS * 86400) };
  const token = await signEd25519(payload, JSON.parse(need(env, "LICENSE_PRIVATE_JWK")) as JsonWebKey);
  return json({ license: token, ...payload });
}

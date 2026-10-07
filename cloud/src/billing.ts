// Stripe over its REST API (form-encoded), which needs no SDK on Workers.
import type { User } from "./auth.js";
import { hmacSha256Hex, timingSafeEqual } from "./crypto.js";
import { HttpError, need, type Env } from "./env.js";
import { json, now } from "./http.js";

const ACTIVE = new Set(["active", "trialing"]);
const GRACE_DAYS = 3; // past_due keeps working briefly while Stripe retries the card

export type Subscription = { status: string; current_period_end: number | null };

export async function subscriptionOf(env: Env, userId: string): Promise<Subscription | null> {
  return env.DB.prepare("SELECT status, current_period_end FROM subscriptions WHERE user_id = ?").bind(userId).first<Subscription>();
}

/** Paid up, trialing, or past due within the grace period. */
export function isEntitled(s: Subscription | null, at = now()): boolean {
  if (!s) return false;
  if (ACTIVE.has(s.status)) return true;
  return s.status === "past_due" && !!s.current_period_end && at < s.current_period_end + GRACE_DAYS * 86400;
}

async function stripe<T>(env: Env, path: string, params?: Record<string, string>): Promise<T> {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: params ? "POST" : "GET",
    headers: { authorization: `Bearer ${need(env, "STRIPE_SECRET_KEY")}`, "content-type": "application/x-www-form-urlencoded" },
    body: params ? new URLSearchParams(params) : undefined,
  });
  const data = (await res.json()) as T & { error?: { message: string } };
  if (!res.ok) throw new HttpError(502, `Stripe: ${data.error?.message ?? res.status}`);
  return data;
}

export async function checkout(env: Env, user: User): Promise<Response> {
  const session = await stripe<{ url: string }>(env, "checkout/sessions", {
    mode: "subscription",
    "line_items[0][price]": need(env, "STRIPE_PRICE_ID"),
    "line_items[0][quantity]": "1",
    client_reference_id: user.id,
    ...(user.stripe_customer_id ? { customer: user.stripe_customer_id } : { customer_email: user.email }),
    "subscription_data[trial_period_days]": env.TRIAL_DAYS,
    success_url: `${env.APP_ORIGIN}/account?checkout=done`,
    cancel_url: `${env.APP_ORIGIN}/pricing`,
    allow_promotion_codes: "true",
  });
  return json({ url: session.url });
}

export async function portal(env: Env, user: User): Promise<Response> {
  if (!user.stripe_customer_id) throw new HttpError(400, "There's no subscription to manage yet.");
  const session = await stripe<{ url: string }>(env, "billing_portal/sessions", {
    customer: user.stripe_customer_id, return_url: `${env.APP_ORIGIN}/account`,
  });
  return json({ url: session.url });
}

/** Stripe-Signature: t=<unix>,v1=<hex hmac of "t.payload">. Rejects stale or forged events. */
export async function verifyStripeSignature(payload: string, header: string, secret: string, at = now(), toleranceSeconds = 300): Promise<boolean> {
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=") as [string, string]));
  const t = Number(parts.t);
  const sigs = header.split(",").filter((p) => p.startsWith("v1=")).map((p) => p.slice(3));
  if (!t || !sigs.length || Math.abs(at - t) > toleranceSeconds) return false;
  const expected = await hmacSha256Hex(secret, `${t}.${payload}`);
  return sigs.some((s) => timingSafeEqual(s, expected));
}

type StripeEvent = { id: string; type: string; data: { object: Record<string, any> } };

export async function webhook(env: Env, req: Request): Promise<Response> {
  const payload = await req.text();
  const ok = await verifyStripeSignature(payload, req.headers.get("stripe-signature") ?? "", need(env, "STRIPE_WEBHOOK_SECRET"));
  if (!ok) return json({ error: "Invalid signature." }, 400);
  const event = JSON.parse(payload) as StripeEvent;
  const seen = await env.DB.prepare("SELECT 1 FROM stripe_events WHERE id = ?").bind(event.id).first();
  if (seen) return json({ ok: true, duplicate: true });

  const o = event.data.object;
  if (event.type === "checkout.session.completed" && o.client_reference_id && o.customer) {
    await env.DB.prepare("UPDATE users SET stripe_customer_id = ? WHERE id = ?").bind(o.customer, o.client_reference_id).run();
  }
  if (event.type.startsWith("customer.subscription.")) {
    const user = await env.DB.prepare("SELECT id FROM users WHERE stripe_customer_id = ?").bind(o.customer).first<{ id: string }>();
    // A subscription can arrive before checkout.session.completed links the customer; Stripe resends it.
    if (!user) return json({ error: "Unknown customer; retry." }, 409);
    // Events can arrive out of order, so read the subscription's current state rather than trusting the event.
    const live = await stripe<Record<string, any>>(env, `subscriptions/${encodeURIComponent(o.id)}`);
    const status = String(live.status);
    const periodEnd = Number(live.current_period_end ?? live.items?.data?.[0]?.current_period_end) || null;
    await env.DB.prepare(
      `INSERT INTO subscriptions (user_id, stripe_subscription_id, status, current_period_end, updated_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET stripe_subscription_id = excluded.stripe_subscription_id, status = excluded.status,
         current_period_end = excluded.current_period_end, updated_at = excluded.updated_at`,
    ).bind(user.id, o.id, status, periodEnd, now()).run();
  }
  // Recorded only once applied, so a retried event that failed earlier still gets processed.
  await env.DB.prepare("INSERT OR IGNORE INTO stripe_events (id, received_at) VALUES (?, ?)").bind(event.id, now()).run();
  return json({ ok: true });
}

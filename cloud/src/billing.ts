// Paystack subscriptions over its REST API. The 14-day trial is ours (Paystack
// plans have none): it starts at sign-up, and a paid plan takes over after.
import type { User } from "./auth.js";
import { hmacHex, sha256, timingSafeEqual } from "./crypto.js";
import { HttpError, need, type Env } from "./env.js";
import { json, now } from "./http.js";

const GRACE_DAYS = 3; // a failed renewal keeps working briefly while Paystack retries

/** Normalised: active | non_renewing | past_due | canceled. */
export type Subscription = { status: string; current_period_end: number | null };

export async function subscriptionOf(env: Env, userId: string): Promise<Subscription | null> {
  return env.DB.prepare("SELECT status, current_period_end FROM subscriptions WHERE user_id = ?").bind(userId).first<Subscription>();
}

/** Paid, cancelled but paid through the period, in grace after a failed renewal, or in the free trial. */
export function isEntitled(s: Subscription | null, trialEndsAt: number | null, at = now()): boolean {
  if (trialEndsAt && at < trialEndsAt) return true;
  if (!s) return false;
  if (s.status === "active") return true;
  const end = s.current_period_end ?? 0;
  if (s.status === "non_renewing") return at < end;
  if (s.status === "past_due") return at < end + GRACE_DAYS * 86400;
  return false;
}

/** Paystack's subscription status, in our words. */
export function normaliseStatus(paystack: string): string {
  return ({ active: "active", "non-renewing": "non_renewing", attention: "past_due" } as Record<string, string>)[paystack] ?? "canceled";
}

async function paystack<T>(env: Env, path: string, body?: object): Promise<T> {
  const res = await fetch(`https://api.paystack.co/${path}`, {
    method: body ? "POST" : "GET",
    headers: { authorization: `Bearer ${need(env, "PAYSTACK_SECRET_KEY")}`, "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = (await res.json().catch(() => ({}))) as { status?: boolean; message?: string; data?: T };
  if (!res.ok || !data.status) throw new HttpError(502, `Paystack: ${data.message ?? res.status}`);
  return data.data as T;
}

type Plan = { amount: number; currency: string; interval: string };
let planCache: { code: string; plan: Plan; at: number } | null = null;

/** The live plan's price, so the website always shows what Paystack charges. Cached per isolate for 10 minutes. */
export async function currentPlan(env: Env): Promise<Plan> {
  const code = need(env, "PAYSTACK_PLAN_CODE");
  if (planCache?.code === code && Date.now() - planCache.at < 600_000) return planCache.plan;
  const p = await paystack<Plan>(env, `plan/${encodeURIComponent(code)}`);
  planCache = { code, plan: { amount: p.amount, currency: p.currency, interval: p.interval }, at: Date.now() };
  return planCache.plan;
}

export async function checkout(env: Env, user: User): Promise<Response> {
  const planCode = need(env, "PAYSTACK_PLAN_CODE");
  const plan = await currentPlan(env);
  const tx = await paystack<{ authorization_url: string }>(env, "transaction/initialize", {
    email: user.email,
    amount: String(plan.amount), // the plan's price; Paystack bills the plan
    currency: plan.currency,
    plan: planCode,
    callback_url: `${env.APP_ORIGIN}/account?checkout=done`,
    metadata: { user_id: user.id },
  });
  return json({ url: tx.authorization_url });
}

export async function portal(env: Env, user: User): Promise<Response> {
  const row = await env.DB.prepare("SELECT paystack_subscription_code AS code FROM subscriptions WHERE user_id = ?").bind(user.id).first<{ code: string | null }>();
  if (!row?.code) throw new HttpError(400, "There's no subscription to manage yet.");
  const { link } = await paystack<{ link: string }>(env, `subscription/${encodeURIComponent(row.code)}/manage/link`);
  return json({ url: link });
}

/** x-paystack-signature is the hex HMAC-SHA512 of the raw body, keyed with the secret key. */
export async function verifyPaystackSignature(payload: string, signature: string, secret: string): Promise<boolean> {
  if (!signature) return false;
  return timingSafeEqual(signature.toLowerCase(), await hmacHex(secret, payload, "SHA-512"));
}

type PaystackSub = { subscription_code: string; status: string; next_payment_date: string | null; customer: { email: string; customer_code: string } };

/** Events can arrive late or out of order, so always read the subscription's current state. */
async function syncSubscription(env: Env, code: string): Promise<boolean> {
  const sub = await paystack<PaystackSub>(env, `subscription/${encodeURIComponent(code)}`);
  const user = await env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(sub.customer.email.toLowerCase()).first<{ id: string }>();
  if (!user) return false;
  const end = sub.next_payment_date ? Math.floor(Date.parse(sub.next_payment_date) / 1000) : null;
  await env.DB.batch([
    env.DB.prepare("UPDATE users SET paystack_customer_code = ? WHERE id = ?").bind(sub.customer.customer_code, user.id),
    env.DB.prepare(
      `INSERT INTO subscriptions (user_id, paystack_subscription_code, status, current_period_end, updated_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET paystack_subscription_code = excluded.paystack_subscription_code, status = excluded.status,
         current_period_end = excluded.current_period_end, updated_at = excluded.updated_at`,
    ).bind(user.id, sub.subscription_code, normaliseStatus(sub.status), end, now()),
  ]);
  return true;
}

export async function webhook(env: Env, req: Request): Promise<Response> {
  const payload = await req.text();
  const ok = await verifyPaystackSignature(payload, req.headers.get("x-paystack-signature") ?? "", need(env, "PAYSTACK_SECRET_KEY"));
  if (!ok) return json({ error: "Invalid signature." }, 400);
  const id = await sha256(payload);
  if (await env.DB.prepare("SELECT 1 FROM paystack_events WHERE id = ?").bind(id).first()) return json({ ok: true, duplicate: true });

  const event = JSON.parse(payload) as { event: string; data: Record<string, any> };
  const d = event.data;
  const code: string | undefined = d.subscription_code ?? d.subscription?.subscription_code;
  if (event.event === "charge.success" && d.metadata?.user_id && d.customer?.customer_code) {
    await env.DB.prepare("UPDATE users SET paystack_customer_code = ? WHERE id = ?").bind(d.customer.customer_code, d.metadata.user_id).run();
  }
  if (code && /^(subscription\.|invoice\.)/.test(event.event)) {
    // Unknown customer means the account doesn't exist (yet); a non-2xx makes Paystack retry.
    if (!(await syncSubscription(env, code))) return json({ error: "Unknown customer; retry." }, 409);
  }
  await env.DB.prepare("INSERT OR IGNORE INTO paystack_events (id, received_at) VALUES (?, ?)").bind(id, now()).run();
  return json({ ok: true });
}

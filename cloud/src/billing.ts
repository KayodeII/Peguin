// Paystack subscriptions over its REST API. Each paid plan (Basic, Pro, Team)
// is a Paystack plan. The trial is ours (Paystack plans have none): Pro from
// sign-up for TRIAL_DAYS, then Free unless a paid plan takes over.
import { isPaidPlan, PAID_PLANS, PLANS, TRIAL_PLAN, type PaidPlanId, type PlanId } from "../../src/core/plans.js";
import type { User } from "./auth.js";
import { hmacHex, sha256, timingSafeEqual } from "./crypto.js";
import { HttpError, need, type Env } from "./env.js";
import { body, json, now } from "./http.js";

const GRACE_DAYS = 3; // a failed renewal keeps working briefly while Paystack retries

/** Status normalised: active | non_renewing | past_due | canceled. Plan is null only for rows from before tiers. */
export type Subscription = { status: string; current_period_end: number | null; plan?: string | null };

export async function subscriptionOf(env: Env, userId: string): Promise<Subscription | null> {
  return env.DB.prepare("SELECT status, current_period_end, plan FROM subscriptions WHERE user_id = ?").bind(userId).first<Subscription>();
}

/** Paid, cancelled but paid through the period, in grace after a failed renewal, or in the free trial. */
export function isEntitled(s: Subscription | null, trialEndsAt: number | null, at = now()): boolean {
  return (!!trialEndsAt && at < trialEndsAt) || paidUp(s, at);
}

function paidUp(s: Subscription | null, at: number): boolean {
  if (!s) return false;
  if (s.status === "active") return true;
  const end = s.current_period_end ?? 0;
  if (s.status === "non_renewing") return at < end;
  if (s.status === "past_due") return at < end + GRACE_DAYS * 86400;
  return false;
}

export type Access = { plan: PlanId; status: "active" | "non_renewing" | "past_due" | "trialing" | "free" };

/** The plan the user has right now: a paid plan, else the trial, else Free. */
export function accessOf(s: Subscription | null, trialEndsAt: number | null, at = now()): Access {
  if (paidUp(s, at)) return { plan: isPaidPlan(s!.plan) ? s!.plan : "pro", status: s!.status as Access["status"] };
  if (trialEndsAt && at < trialEndsAt) return { plan: TRIAL_PLAN, status: "trialing" };
  return { plan: "free", status: "free" };
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

type PaystackPlan = { amount: number; currency: string; interval: string };
export type Price = PaystackPlan;

/** The Paystack plan code behind each paid plan that's on sale (pure). */
export function planCodes(env: Pick<Env, "PAYSTACK_PLANS" | "PAYSTACK_PLAN_CODE">): Partial<Record<PaidPlanId, string>> {
  let map: Record<string, unknown> = {};
  try { map = env.PAYSTACK_PLANS ? (JSON.parse(env.PAYSTACK_PLANS) as Record<string, unknown>) : {}; }
  catch { console.error("PAYSTACK_PLANS isn't valid JSON"); }
  const out: Partial<Record<PaidPlanId, string>> = {};
  for (const id of PAID_PLANS) if (typeof map[id] === "string" && map[id]) out[id] = map[id] as string;
  if (!out.pro && env.PAYSTACK_PLAN_CODE) out.pro = env.PAYSTACK_PLAN_CODE;
  return out;
}

/** Which of our plans a Paystack plan code is; unknown codes (an old plan) count as Pro. */
export function planForCode(env: Pick<Env, "PAYSTACK_PLANS" | "PAYSTACK_PLAN_CODE">, code: string | undefined): PaidPlanId {
  const hit = Object.entries(planCodes(env)).find(([, c]) => c === code);
  return (hit?.[0] as PaidPlanId | undefined) ?? "pro";
}

const priceCache = new Map<string, { price: Price; at: number }>();

/** A Paystack plan's live price, so the website always shows what Paystack charges. Cached per isolate for 10 minutes. */
async function priceOf(env: Env, code: string): Promise<Price> {
  const hit = priceCache.get(code);
  if (hit && Date.now() - hit.at < 600_000) return hit.price;
  const p = await paystack<PaystackPlan>(env, `plan/${encodeURIComponent(code)}`);
  const price = { amount: p.amount, currency: p.currency, interval: p.interval };
  priceCache.set(code, { price, at: Date.now() });
  return price;
}

export type PlanOffer = (typeof PLANS)[PlanId] & { price: Price | null; onSale: boolean };

/** Can be bought at checkout: has a Paystack plan, and isn't a seats plan (seats aren't built yet, so Team is waitlist-only). */
const purchasable = (id: PlanId, code: string | undefined) => !!code && !PLANS[id].features.seats;

/** Every plan with its live price; a paid plan without a Paystack plan isn't on sale yet. */
export async function plans(env: Env): Promise<PlanOffer[]> {
  const codes = env.PAYSTACK_SECRET_KEY ? planCodes(env) : {};
  return Promise.all(Object.values(PLANS).map(async (p): Promise<PlanOffer> => {
    if (p.id === "free") return { ...p, price: null, onSale: true };
    const code = codes[p.id as PaidPlanId];
    const price = code ? await priceOf(env, code).catch((e) => { console.error("plan price", p.id, e); return null; }) : null;
    return { ...p, price, onSale: !!price && purchasable(p.id, code) };
  }));
}

export async function checkout(env: Env, req: Request, user: User): Promise<Response> {
  const { plan } = await body<{ plan?: string }>(req);
  if (!isPaidPlan(plan)) throw new HttpError(400, "Pick Basic, Pro or Team.");
  const code = planCodes(env)[plan];
  if (!code || !purchasable(plan, code)) throw new HttpError(400, `${PLANS[plan].name} isn't on sale yet. Join the waitlist and we'll tell you when it is.`);
  if (paidUp(await subscriptionOf(env, user.id), now())) {
    throw new HttpError(409, "You already have a plan. To switch, cancel it under Manage billing and pick the new one once it ends.");
  }
  const price = await priceOf(env, code);
  const tx = await paystack<{ authorization_url: string }>(env, "transaction/initialize", {
    email: user.email,
    amount: String(price.amount), // the plan's price; Paystack bills the plan
    currency: price.currency,
    plan: code,
    callback_url: `${env.APP_ORIGIN}/account?checkout=done`,
    metadata: { user_id: user.id, plan },
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

type PaystackSub = {
  subscription_code: string; status: string; next_payment_date: string | null;
  customer: { email: string; customer_code: string }; plan?: { plan_code?: string };
};

/** Events can arrive late or out of order, so always read the subscription's current state. */
async function syncSubscription(env: Env, code: string): Promise<boolean> {
  const sub = await paystack<PaystackSub>(env, `subscription/${encodeURIComponent(code)}`);
  const user = await env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(sub.customer.email.toLowerCase()).first<{ id: string }>();
  if (!user) return false;
  const end = sub.next_payment_date ? Math.floor(Date.parse(sub.next_payment_date) / 1000) : null;
  await env.DB.batch([
    env.DB.prepare("UPDATE users SET paystack_customer_code = ? WHERE id = ?").bind(sub.customer.customer_code, user.id),
    env.DB.prepare(
      `INSERT INTO subscriptions (user_id, paystack_subscription_code, status, current_period_end, plan, updated_at) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET paystack_subscription_code = excluded.paystack_subscription_code, status = excluded.status,
         current_period_end = excluded.current_period_end, plan = excluded.plan, updated_at = excluded.updated_at`,
    ).bind(user.id, sub.subscription_code, normaliseStatus(sub.status), end, planForCode(env, sub.plan?.plan_code), now()),
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

import type { PlanId, PlanInfo } from "../../src/core/plans";

export type Me = {
  email: string;
  name: string | null;
  subscription: { status: string; current_period_end: number | null } | null;
  trial_ends_at: number | null;
  entitled: boolean;
  plan: PlanId;
  /** active | non_renewing | past_due | trialing | free */
  status: string;
  /** The desktop install this account last used, if it has ever signed in. */
  app: { version: string | null; last_seen: number | null } | null;
  release: { version: string; available: boolean };
};

/** JSON in, JSON out; throws the server's plain-sentence error. */
export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const res = await fetch(path, {
    method: init.method ?? (init.body === undefined ? "GET" : "POST"),
    headers: init.body === undefined ? undefined : { "content-type": "application/json" },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    credentials: "same-origin",
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw Object.assign(new Error(data.error ?? `Request failed (${res.status})`), { status: res.status });
  return data;
}

export type Price = { amount: number; currency: string; interval: string };
export type PlanOffer = PlanInfo & { price: Price | null; onSale: boolean };
export type Plans = { signups: "open" | "waitlist"; trialDays: number; trialPlan: PlanId; plans: PlanOffer[] };

/** "₦7,500/month" from the live Paystack plan. */
export function formatPrice(p: Price): string {
  const money = new Intl.NumberFormat("en", { style: "currency", currency: p.currency, currencyDisplay: "narrowSymbol", maximumFractionDigits: p.amount % 100 ? 2 : 0 }).format(p.amount / 100);
  return `${money}/${p.interval === "monthly" ? "month" : p.interval.replace(/ly$/, "")}`;
}

let plansRequest: Promise<Plans | null> | null = null;
export const getPlans = () => (plansRequest ??= api<Plans>("/api/plans").catch(() => null));

export const getMe = () => api<Me>("/api/me").catch((e: { status?: number }) => (e.status === 401 ? null : Promise.reject(e)));

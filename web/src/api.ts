export type Me = {
  email: string;
  name: string | null;
  subscription: { status: string; current_period_end: number | null } | null;
  trial_ends_at: number | null;
  entitled: boolean;
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

export type Plan = { amount: number; currency: string; interval: string; trialDays: number };

/** "₦7,500/month" from the live Paystack plan. */
export function formatPrice(p: Plan): string {
  const money = new Intl.NumberFormat("en", { style: "currency", currency: p.currency, currencyDisplay: "narrowSymbol", maximumFractionDigits: p.amount % 100 ? 2 : 0 }).format(p.amount / 100);
  return `${money}/${p.interval === "monthly" ? "month" : p.interval.replace(/ly$/, "")}`;
}

let planRequest: Promise<Plan | null> | null = null;
export const getPlan = () => (planRequest ??= api<Plan>("/api/plan").catch(() => null));

export const getMe = () => api<Me>("/api/me").catch((e: { status?: number }) => (e.status === 401 ? null : Promise.reject(e)));

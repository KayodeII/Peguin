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

export const getMe = () => api<Me>("/api/me").catch((e: { status?: number }) => (e.status === 401 ? null : Promise.reject(e)));

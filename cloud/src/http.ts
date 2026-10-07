import { HttpError } from "./env.js";

export const json = (data: unknown, status = 200, headers: HeadersInit = {}) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json", ...headers } });

export const redirect = (to: string, headers: HeadersInit = {}) =>
  new Response(null, { status: 302, headers: { location: to, ...headers } });

export function cookie(name: string, value: string, maxAgeSeconds: number, secure: boolean): string {
  return `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${secure ? "; Secure" : ""}`;
}

export function readCookie(req: Request, name: string): string | undefined {
  const raw = req.headers.get("cookie") ?? "";
  for (const part of raw.split(/;\s*/)) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i) === name) return part.slice(i + 1);
  }
  return undefined;
}

export async function body<T>(req: Request): Promise<T> {
  try { return (await req.json()) as T; } catch { throw new HttpError(400, "Send a JSON body."); }
}

/** Only same-site paths, so links can't bounce users to another site. */
export function safeNext(next: string | null | undefined, fallback = "/account"): string {
  return next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") ? next : fallback;
}

export const now = () => Math.floor(Date.now() / 1000);

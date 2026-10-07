// The user's Penguin account: sign-in through the browser (PKCE, returning via
// penguin://), the app token (encrypted with the OS keychain), the signed
// licence (checked offline), and the server-side Claude endpoints.
import { app, safeStorage, shell } from "electron";
import { createHash, randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { PromptActivity } from "../../../src/core/brain/prompts.js";

export const CLOUD_URL = (process.env.PENGUIN_CLOUD_URL ?? "http://localhost:8787").replace(/\/$/, "");

/** Public half of the licence key (cloud: npm run keys:license). Replace with the production key at deploy. */
const LICENSE_PUBLIC_JWK: JsonWebKey = { kty: "OKP", crv: "Ed25519", x: "9zqCksjEbfm0DIFzx5hv9P7iZuYsz5iQEi5kgFAEmTs" };

export type Account = { email: string; status: string | null; entitled: boolean; licenseUntil: number | null };
type License = { sub: string; email: string; status: string; exp: number };

const dir = () => app.getPath("userData");
const tokenFile = () => path.join(dir(), "account.bin");
const licenseFile = () => path.join(dir(), "license.txt");
const b64u = (b: Buffer) => b.toString("base64url");

let pending: { verifier: string; state: string } | null = null;

function saveToken(token: string) {
  mkdirSync(dir(), { recursive: true });
  const data = safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(token) : Buffer.from(token);
  writeFileSync(tokenFile(), data, { mode: 0o600 });
}

function loadToken(): string | null {
  try {
    const data = readFileSync(tokenFile());
    return safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(data) : data.toString();
  } catch { return null; }
}

async function cloud<T>(pathname: string, init: { method?: string; body?: unknown; token?: string | null } = {}): Promise<T> {
  const token = init.token === undefined ? loadToken() : init.token;
  const res = await fetch(`${CLOUD_URL}${pathname}`, {
    method: init.method ?? (init.body === undefined ? "GET" : "POST"),
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(init.body === undefined ? {} : { "content-type": "application/json" }) },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    signal: AbortSignal.timeout(120000),
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw Object.assign(new Error(data.error ?? `Penguin server returned ${res.status}`), { status: res.status });
  return data;
}

/** Opens the browser; the result arrives later through completeSignIn(). */
export async function startSignIn(): Promise<void> {
  const verifier = b64u(randomBytes(32));
  const state = b64u(randomBytes(16));
  pending = { verifier, state };
  const challenge = b64u(createHash("sha256").update(verifier).digest());
  await shell.openExternal(`${CLOUD_URL}/app/connect?challenge=${challenge}&state=${state}`);
}

/** Handles penguin://auth?code=…&state=… from the browser. */
export async function completeSignIn(url: string): Promise<Account | null> {
  const u = new URL(url);
  if (u.hostname !== "auth" || !pending) return null;
  const code = u.searchParams.get("code");
  if (!code || u.searchParams.get("state") !== pending.state) throw new Error("That sign-in didn't come from this app. Try signing in again.");
  const { verifier } = pending;
  pending = null;
  const { token } = await cloud<{ token: string }>("/api/app/token", { body: { code, verifier, label: `Penguin on ${process.platform}` }, token: null });
  saveToken(token);
  return refreshAccount();
}

async function verifyLicense(token: string): Promise<License | null> {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const key = await crypto.subtle.importKey("jwk", LICENSE_PUBLIC_JWK, { name: "Ed25519" }, false, ["verify"]);
  const ok = await crypto.subtle.verify({ name: "Ed25519" }, key, Buffer.from(sig, "base64url"), new TextEncoder().encode(body));
  return ok ? (JSON.parse(Buffer.from(body, "base64url").toString()) as License) : null;
}

/** Entitlement without the network: a validly signed, unexpired licence on disk. */
export async function offlineLicense(): Promise<License | null> {
  try {
    const lic = await verifyLicense(readFileSync(licenseFile(), "utf8").trim());
    return lic && lic.exp > Date.now() / 1000 ? lic : null;
  } catch { return null; }
}

/** Ask the server for the current account and a fresh licence; fall back to the offline licence. */
export async function refreshAccount(): Promise<Account | null> {
  if (!loadToken()) return null;
  try {
    const me = await cloud<{ email: string; entitled: boolean; subscription: { status: string } | null }>("/api/me");
    if (me.entitled) {
      const { license } = await cloud<{ license: string }>("/api/license");
      if (await verifyLicense(license)) writeFileSync(licenseFile(), license);
    } else {
      rmSync(licenseFile(), { force: true });
    }
    const lic = await offlineLicense();
    return { email: me.email, status: me.subscription?.status ?? null, entitled: !!lic, licenseUntil: lic?.exp ?? null };
  } catch (e) {
    if ((e as { status?: number }).status === 401) { signOutLocal(); return null; }
    const lic = await offlineLicense(); // offline: trust the signed licence until it expires
    return lic ? { email: lic.email, status: lic.status, entitled: true, licenseUntil: lic.exp } : null;
  }
}

function signOutLocal() {
  rmSync(tokenFile(), { force: true });
  rmSync(licenseFile(), { force: true });
}

export async function signOut(): Promise<void> {
  await cloud("/api/app/signout", { method: "POST", body: {} }).catch(() => {});
  signOutLocal();
}

/** Server-side Claude, for subscribers. */
export const cloudDraft = (name: string, activity: PromptActivity[], failed: string[]) =>
  cloud<{ script: string; facts: string[] }>("/api/draft", { body: { name, activity, failed } });

export const cloudAnswer = (name: string, facts: string[], script: string | undefined, recent: string[], question: string) =>
  cloud<{ text: string }>("/api/answer", { body: { name, facts, script, recent, question } }).then((r) => r.text);

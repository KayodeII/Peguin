const enc = new TextEncoder();

export function b64url(bytes: ArrayBuffer | Uint8Array): string {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = "";
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function b64urlDecode(s: string): Uint8Array {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

/** 32 random bytes, URL-safe. */
export const randomToken = () => b64url(crypto.getRandomValues(new Uint8Array(32)));

export async function sha256(text: string): Promise<string> {
  return b64url(await crypto.subtle.digest("SHA-256", enc.encode(text)));
}

export async function hmacHex(secret: string, message: string, hash: "SHA-256" | "SHA-512" = "SHA-256"): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(message)));
  return [...sig].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Node exports Ed25519 JWKs with alg "Ed25519"; Workers expects "EdDSA". The field is optional, so drop it. */
const portable = ({ alg: _alg, key_ops: _ops, ext: _ext, ...k }: JsonWebKey): JsonWebKey => k;

/** Compact signed token: base64url(JSON payload) + "." + base64url(Ed25519 signature). */
export async function signEd25519(payload: object, privateJwk: JsonWebKey): Promise<string> {
  const key = await crypto.subtle.importKey("jwk", portable(privateJwk), { name: "Ed25519" }, false, ["sign"]);
  const body = b64url(enc.encode(JSON.stringify(payload)));
  const sig = await crypto.subtle.sign({ name: "Ed25519" }, key, enc.encode(body));
  return `${body}.${b64url(sig)}`;
}

export async function verifyEd25519<T>(token: string, publicJwk: JsonWebKey): Promise<T | null> {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const key = await crypto.subtle.importKey("jwk", portable(publicJwk), { name: "Ed25519" }, false, ["verify"]);
  const ok = await crypto.subtle.verify({ name: "Ed25519" }, key, b64urlDecode(sig), enc.encode(body));
  return ok ? (JSON.parse(new TextDecoder().decode(b64urlDecode(body))) as T) : null;
}

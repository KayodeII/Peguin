import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { isEntitled, verifyStripeSignature } from "../cloud/src/billing.js";
import { signEd25519, verifyEd25519 } from "../cloud/src/crypto.js";
import { safeNext } from "../cloud/src/http.js";

describe("Stripe webhook signatures", () => {
  const secret = "whsec_test";
  const payload = '{"id":"evt_1"}';
  const header = (t: number, body = payload, key = secret) => `t=${t},v1=${createHmac("sha256", key).update(`${t}.${body}`).digest("hex")}`;
  const t = 1_800_000_000;

  it("accepts a fresh, correctly signed event", async () => {
    expect(await verifyStripeSignature(payload, header(t), secret, t + 10)).toBe(true);
  });
  it("rejects forged, tampered, stale and malformed headers", async () => {
    expect(await verifyStripeSignature(payload, header(t, payload, "whsec_other"), secret, t)).toBe(false);
    expect(await verifyStripeSignature('{"id":"evt_2"}', header(t), secret, t)).toBe(false);
    expect(await verifyStripeSignature(payload, header(t), secret, t + 301)).toBe(false);
    expect(await verifyStripeSignature(payload, "garbage", secret, t)).toBe(false);
  });
});

describe("entitlement", () => {
  const at = 1_800_000_000;
  it("active and trialing are entitled; canceled and missing are not", () => {
    expect(isEntitled({ status: "active", current_period_end: at + 100 }, at)).toBe(true);
    expect(isEntitled({ status: "trialing", current_period_end: at + 100 }, at)).toBe(true);
    expect(isEntitled({ status: "canceled", current_period_end: at + 100 }, at)).toBe(false);
    expect(isEntitled(null, at)).toBe(false);
  });
  it("past_due gets a short grace period", () => {
    expect(isEntitled({ status: "past_due", current_period_end: at - 86400 }, at)).toBe(true);
    expect(isEntitled({ status: "past_due", current_period_end: at - 4 * 86400 }, at)).toBe(false);
  });
});

describe("licence tokens", () => {
  it("verify with the public key; any change breaks them", async () => {
    const { publicKey, privateKey } = await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]) as CryptoKeyPair;
    const priv = await crypto.subtle.exportKey("jwk", privateKey);
    const pub = await crypto.subtle.exportKey("jwk", publicKey);
    const token = await signEd25519({ sub: "u1", exp: 1 }, priv);
    expect(await verifyEd25519(token, pub)).toEqual({ sub: "u1", exp: 1 });
    const [body, sig] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ sub: "u2", exp: 1 })).toString("base64url");
    expect(await verifyEd25519(`${forged}.${sig}`, pub)).toBe(null);
    expect(await verifyEd25519(`${body}`, pub)).toBe(null);
  });
});

describe("redirects after sign-in", () => {
  it("only allow paths on this site", () => {
    expect(safeNext("/account")).toBe("/account");
    expect(safeNext("/app/connect?x=1")).toBe("/app/connect?x=1");
    for (const bad of ["//evil.com", "https://evil.com", "/\\evil.com", "", null, undefined]) expect(safeNext(bad)).toBe("/account");
  });
});

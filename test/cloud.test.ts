import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { isEntitled, normaliseStatus, verifyPaystackSignature } from "../cloud/src/billing.js";
import { signEd25519, verifyEd25519 } from "../cloud/src/crypto.js";
import { safeNext } from "../cloud/src/http.js";

describe("Paystack webhook signatures", () => {
  const secret = "sk_test_abc";
  const payload = '{"event":"charge.success"}';
  const sign = (body: string, key = secret) => createHmac("sha512", key).update(body).digest("hex");

  it("accepts the HMAC-SHA512 of the raw body", async () => {
    expect(await verifyPaystackSignature(payload, sign(payload), secret)).toBe(true);
    expect(await verifyPaystackSignature(payload, sign(payload).toUpperCase(), secret)).toBe(true);
  });
  it("rejects forged, tampered and missing signatures", async () => {
    expect(await verifyPaystackSignature(payload, sign(payload, "sk_test_other"), secret)).toBe(false);
    expect(await verifyPaystackSignature('{"event":"charge.failed"}', sign(payload), secret)).toBe(false);
    expect(await verifyPaystackSignature(payload, "", secret)).toBe(false);
  });
});

describe("entitlement", () => {
  const at = 1_800_000_000;
  const day = 86400;
  it("the free trial counts until it ends, with or without a plan", () => {
    expect(isEntitled(null, at + day, at)).toBe(true);
    expect(isEntitled(null, at - 1, at)).toBe(false);
    expect(isEntitled(null, null, at)).toBe(false);
  });
  it("paid states", () => {
    expect(isEntitled({ status: "active", current_period_end: at - day }, null, at)).toBe(true); // renewal pending
    expect(isEntitled({ status: "non_renewing", current_period_end: at + day }, null, at)).toBe(true);
    expect(isEntitled({ status: "non_renewing", current_period_end: at - 1 }, null, at)).toBe(false);
    expect(isEntitled({ status: "canceled", current_period_end: at + day }, null, at)).toBe(false);
  });
  it("a failed renewal gets a short grace period", () => {
    expect(isEntitled({ status: "past_due", current_period_end: at - day }, null, at)).toBe(true);
    expect(isEntitled({ status: "past_due", current_period_end: at - 4 * day }, null, at)).toBe(false);
  });
  it("maps Paystack statuses", () => {
    expect(normaliseStatus("active")).toBe("active");
    expect(normaliseStatus("non-renewing")).toBe("non_renewing");
    expect(normaliseStatus("attention")).toBe("past_due");
    expect(normaliseStatus("completed")).toBe("canceled");
    expect(normaliseStatus("cancelled")).toBe("canceled");
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

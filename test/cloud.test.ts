import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { accessOf, isEntitled, normaliseStatus, planCodes, planForCode, verifyPaystackSignature } from "../cloud/src/billing.js";
import { availableProviders, emailFromIdToken, isProvider, seal, unseal } from "../cloud/src/calendars.js";
import { signEd25519, verifyEd25519 } from "../cloud/src/crypto.js";
import { escapeHtml, signInEmail, supportInboxEmail } from "../cloud/src/email.js";
import { safeNext } from "../cloud/src/http.js";
import { DMG_ASSET, fromGithub } from "../cloud/src/release.js";
import { faqReply, HANDOFF, parseReply, plansText, supportSystem } from "../cloud/src/support.js";
import { PLANS } from "../src/core/plans.js";
import { compareVersions, isNewer } from "../src/core/version.js";

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

describe("help chat", () => {
  it("detects and strips the handoff marker", () => {
    expect(parseReply(`The team can help with refunds by email. ${HANDOFF}`)).toEqual({ text: "The team can help with refunds by email.", handoff: true });
    expect(parseReply("Yes, Google Meet and Zoom.")).toEqual({ text: "Yes, Google Meet and Zoom.", handoff: false });
  });

  it("grounds the prompt in the site FAQ and the live plans", () => {
    const s = supportSystem(14, "- Basic, NGN 7,500 per month.", false);
    expect(s).toContain("Is there a Windows version?");
    expect(s).toContain("Pro free for 14 days");
    expect(s).toContain("NGN 7,500");
    expect(s).not.toContain("invite-only");
    expect(supportSystem(14, "", false, true)).toContain("invite-only");
    expect(s).toContain(HANDOFF);
    expect(s).toContain("isn't publicly downloadable");
    expect(supportSystem(14, "", true)).toContain("account page");
  });
});

describe("emails", () => {
  it("escapes what visitors write before it goes into HTML", () => {
    const m = supportInboxEmail("https://www.peguin.co", { from: "a@b.co", message: "<script>x</script>", transcript: "", page: "/", userId: null });
    expect(m.html).not.toContain("<script>");
    expect(m.html).toContain("&lt;script&gt;");
    expect(m.replyTo).toBe("a@b.co");
  });

  it("puts the sign-in link in both the HTML and text parts", () => {
    const link = "https://www.peguin.co/auth/email/verify?token=abc";
    const m = signInEmail("https://www.peguin.co", link, 15);
    expect(m.html).toContain(link);
    expect(m.text).toContain(link);
    expect(escapeHtml(`"&'`)).toBe("&quot;&amp;&#39;");
  });
});

describe("versions", () => {
  it("compares release numbers numerically", () => {
    expect(isNewer("0.10.0", "0.9.3")).toBe(true);
    expect(isNewer("0.1.0", "0.1.0")).toBe(false);
    expect(isNewer("0.1.0", "0.2.0")).toBe(false);
    expect(compareVersions("1.0.0", "1.0")).toBe(0);
  });
});

describe("releases", () => {
  const asset = { name: DMG_ASSET, browser_download_url: "https://github.com/KayodeII/Peguin/releases/download/v0.2.0/Peguin-mac-arm64.dmg" };
  it("takes the version and .dmg from a published GitHub release", () => {
    expect(fromGithub({ tag_name: "v0.2.0", assets: [asset] })).toEqual({ version: "0.2.0", available: true, url: asset.browser_download_url });
  });
  it("ignores drafts, prereleases, odd tags and releases without the .dmg", () => {
    expect(fromGithub({ tag_name: "v0.2.0", draft: true, assets: [asset] })).toBeNull();
    expect(fromGithub({ tag_name: "v0.2.0", prerelease: true, assets: [asset] })).toBeNull();
    expect(fromGithub({ tag_name: "nightly", assets: [asset] })).toBeNull();
    expect(fromGithub({ tag_name: "v0.2.0", assets: [] })).toBeNull();
  });
});

describe("plans", () => {
  const at = 1_800_000_000;
  const day = 86400;
  const env = { PAYSTACK_PLANS: JSON.stringify({ basic: "PLN_b", pro: "PLN_p" }), PAYSTACK_PLAN_CODE: "PLN_old" };

  it("trial is Pro, then Free; a paid plan wins over both", () => {
    expect(accessOf(null, at + day, at)).toEqual({ plan: "pro", status: "trialing" });
    expect(accessOf(null, at - 1, at)).toEqual({ plan: "free", status: "free" });
    expect(accessOf({ status: "active", current_period_end: at + day, plan: "basic" }, at + day, at)).toEqual({ plan: "basic", status: "active" });
    expect(accessOf({ status: "canceled", current_period_end: at + day, plan: "basic" }, null, at).plan).toBe("free");
    expect(accessOf({ status: "past_due", current_period_end: at - day, plan: "team" }, null, at)).toEqual({ plan: "team", status: "past_due" });
  });
  it("subscriptions from before plans count as Pro", () => {
    expect(accessOf({ status: "active", current_period_end: null, plan: null }, null, at).plan).toBe("pro");
    expect(accessOf({ status: "active", current_period_end: null, plan: "gold" }, null, at).plan).toBe("pro");
  });
  it("maps Paystack plan codes both ways", () => {
    expect(planCodes(env)).toEqual({ basic: "PLN_b", pro: "PLN_p" });
    expect(planForCode(env, "PLN_b")).toBe("basic");
    expect(planForCode(env, "PLN_unknown")).toBe("pro");
    // The old single plan stands in for Pro only when PAYSTACK_PLANS doesn't name one.
    expect(planCodes({ PAYSTACK_PLAN_CODE: "PLN_old" })).toEqual({ pro: "PLN_old" });
    expect(planCodes({ PAYSTACK_PLANS: "not json", PAYSTACK_PLAN_CODE: undefined })).toEqual({});
  });
  it("Free has no follow-ups or recaps; Pro and Team have own voice", () => {
    expect(PLANS.free.features.perDay.answer).toBe(0);
    expect(PLANS.free.features.followUps).toBe(false);
    expect(PLANS.basic.features.ownVoice).toBe(false);
    expect(PLANS.pro.features.ownVoice && PLANS.team.features.ownVoice).toBe(true);
  });
  it("the help chat lists every plan, with prices only where Paystack has one", () => {
    const offers = Object.values(PLANS).map((p) => ({ ...p, onSale: p.id !== "team", price: p.id === "basic" ? { amount: 300000, currency: "NGN", interval: "monthly" } : null }));
    const text = plansText(offers);
    expect(text).toContain("Free, free.");
    expect(text).toMatch(/Basic, NGN\s?3,000 per month/);
    expect(text).toContain("Team, not on sale yet");
    expect(text.split("\n").find((l) => l.startsWith("- Free"))).not.toContain("own voice");
  });
});

describe("calendar connections", () => {
  it("the hand-off opens only with the same one-time code", async () => {
    const sealed = await seal("code-1", { provider: "google", accessToken: "a", refreshToken: "r" });
    expect(sealed).not.toContain("refreshToken");
    expect(await unseal("code-1", sealed)).toEqual({ provider: "google", accessToken: "a", refreshToken: "r" });
    await expect(unseal("code-2", sealed)).rejects.toThrow();
  });
  it("reads the account email from an id token", () => {
    const tok = (claims: object) => `x.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.y`;
    expect(emailFromIdToken(tok({ email: "a@b.co" }))).toBe("a@b.co");
    expect(emailFromIdToken(tok({ preferred_username: "m@corp.com" }))).toBe("m@corp.com");
    expect(emailFromIdToken(undefined)).toBeNull();
    expect(emailFromIdToken("garbage")).toBeNull();
  });
  it("only offers providers whose OAuth client is configured", () => {
    const env = { GOOGLE_CLIENT_ID: "g", GOOGLE_CLIENT_SECRET: "s", CALENDLY_CLIENT_ID: "c" } as unknown as Parameters<typeof availableProviders>[0];
    expect(availableProviders(env)).toEqual(["google"]);
    expect(isProvider("google")).toBe(true);
    expect(isProvider("yahoo")).toBe(false);
  });
});

describe("help chat without Claude", () => {
  it("answers from the closest FAQ entry and offers the team", () => {
    const r = faqReply("Is there a Windows version?", 14);
    expect(r.text).toContain("macOS first");
    expect(r.handoff).toBe(true);
    expect(faqReply("does it work with zoom meetings", 14).text).toMatch(/Zoom/);
    expect(faqReply("Does it work on Windows?", 14).text).toContain("macOS first");
  });
  it("hands off instead of guessing when nothing matches", () => {
    expect(faqReply("hello??", 14)).toEqual({ text: expect.stringContaining("team can help"), handoff: true });
  });
});

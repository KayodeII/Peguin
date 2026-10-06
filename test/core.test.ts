import { describe, expect, it } from "vitest";
import { decrypt, encrypt, sessionToken, verifySessionToken } from "../src/core/crypto.js";
import { detectPlatform } from "../src/core/providers/types.js";
import { recall } from "../src/core/providers/recall.js";
import { attendee } from "../src/core/providers/attendee.js";
import { previousWorkdayStart } from "../src/core/sources/types.js";

describe("detectPlatform", () => {
  it.each([
    ["https://us02web.zoom.us/j/123?pwd=x", "zoom"],
    ["https://meet.google.com/abc-defg-hij", "google_meet"],
    ["https://teams.microsoft.com/l/meetup-join/19%3a...", "teams"],
    ["https://teams.live.com/meet/123", "teams"],
    ["https://acme.webex.com/meet/x", "webex"],
    ["https://example.com/zoom.us", "unknown"],
    ["not a url", "unknown"],
  ])("%s -> %s", (url, p) => expect(detectPlatform(url)).toBe(p));
});

describe("crypto", () => {
  it("round-trips secrets and rejects tampering", () => {
    const blob = encrypt("ghp_secret");
    expect(decrypt(blob)).toBe("ghp_secret");
    const bad = Buffer.from(blob, "base64"); bad[bad.length - 1]! ^= 1;
    expect(() => decrypt(bad.toString("base64"))).toThrow();
  });
  it("session tokens are bound to one meeting", () => {
    const a = "11111111-1111-1111-1111-111111111111", b = "22222222-2222-2222-2222-222222222222";
    expect(verifySessionToken(a, sessionToken(a))).toBe(true);
    expect(verifySessionToken(b, sessionToken(a))).toBe(false);
  });
});

describe("provider webhooks", () => {
  it("normalises Recall events", () => {
    expect(recall.parseWebhook({ event: "bot.in_call_recording", data: { bot: { id: "b1" }, data: { code: "in_call_recording" } } }))
      .toEqual({ botId: "b1", kind: "in_call", detail: "in_call_recording" });
    expect(recall.parseWebhook({ event: "bot.done", data: { bot: { id: "b1" }, data: {} } })?.kind).toBe("ended");
    expect(recall.parseWebhook({ event: "transcript.data", data: {} })).toBeNull();
  });
  it("normalises Attendee events", () => {
    expect(attendee.parseWebhook({ trigger: "bot.state_change", bot_id: "bot_1", data: { new_state: "joined_recording" } })?.kind).toBe("in_call");
    expect(attendee.parseWebhook({ trigger: "bot.state_change", bot_id: "bot_1", data: { new_state: "fatal_error", event_type: "could_not_join" } }))
      .toEqual({ botId: "bot_1", kind: "failed", detail: "could_not_join" });
  });
});

describe("previousWorkdayStart", () => {
  it("covers Friday onward on a Monday (Lagos)", () => {
    // Monday 2026-10-05 09:00 in Lagos (UTC+1) = 08:00Z
    const d = previousWorkdayStart(new Date("2026-10-05T08:00:00Z"), "Africa/Lagos");
    expect(d.toISOString()).toBe("2026-10-01T23:00:00.000Z"); // Friday 00:00 Lagos
  });
  it("covers yesterday mid-week", () => {
    const d = previousWorkdayStart(new Date("2026-10-07T14:00:00Z"), "UTC");
    expect(d.toISOString()).toBe("2026-10-06T00:00:00.000Z");
  });
});

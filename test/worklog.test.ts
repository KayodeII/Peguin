import { describe, expect, it } from "vitest";
import { cleanTitle, duration, prune, skipped, stintLine, summarise, type Glance } from "../desktop/src/main/watch/summary.js";
import { audioQuality, clipVerdict, joinClips, likeness, pcmToFloat } from "../desktop/src/main/speech/voice/clipRules.js";
import { draftSystem } from "../src/core/brain/prompts.js";

const g = (at: string, app: string, title: string): Glance => ({ at, app, title });

describe("work log", () => {
  it("cleans browser suffixes, unread counts and titles that are just the app", () => {
    expect(cleanTitle("(3) Pull request #26 · KayodeII/penguin - Google Chrome", "Google Chrome")).toBe("Pull request #26 · KayodeII/penguin");
    expect(cleanTitle("● pointer.ts — penguin — Visual Studio Code", "Code")).toBe("pointer.ts — penguin");
    expect(cleanTitle("Slack", "Slack")).toBe("");
  });
  it("leaves out the owner's private apps, private windows, the lock screen and Peguin itself", () => {
    const skip = ["1Password", "Messages", "com.tinyspeck.slackmacgap", "salary"];
    expect(skipped({ app: "1Password 8", title: "" }, skip)).toBe(false); // names match whole, not in part
    expect(skipped({ app: "1password", title: "Vault" }, skip)).toBe(true);
    expect(skipped({ app: "Messages", title: "Mum" }, skip)).toBe(true);
    expect(skipped({ app: "Slack", bundle: "com.tinyspeck.slackmacgap", title: "general" }, skip)).toBe(true);
    expect(skipped({ app: "Numbers", title: "2026 salary review" }, skip)).toBe(true);
    expect(skipped({ app: "Google Chrome", title: "New Incognito Tab" }, skip)).toBe(true);
    expect(skipped({ app: "loginwindow", bundle: "com.apple.loginwindow", title: "" }, skip)).toBe(true);
    expect(skipped({ app: "Peguin", title: "Settings" }, skip)).toBe(true);
    expect(skipped({ app: "Code", title: "pointer.ts — penguin" }, skip)).toBe(false);
    expect(skipped({ app: "Code", title: "x" }, [" ", ""])).toBe(false);
  });
  it("adds up time per window since the last workday, longest first, ignoring passing glances", () => {
    const log = [
      g("2026-10-19T08:00:00Z", "Code", "old.ts"),
      ...[0, 5, 10, 15].map((m) => g(`2026-10-20T09:${String(m).padStart(2, "0")}:00Z`, "Code", "● pointer.ts — penguin — Visual Studio Code")),
      g("2026-10-20T09:20:00Z", "Google Chrome", "PR #26 - Google Chrome"),
      g("2026-10-20T09:25:00Z", "Google Chrome", "PR #26 - Google Chrome"),
      g("2026-10-20T09:30:00Z", "Finder", "Downloads"),
    ];
    const s = summarise(log, new Date("2026-10-20T00:00:00Z"), 5);
    expect(s.map((x) => [x.app, x.title, x.minutes])).toEqual([["Code", "pointer.ts — penguin", 20], ["Google Chrome", "PR #26", 10]]);
    expect(s[0]!.first).toBe("2026-10-20T09:00:00Z");
    expect(stintLine(s[0]!)).toBe("Code: pointer.ts — penguin (about 20 min)");
  });
  it("forgets notes older than the owner's days", () => {
    const now = new Date("2026-10-20T12:00:00Z");
    expect(prune([g("2026-10-12T12:00:00Z", "a", ""), g("2026-10-19T12:00:00Z", "b", "")], 7, now).map((x) => x.app)).toEqual(["b"]);
  });
  it("durations read naturally", () => {
    expect(duration(10)).toBe("about 10 min");
    expect(duration(85)).toBe("about 1 h 25 min");
    expect(duration(120)).toBe("about 2 h");
  });
  it("the draft prompt treats window titles as time spent, never as facts", () => {
    const p = draftSystem("Mujeeb Adebowale");
    expect(p).toMatch(/source "mac"/);
    expect(p).toMatch(/never claim it's finished/);
    expect(p).toMatch(/never put one in facts/);
  });
});

describe("learn my voice", () => {
  const tone = (s: number, rate = 24000, amp = 0.3) => Float32Array.from({ length: s * rate }, (_, i) => amp * Math.sin(i / 8));
  const room = { today: 0, perDay: 8, pending: 0 };
  const words = "so today I mostly worked on the voice control overlay and the helper";
  it("keeps clean clips of real talk, and says why it drops the rest", () => {
    const q = audioQuality(tone(6), 24000);
    expect(q.speech).toBeGreaterThan(0.9);
    expect(clipVerdict({ text: words, seconds: 6, ...q }, room)).toBeNull();
    expect(clipVerdict({ text: "yeah okay sure", seconds: 6, ...q }, room)).toBe("too few words");
    expect(clipVerdict({ text: words, seconds: 2, ...q }, room)).toBe("too short or too long");
    expect(clipVerdict({ text: words, seconds: 6, speech: 0.3, clipped: 0 }, room)).toBe("mostly silence");
    expect(clipVerdict({ text: words, seconds: 6, ...audioQuality(tone(6, 24000, 1.2).map((v) => Math.max(-1, Math.min(1, v))), 24000) }, room)).toBe("distorted");
    expect(clipVerdict({ text: words, seconds: 6, ...q }, { ...room, today: 8 })).toBe("enough clips today");
    expect(clipVerdict({ text: words, seconds: 6, ...q }, { ...room, pending: 30 })).toBe("the review list is full");
  });
  it("converts 24 kHz PCM16 to floats and joins ticked clips up to the limit", () => {
    const f = pcmToFloat(Int16Array.from([0, 16384, -16384, 32767]), 24000, 24000);
    expect([...f].map((v) => Math.round(v * 100) / 100)).toEqual([0, 0.5, -0.5, 1]);
    expect(pcmToFloat(new Int16Array(16000), 16000, 24000).length).toBe(24000);
    const joined = joinClips([tone(10), tone(10), tone(10), tone(10)], 24000, 30);
    expect(joined.length).toBe(30 * 24000);
    expect(Math.max(...joined.subarray(0, 24000).map(Math.abs))).toBeCloseTo(0.9, 2);
    expect(joinClips([tone(5), new Float32Array(100)], 24000, 30).length).toBe(5 * 24000);
  });
  it("likeness is cosine similarity, never negative", () => {
    expect(likeness([1, 0], [1, 0])).toBe(1);
    expect(likeness([1, 0], [0, 1])).toBe(0);
    expect(likeness([1, 0], [-1, 0])).toBe(0);
    expect(likeness([0, 0], [1, 1])).toBe(0);
  });
});

import { scratch } from "../desktop/src/main/context/claudeCode.js";
import { cursorProject, cursorPrompt } from "../desktop/src/main/context/sessions.js";

describe("Claude Code sessions that aren't the owner's work", () => {
  it("skips temporary folders (Peguin's own calls, one-off runs)", () => {
    expect(scratch("-private-tmp")).toBe(true);
    expect(scratch("-private-var-folders-rm-t8wxg-l90mj24x7h4r3ygp6h0000gn-T")).toBe(true);
    expect(scratch("-tmp-x")).toBe(true);
    expect(scratch("-Users-adebowalemujeeb-Desktop-penguin")).toBe(false);
    expect(scratch("-Users-me-tmpl-project")).toBe(false);
  });
});

describe("Cursor session prompts", () => {
  it("takes the user_query and drops the timestamp wrapper", () => {
    expect(cursorPrompt("<timestamp>Tue</timestamp>\n<user_query>\nfix the draft\n</user_query>")).toBe("fix the draft");
    expect(cursorPrompt("plain ask")).toBe("plain ask");
    expect(cursorPrompt("<user_query>  </user_query>")).toBeNull();
  });
  it("names the project from the Cursor slug", () => {
    expect(cursorProject("Users-adebowalemujeeb-Desktop-penguin")).toBe("penguin");
  });
});

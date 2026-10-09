import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { claudeCodeActivity } from "../desktop/src/main/context/claudeCode.js";
import { botName, chromeUserAgent, webClientUrl } from "../desktop/src/main/meeting/platform.js";
import { due, nextStandup } from "../desktop/src/main/scheduler.js";
import type { Settings } from "../desktop/src/main/settings.js";

const settings = (standup: Partial<Settings["standup"]> = {}): Settings => ({
  displayName: "Mujeeb Adebowale", aliases: [], timezone: "Africa/Lagos",
  standup: { url: "https://meet.google.com/abc-defg-hij", time: "09:30", days: [1, 2, 3, 4, 5], auto: true, ...standup },
  sources: { git: true, github: true, claude_code: true }, voice: { mode: "standard", pronunciations: [], pause: 0.32, expressiveness: 0.6, attempts: 3 },
  appearance: { theme: "system", accent: "blue" }, recap: { summarize: true, keepDays: 30 }, calendar: { enabled: false, mac: false, words: ["standup"] }, stopWhenInterrupted: true, runHidden: true, onboarded: true,
});
// Lagos is UTC+1 all year. 2026-10-07 is a Wednesday.
const lagos = (hhmm: string, date = "2026-10-07") => new Date(`${date}T${hhmm}:00+01:00`);

describe("scheduler", () => {
  it("prepares 15 minutes before and joins a minute before", () => {
    expect(due(settings(), lagos("09:10"), {})).toBe(null);
    expect(due(settings(), lagos("09:15"), {})).toBe("prepare");
    expect(due(settings(), lagos("09:29"), { prepared: "2026-10-07" })).toBe("join");
    expect(due(settings(), lagos("09:35"), { prepared: "2026-10-07" })).toBe("join"); // late start still joins
  });
  it("does each step once a day", () => {
    expect(due(settings(), lagos("09:16"), { prepared: "2026-10-07" })).toBe(null);
    expect(due(settings(), lagos("09:30"), { prepared: "2026-10-07", joined: "2026-10-07" })).toBe(null);
  });
  it("respects days, auto and the link", () => {
    expect(due(settings({ days: [1] }), lagos("09:29"), {})).toBe(null); // Monday only, it's Wednesday
    expect(due(settings({ auto: false }), lagos("09:29"), {})).toBe(null);
    expect(due(settings({ url: "" }), lagos("09:29"), {})).toBe(null);
    expect(due(settings(), lagos("09:45"), {})).toBe(null); // too late to join
  });
  it("labels the next standup", () => {
    expect(nextStandup(settings(), lagos("08:00"))?.label).toBe("Today at 09:30");
    expect(nextStandup(settings(), lagos("11:00"))?.label).toBe("Tomorrow at 09:30");
    expect(nextStandup(settings(), lagos("11:00", "2026-10-09"))?.label).toBe("Monday at 09:30"); // Friday
  });
});

describe("bot name and links", () => {
  it("always ends with the AI label, whatever the user types", () => {
    expect(botName("Mujeeb", "google_meet")).toBe("Mujeeb (AI)");
    expect(botName("Mujeeb (AI)", "zoom")).toBe("Mujeeb (AI)");
    expect(botName("Mujeeb - AI", "zoom")).toBe("Mujeeb (AI)");
    expect(botName("Mujeeb (Lagos)", "teams")).toBe("Mujeeb Lagos - AI"); // Teams forbids parentheses
    expect(botName("", "google_meet")).toBe("Peguin (AI)");
  });
  it("opens Zoom's browser client and keeps the passcode", () => {
    expect(webClientUrl("https://us05web.zoom.us/j/8123?pwd=abc", "zoom")).toBe("https://us05web.zoom.us/wc/join/8123?pwd=abc");
  });
});

describe("Claude Code sessions", () => {
  const since = new Date("2026-10-06T00:00:00Z");
  const line = (o: object) => JSON.stringify(o) + "\n";

  it("keeps only the user's own prompts from recent sessions", async () => {
    const root = mkdtempSync(path.join(tmpdir(), "cc-"));
    mkdirSync(path.join(root, "proj"));
    writeFileSync(path.join(root, "proj", "s1.jsonl"),
      line({ type: "user", cwd: "/x/acme-api", timestamp: "2026-10-05T10:00:00Z", message: { content: "old prompt from before the window" } })
      + line({ type: "user", cwd: "/x/acme-api", timestamp: "2026-10-06T10:00:00Z", message: { content: "migrate the users table to the new auth schema" } })
      + line({ type: "assistant", timestamp: "2026-10-06T10:00:05Z", message: { content: [{ type: "text", text: "secret code output" }] } })
      + line({ type: "user", timestamp: "2026-10-06T10:01:00Z", message: { content: [{ type: "tool_result", content: "file contents" }] } })
      + line({ type: "user", timestamp: "2026-10-06T10:02:00Z", message: { content: "<command-name>/clear</command-name>" } })
      + line({ type: "user", timestamp: "2026-10-06T10:03:00Z", isMeta: true, message: { content: "meta note" } })
      + "not json\n");
    const r = await claudeCodeActivity(since, root);
    expect(r.activity.map((a) => a.title)).toEqual(["acme-api: migrate the users table to the new auth schema"]);
    expect(r.report.ok).toBe(true);
  });

  it("reports no sessions when Claude Code isn't installed", async () => {
    const r = await claudeCodeActivity(since, path.join(tmpdir(), "does-not-exist-penguin"));
    expect(r.report.ok).toBe(false);
  });
});

describe("updating in place", async () => {
  const { checksumFor, bundleOf, swapScript, ZIP_ASSET } = await import("../desktop/src/main/updater.js");
  const { execFileSync } = await import("node:child_process");
  const fs = await import("node:fs");
  const os = await import("node:os");
  const path = await import("node:path");
  const sha = (c: string) => c.repeat(64);

  it("reads the zip's checksum from the release's shasum file", () => {
    const sums = `${sha("a")}  Peguin-0.7.0-mac-arm64.dmg\n${sha("b")}  Peguin-mac-arm64.dmg\n${sha("c")}  Peguin-0.7.0-mac-arm64.zip\n${sha("d")}  ${ZIP_ASSET}\n`;
    expect(checksumFor(sums, ZIP_ASSET)).toBe(sha("d"));
    expect(checksumFor(sums, "missing.zip")).toBeNull();
    expect(checksumFor("garbage", ZIP_ASSET)).toBeNull();
  });
  it("finds the app bundle from the running executable", () => {
    expect(bundleOf("/Applications/Peguin.app/Contents/MacOS/Peguin")).toBe("/Applications/Peguin.app");
    expect(bundleOf("/usr/local/bin/electron")).toBeNull();
  });
  it("swaps the bundle once the app has exited, keeping nothing behind (real shell run)", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "peguin-swap-test-"));
    const cur = path.join(dir, "Peguin's App.app"), next = path.join(dir, "new", "Peguin.app"), work = path.join(dir, "work");
    fs.mkdirSync(cur, { recursive: true }); fs.writeFileSync(path.join(cur, "v"), "old");
    fs.mkdirSync(next, { recursive: true }); fs.writeFileSync(path.join(next, "v"), "new");
    fs.mkdirSync(work);
    const script = path.join(dir, "swap.sh");
    fs.writeFileSync(script, swapScript({ pid: 999999, current: cur, next, reopen: false, cleanup: work }));
    execFileSync("/bin/sh", [script]);
    expect(fs.readFileSync(path.join(cur, "v"), "utf8")).toBe("new");
    expect(fs.existsSync(`${cur}.old`)).toBe(false);
    expect(fs.existsSync(work)).toBe(false);
    fs.rmSync(dir, { recursive: true, force: true });
  });
  it("puts the old app back when the new one can't be moved in", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "peguin-swap-test-"));
    const cur = path.join(dir, "Peguin.app");
    fs.mkdirSync(cur); fs.writeFileSync(path.join(cur, "v"), "old");
    const script = path.join(dir, "swap.sh");
    fs.writeFileSync(script, swapScript({ pid: 999999, current: cur, next: path.join(dir, "does-not-exist.app"), reopen: false }));
    execFileSync("/bin/sh", [script]);
    expect(fs.readFileSync(path.join(cur, "v"), "utf8")).toBe("old");
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe("meeting windows present as plain Chrome", () => {
  const chrome = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.7977.130 Safari/537.36";
  it("drops the app's name and Electron, whatever the app is called", () => {
    // Google Meet refused "Peguin/0.6.0" after the rename; the old rule only knew "penguin-desktop".
    expect(chromeUserAgent(chrome.replace("Chrome/", "Peguin/0.6.0 Chrome/").replace("Safari/", "Electron/44.6.0 Safari/"))).toBe(chrome);
    expect(chromeUserAgent(chrome.replace("Chrome/", "penguin-desktop/0.6.0 Chrome/"))).toBe(chrome);
  });
  it("leaves a real Chrome user agent alone", () => {
    expect(chromeUserAgent(chrome)).toBe(chrome);
  });
});

import { describe, expect, it } from "vitest";
import { centre, commandPrompt, describe as caption, isFiller, labelScore, matchTarget, parse, searchUrl, softenSpeech, spokenNumber, spokenUrl, wake, type Element } from "../desktop/src/main/pointer/commands.js";

describe("wake", () => {
  it("hears the wake phrase and keeps the command as said", () => {
    expect(wake("Hey Peguin, type Hello World.")).toEqual({ command: "type Hello World.", called: true });
    expect(wake("hey penguin scroll down")).toEqual({ command: "scroll down", called: true });
    expect(wake("OK, Pegwin. Click sign in")).toEqual({ command: "Click sign in", called: true });
    expect(wake("Hey Peguin, can you open my browser?")).toEqual({ command: "open my browser?", called: true });
  });
  it("arms on the wake phrase alone", () => {
    expect(wake("Hey Peguin.")).toEqual({ armed: true });
    expect(wake("Hey, penguin!")).toEqual({ armed: true });
  });
  it("a bare name is not called; ordinary talk is ignored", () => {
    expect(wake("Peguin, scroll down")).toEqual({ command: "scroll down", called: false });
    expect(wake("Penguin")).toBeNull();
    expect(wake("I saw a penguin at the zoo")).toBeNull();
    expect(wake("hey everyone, penguin facts")).toBeNull();
    expect(wake("Let's begin the meeting")).toBeNull();
  });
  it("uses the owner's own wake words", () => {
    expect(wake("Hey Jarvis, new tab", ["Jarvis"])).toEqual({ command: "new tab", called: true });
    expect(wake("Hey Jarvis, new tab", ["Peguin"])).toBeNull();
  });
});

describe("parse", () => {
  it("clicks by name, number or where the mouse is", () => {
    expect(parse("click sign in")).toEqual({ kind: "click", target: { by: "label", label: "sign in" }, button: "left", count: 1 });
    expect(parse("Click on the Sign in button.")).toMatchObject({ target: { by: "label", label: "sign in" } });
    expect(parse("click 7")).toMatchObject({ kind: "click", target: { by: "number", n: 7 } });
    expect(parse("click number twelve")).toMatchObject({ target: { by: "number", n: 12 } });
    expect(parse("click twenty three")).toMatchObject({ target: { by: "number", n: 23 } });
    expect(parse("click on this")).toMatchObject({ kind: "click", target: { by: "cursor" } });
    expect(parse("click")).toMatchObject({ kind: "click", target: { by: "cursor" } });
    expect(parse("double click here")).toMatchObject({ count: 2, target: { by: "cursor" } });
    expect(parse("right-click the file")).toMatchObject({ button: "right", target: { by: "label", label: "file" } });
    expect(parse("open 4")).toMatchObject({ kind: "click", target: { by: "number", n: 4 } });
  });
  it("browser, sites, apps and searches", () => {
    expect(parse("go to my browser")).toEqual({ kind: "browser" });
    expect(parse("open the browser")).toEqual({ kind: "browser" });
    expect(parse("go to github dot com")).toEqual({ kind: "open-url", url: "https://github.com" });
    expect(parse("open news.ycombinator.com")).toEqual({ kind: "open-url", url: "https://news.ycombinator.com" });
    expect(parse("open Slack")).toEqual({ kind: "open-app", name: "Slack" });
    expect(parse("open the Notes app")).toEqual({ kind: "open-app", name: "Notes" });
    expect(parse("search for Rust async traits")).toEqual({ kind: "search", query: "Rust async traits" });
    expect(parse("research WebGPU support in Safari")).toEqual({ kind: "search", query: "WebGPU support in Safari" });
    expect(parse("find out about Paystack fees")).toEqual({ kind: "search", query: "Paystack fees" });
    expect(parse("go to the moon")).toEqual({ kind: "open-app", name: "moon" }); // no such app: it says so when it runs
  });
  it("keys and typing", () => {
    expect(parse("new tab")).toMatchObject({ kind: "key", combo: "cmd+t" });
    expect(parse("Close this tab.")).toMatchObject({ kind: "key", combo: "cmd+w" });
    expect(parse("go back")).toMatchObject({ kind: "key", combo: "cmd+[" });
    expect(parse("press enter")).toMatchObject({ kind: "key", combo: "return" });
    expect(parse("enter")).toMatchObject({ kind: "key", combo: "return" });
    expect(parse("press command shift t")).toMatchObject({ kind: "key", combo: "cmd+shift+t" });
    expect(parse("select all")).toMatchObject({ kind: "key", combo: "cmd+a" });
    expect(parse("scroll to the top")).toMatchObject({ kind: "key", combo: "cmd+up" });
    expect(parse("type Hello, World!")).toEqual({ kind: "type", text: "Hello, World!" });
    expect(parse("find pricing on this page")).toEqual({ kind: "find", text: "pricing" });
  });
  it("scrolling", () => {
    expect(parse("scroll down")).toEqual({ kind: "scroll", dir: "down", amount: 8 });
    expect(parse("scroll up a bit")).toEqual({ kind: "scroll", dir: "up", amount: 3 });
    expect(parse("scroll")).toEqual({ kind: "scroll", dir: "down", amount: 8 });
    expect(parse("page down")).toMatchObject({ kind: "scroll", dir: "down" });
  });
  it("drawing and the overlay", () => {
    expect(parse("draw a circle")).toEqual({ kind: "draw", shape: "circle", target: { by: "cursor" } });
    expect(parse("draw an arrow here")).toEqual({ kind: "draw", shape: "arrow", target: { by: "cursor" } });
    expect(parse("draw a box around the pricing table")).toEqual({ kind: "draw", shape: "box", target: { by: "label", label: "pricing table" } });
    expect(parse("highlight this")).toEqual({ kind: "draw", shape: "highlight", target: { by: "cursor" } });
    expect(parse("circle 5")).toEqual({ kind: "draw", shape: "circle", target: { by: "number", n: 5 } });
    expect(parse("draw")).toEqual({ kind: "draw", shape: "pen", target: { by: "cursor" } });
    expect(parse("let me draw")).toMatchObject({ kind: "draw", shape: "pen" });
    expect(parse("clear the drawings")).toEqual({ kind: "clear" });
    expect(parse("show numbers")).toEqual({ kind: "numbers", on: true });
    expect(parse("hide numbers")).toEqual({ kind: "numbers", on: false });
    expect(parse("stop")).toEqual({ kind: "stop" });
    expect(parse("done")).toEqual({ kind: "stop" });
  });
  it("anything else is unknown", () => {
    expect(parse("is a flightless bird")).toMatchObject({ kind: "unknown" });
    expect(parse("make me a sandwich")).toMatchObject({ kind: "unknown" });
  });
});

describe("helpers", () => {
  it("spoken numbers and URLs", () => {
    expect(spokenNumber("seven")).toBe(7);
    expect(spokenNumber("#3")).toBe(3);
    expect(spokenNumber("forty two")).toBe(42);
    expect(spokenNumber("sign in")).toBeNull();
    expect(spokenUrl("git hub.com")).toBe("https://github.com");
    expect(spokenUrl("peguin dot co slash account")).toBe("https://peguin.co/account");
    expect(spokenUrl("the moon")).toBeNull();
  });
  it("search addresses with or without %s", () => {
    expect(searchUrl("https://www.google.com/search?q=%s", "a b")).toBe("https://www.google.com/search?q=a%20b");
    expect(searchUrl("https://duckduckgo.com/?q=", "x&y")).toBe("https://duckduckgo.com/?q=x%26y");
  });
  it("captions", () => {
    expect(caption(parse("click sign in"))).toBe("Clicking “sign in”");
    expect(caption(parse("open github.com"))).toBe("Opening github.com");
  });
});

const el = (label: string, role = "AXButton", x = 0): Element => ({ label, role, x, y: 0, w: 100, h: 20 });

describe("matchTarget", () => {
  const screen = [el("Sign in"), el("Sign up"), el("Pricing", "AXLink"), el("Sign in with Google"), el("Download for Mac", "AXLink")];
  it("an exact name wins over longer ones", () => {
    expect(matchTarget("sign in", screen)).toEqual({ element: screen[0] });
    expect(matchTarget("pricing", screen)).toEqual({ element: screen[2] });
  });
  it("a partial name finds the one label containing it", () => {
    expect(matchTarget("download", screen)).toEqual({ element: screen[4] });
    expect(matchTarget("google", screen)).toEqual({ element: screen[3] });
  });
  it("equally good matches come back as choices", () => {
    const two = [el("Reply", "AXButton", 0), el("Reply", "AXButton", 200)];
    expect(matchTarget("reply", two)).toEqual({ choices: two });
  });
  it("a button beats static text with the same name", () => {
    const both = [el("Settings", "AXStaticText"), el("Settings", "AXButton")];
    expect(matchTarget("settings", both)).toEqual({ element: both[1] });
  });
  it("nothing close is null, not a guess", () => {
    expect(matchTarget("billing", screen)).toBeNull();
    expect(labelScore("in", "Sign in with Google")).toBeLessThan(0.8);
  });
  it("clicks land in the middle", () => {
    expect(centre({ x: 10, y: 20, w: 100, h: 40 })).toEqual({ x: 60, y: 40 });
  });
});

describe("whisper on the owner's mic", () => {
  it("the prompt's own words do nothing, and noise words are fillers", () => {
    const primed = commandPrompt("Peguin");
    expect(wake(primed)).toEqual({ command: "open WhatsApp and send hi. Hello there.", called: true });
    expect(parse("hello there.")).toMatchObject({ kind: "unknown" });
    expect(isFiller(primed)).toBe(true);
    expect(isFiller("Thank you.")).toBe(true);
    expect(isFiller(" . ")).toBe(true);
    expect(isFiller("Hey Peguin, scroll down.")).toBe(false);
    expect(isFiller("scroll down")).toBe(false);
  });
});

describe("matchTarget duplicates", () => {
  it("the same button reported inside its row counts once", () => {
    const row = { label: "Today", role: "AXButton", x: 0, y: 0, w: 300, h: 40 };
    const inner = { label: "Today", role: "AXButton", x: 10, y: 5, w: 100, h: 30 };
    expect(matchTarget("today", [row, inner])).toEqual({ element: row });
  });
});

import { glanceTarget, middle, MOUSE_GAP, nextDrift, roamTarget } from "../desktop/src/main/pointer/roam.js";

describe("roaming", () => {
  const screen = { x: 0, y: 25, w: 1440, h: 875 };
  const seq = (...v: number[]) => { let i = 0; return () => v[i++ % v.length]!; };
  it("stays in the middle of the screen and away from the owner's mouse", () => {
    const m = middle(screen);
    for (let i = 0; i < 200; i++) {
      const mouse = { x: Math.random() * 1440, y: 25 + Math.random() * 875 };
      const p = roamTarget(screen, mouse, { x: 720, y: 460 });
      expect(p.x).toBeGreaterThanOrEqual(m.x); expect(p.x).toBeLessThanOrEqual(m.x + m.w);
      expect(p.y).toBeGreaterThanOrEqual(m.y); expect(p.y).toBeLessThanOrEqual(m.y + m.h);
    }
  });
  it("prefers a short drift clear of the mouse, else the spot farthest from it", () => {
    const p = roamTarget(screen, { x: 720, y: 460 }, { x: 900, y: 300 }, seq(0.9, 0.1));
    expect(Math.hypot(p.x - 720, p.y - 460)).toBeGreaterThanOrEqual(MOUSE_GAP);
    // The mouse in the middle of a tiny screen: nothing is clear, so it takes the farthest.
    const tiny = { x: 0, y: 0, w: 400, h: 300 };
    const q = roamTarget(tiny, { x: 200, y: 150 }, { x: 200, y: 150 }, seq(0, 0.5, 1, 1));
    expect(q).toEqual({ x: 300, y: 225 });
  });
  it("looks at the top of the window being worked in, never at a tiny one", () => {
    const win = { x: 100, y: 50, w: 1000, h: 700 };
    const p = glanceTarget(win, { x: 1400, y: 880 }, seq(0.5))!;
    expect(p).toEqual({ x: 600, y: 130 });
    expect(glanceTarget({ x: 0, y: 0, w: 150, h: 100 }, { x: 900, y: 900 })).toBeNull();
    expect(glanceTarget(null, { x: 0, y: 0 })).toBeNull();
    // The owner's mouse is on the title bar: it doesn't go there.
    expect(glanceTarget(win, { x: 600, y: 130 }, seq(0.5))).toBeNull();
  });
  it("drifts every 7 to 14 seconds", () => {
    expect(nextDrift(seq(0))).toBe(7);
    expect(nextDrift(seq(0.999))).toBeCloseTo(14, 1);
  });
});

import { matchApp, unpad } from "../desktop/src/main/pointer/commands.js";

describe("how people actually ask", () => {
  it("drops polite padding", () => {
    expect(unpad("Can you open Chrome for me?")).toBe("open Chrome");
    expect(unpad("I need you to please scroll down.")).toBe("scroll down.");
    expect(unpad("could you click sign in for me")).toBe("click sign in");
    expect(unpad("type thank you for me")).toBe("type thank you for me"); // typed words stay
  });
  it("finds the command in what was said (real lines from the owner's mic)", () => {
    expect(parse("Can you open Chrome for me?")).toEqual({ kind: "open-app", name: "Chrome" });
    expect(parse("I need you to open the Chrome tab for me, open the Chrome browser for me.")).toEqual({ kind: "open-app", name: "Chrome" });
    expect(parse("Open Chrome browser for me. Can you swipe the screen and go to Chrome?")).toEqual({ kind: "open-app", name: "Chrome" });
    expect(parse("go to Chrome")).toEqual({ kind: "open-app", name: "Chrome" });
    expect(parse("switch to Slack")).toEqual({ kind: "open-app", name: "Slack" });
    expect(parse("please scroll down")).toMatchObject({ kind: "scroll", dir: "down" });
    expect(parse("could you click sign in for me")).toMatchObject({ kind: "click", target: { by: "label", label: "sign in" } });
    expect(parse("type Hello, World!")).toEqual({ kind: "type", text: "Hello, World!" });
    expect(parse("Oh, baby, you're so sweet.")).toMatchObject({ kind: "unknown" });
  });
  it("matches a spoken app name to the installed app", () => {
    const apps = ["Google Chrome", "Google Chrome Canary", "Slack", "Notes", "Visual Studio Code", "Microsoft Teams", "System Settings"];
    expect(matchApp("Chrome", apps)).toBe("Google Chrome");
    expect(matchApp("the Chrome browser", apps)).toBe("Google Chrome");
    expect(matchApp("slack", apps)).toBe("Slack");
    expect(matchApp("teams", apps)).toBe("Microsoft Teams");
    expect(matchApp("settings", apps)).toBe("System Settings");
    expect(matchApp("notez", apps)).toBe("Notes");
    expect(matchApp("moon", apps)).toBeNull();
  });
});

import { drivePrompt, MAX_STEPS, observe, readStep, stepLine, type Seen } from "../desktop/src/main/pointer/drive.js";

describe("Smart drive", () => {
  const seen: Seen[] = [
    { label: "Sign in", role: "AXButton", x: 0, y: 0, w: 80, h: 20, area: "window" },
    { label: "File", role: "AXMenuBarItem", x: 0, y: 0, w: 30, h: 20, area: "menu" },
    { label: "Music", role: "AXDockItem", x: 600, y: 860, w: 50, h: 50, area: "dock" },
    { label: "", role: "AXImage", x: 0, y: 0, w: 10, h: 10, area: "window" },
  ];
  it("numbers what's on screen, Dock first, and leaves out things with no name", () => {
    const { list, byId } = observe(seen);
    expect(list.split("\n")).toEqual([
      '[1] dock DockItem "Music" at 625,885',
      '[2] window Button "Sign in" at 40,10',
      '[3] menu MenuBarItem "File" at 15,10',
    ]);
    expect(byId.get(1)!.label).toBe("Music");
  });
  it("tells the AI to work visibly, one step at a time, and never to send or buy on its own", () => {
    const p = drivePrompt("open music", "Finder", "[1] dock ...", ["clicked “Finder”"]);
    expect(p).toMatch(/click it in the Dock/);
    expect(p).toMatch(/Never send, post, delete, buy/);
    expect(p).toMatch(/1\. clicked “Finder”/);
    expect(p).toMatch(/first chat or contact/i);
    expect(p).toMatch(/aye.*hi/i);
    expect(p).toMatch(/Ask at most once/);
    expect(MAX_STEPS).toBe(12);
  });

describe("softenSpeech", () => {
  it("turns common whisper garbles of hi into hi", () => {
    expect(softenSpeech("Send aye.")).toBe("Send hi.");
    expect(softenSpeech("Send I to Basao")).toBe("Send hi to Basao");
    expect(softenSpeech("Say I to her")).toBe("Say hi to her");
    expect(softenSpeech("message saying I")).toBe("message saying hi");
    expect(softenSpeech("aye")).toBe("hi");
    expect(softenSpeech("open WhatsApp")).toBe("open WhatsApp");
  });
});

describe("screenshot command", () => {
  it("parses take a screenshot without going through the AI", () => {
    expect(parse("take a screenshot")).toEqual({ kind: "screenshot", of: "screen" });
    expect(parse("screenshot of WhatsApp")).toEqual({ kind: "screenshot", of: "window" });
    expect(parse("capture the screen")).toEqual({ kind: "screenshot", of: "screen" });
  });
  it("reads the AI screenshot step", () => {
    expect(readStep('{"action":"screenshot","of":"window","why":"Capturing WhatsApp"}', new Map())).toEqual({
      action: "screenshot", of: "window", why: "Capturing WhatsApp",
    });
  });
});
  it("reads the AI's step leniently but only with ids it was shown", () => {
    const { byId } = observe(seen);
    expect(readStep('```json\n{"action":"click","id":1,"why":"Clicking Music in the Dock"}\n```', byId)).toEqual({ action: "click", id: 1, why: "Clicking Music in the Dock" });
    expect(readStep('{"action":"click","id":42}', byId)).toBeNull();
    expect(readStep('{"action":"key","combo":"cmd+shift+a"}', byId)).toEqual({ action: "key", combo: "cmd+shift+a", why: undefined });
    expect(readStep('{"action":"key","combo":"rm -rf"}', byId)).toBeNull();
    expect(readStep('{"action":"open_url","url":"javascript:alert(1)"}', byId)).toBeNull();
    expect(readStep('{"action":"scroll","dir":"down","id":2}', byId)).toMatchObject({ action: "scroll", dir: "down", id: 2 });
    expect(readStep('Sure! {"action":"done","say":"Music is open"}', byId)).toEqual({ action: "done", say: "Music is open" });
    expect(readStep("I can't help with that", byId)).toBeNull();
    expect(stepLine({ action: "click", id: 1 }, byId)).toBe("clicked “Music” in the Dock");
  });
});

import { canType } from "../desktop/src/main/pointer/drive.js";

describe("Smart drive never types blind", () => {
  const field = { label: "Search", role: "AXSearchField", x: 0, y: 0, w: 100, h: 20 };
  const button = { label: "OK", role: "AXButton", x: 0, y: 0, w: 100, h: 20 };
  it("types after clicking a text field, or when something new appeared", () => {
    expect(canType({ action: "click", id: 3 }, field, false)).toBe(true);
    expect(canType({ action: "key", combo: "cmd+l" }, undefined, true)).toBe(true);
  });
  it("refuses when nothing visible was chosen (cmd+space with Spotlight unseen, typing twice, first step)", () => {
    expect(canType({ action: "key", combo: "cmd+space" }, undefined, false)).toBe(false);
    expect(canType({ action: "click", id: 3 }, button, false)).toBe(false);
    expect(canType({ action: "type", text: "x" }, undefined, true)).toBe(false);
    expect(canType(undefined, undefined, true)).toBe(false);
  });
});

import { stuck } from "../desktop/src/main/pointer/drive.js";

describe("Smart drive gives up on a step that does nothing", () => {
  it("stops when the same step comes back on an unchanged screen", () => {
    const open = { action: "open_app" as const, name: "Google Chrome", why: "Opening Chrome" };
    expect(stuck({ ...open, why: "Switching to Chrome" }, open, false)).toBe(true);
    expect(stuck(open, open, true)).toBe(false);
    expect(stuck({ action: "wait" }, { action: "wait" }, false)).toBe(false);
    expect(stuck(open, undefined, false)).toBe(false);
  });
});

describe("from a real session (2026-10-21)", () => {
  it("closes an app locally, never as 'done' while it's still open", () => {
    expect(parse("close music")).toEqual({ kind: "quit-app", name: "music" });
    expect(parse("close the music up")).toEqual({ kind: "quit-app", name: "music" });
    expect(parse("quit Spotify")).toEqual({ kind: "quit-app", name: "spotify" });
    expect(caption({ kind: "quit-app", name: "Music" })).toBe("Quitting Music");
  });
  it("leaves tabs, windows and 'close it' to their own commands", () => {
    expect(parse("close the tab")).toMatchObject({ kind: "key", combo: "cmd+w" });
    expect(parse("close the window")).toMatchObject({ kind: "key", combo: "cmd+shift+w" });
    expect(parse("close it").kind).not.toBe("quit-app");
  });
  it("hears the name said twice as the name once", () => {
    expect(wake("Hey Peguin. Hey Peguin.")).toEqual({ armed: true });
    expect(wake("Hey Peguin. Hey Peguin, open Music")).toEqual({ command: "open Music", called: true });
  });
  it("drops whisper's loops on noise", () => {
    expect(isFiller("Oh, oh, oh, oh, oh")).toBe(true);
    expect(isFiller("Hey, hey, hey, hey, hey.")).toBe(true);
    expect(isFiller("open music")).toBe(false);
    expect(isFiller("go go go to the dashboard")).toBe(false);
  });
  it("shows an open menu's items first, so Quit can be clicked", () => {
    const el = (label: string, role: string, area: Seen["area"]): Seen => ({ label, role, x: 0, y: 0, w: 10, h: 10, area });
    const { list } = observe([el("Music", "AXDockItem", "dock"), el("Play", "AXButton", "window"), el("File", "AXMenuBarItem", "menu"), el("Quit Music", "AXMenuItem", "menu")]);
    expect(list.split("\n")[0]).toContain("Quit Music");
  });
  it("reads a quit_app step", () => {
    const s = readStep('{"action":"quit_app","name":"Music","why":"Quitting Music"}', new Map());
    expect(s).toEqual({ action: "quit_app", name: "Music", why: "Quitting Music" });
    expect(stepLine(s!, new Map())).toBe("quit Music");
    expect(drivePrompt("close music", "Music", "", [])).toContain("quit_app");
  });
});

import { closeScript, listScript, readTabs, site, switchScript } from "../desktop/src/main/pointer/tabs.js";
import { listTabs } from "../desktop/src/main/pointer/drive.js";

describe("browser tabs", () => {
  const out = "1\t1\tfalse\tInbox (3) - me@example.com - Gmail\thttps://mail.google.com/mail/u/0/#inbox\n1\t2\ttrue\tWelcome | Heroku\thttps://www.heroku.com/\n";
  const tabs = readTabs("Google Chrome", out);
  it("reads the browser's tab list", () => {
    expect(tabs).toHaveLength(2);
    expect(tabs[1]).toMatchObject({ browser: "Google Chrome", w: 1, t: 2, active: true, title: "Welcome | Heroku" });
    expect(site(tabs[0]!.url)).toBe("mail.google.com");
  });
  it("never uses 'tab' as the separator inside the browser's tell block", () => {
    expect(listScript("Google Chrome")).toContain("set sep to character id 9");
    expect(listScript("Google Chrome")).not.toMatch(/& tab &/);
    expect(listScript("Safari")).toContain("current tab of w");
  });
  it("closes and switches the exact tab", () => {
    expect(closeScript(tabs[0]!)).toBe('tell application "Google Chrome" to close tab 1 of window 1');
    expect(switchScript(tabs[0]!)).toContain("set active tab index of window 1 to 1");
    expect(switchScript({ ...tabs[0]!, browser: "Safari" })).toContain("set current tab of window 1 to tab 1 of window 1");
  });
  it("gives the AI the tabs, and takes close_tab only for a tab it was shown", () => {
    const { list, byId } = listTabs(tabs);
    expect(list).toContain('[t1] Google Chrome, window 1: "Inbox (3)');
    expect(list).toContain("(showing)");
    const prompt = drivePrompt("close my gmail on the", "Google Chrome", "", [], { tabs, apps: ["Google Chrome"], earlier: ["“open chrome”: Opening Google Chrome"] });
    expect(prompt).toContain("close_tab");
    expect(prompt).toContain("mail.google.com");
    expect(prompt).toContain("Earlier requests");
    expect(readStep('{"action":"close_tab","tab":"t1","why":"Closing Gmail"}', new Map(), byId)).toEqual({ action: "close_tab", tab: "t1", why: "Closing Gmail" });
    expect(readStep('{"action":"close_tab","tab":"t9"}', new Map(), byId)).toBeNull();
    expect(stepLine({ action: "close_tab", tab: "t1" }, new Map(), byId)).toContain("Gmail");
  });
  it("can ask the owner instead of guessing", () => {
    expect(readStep('{"action":"ask","question":"Which video?"}', new Map())).toEqual({ action: "ask", question: "Which video?" });
  });
});

import { finishes } from "../desktop/src/main/pointer/drive.js";

describe("Smart drive stops after closing what was asked", () => {
  it("ends the request after one close or quit", () => {
    expect(finishes({ action: "close_tab", tab: "t1" }, "close my example site in chrome")).toBe(true);
    expect(finishes({ action: "quit_app", name: "Music" }, "close the music")).toBe(true);
    expect(finishes({ action: "close_tab", tab: "t1" }, "close my example site\n(You asked “Which one?” and heard: “the first”. If that doesn't make sense, stop and say so.)")).toBe(true);
    expect(finishes({ action: "close_tab", tab: "t1" }, "close my example site\n(You asked “Which one?” and heard: “all of them”. If that doesn't make sense, stop and say so.)")).toBe(false);
  });
  it("keeps going when more than one thing was asked", () => {
    expect(finishes({ action: "close_tab", tab: "t1" }, "close all my github tabs")).toBe(false);
    expect(finishes({ action: "close_tab", tab: "t1" }, "close gmail and quit music")).toBe(false);
  });
  it("never ends on other steps", () => {
    expect(finishes({ action: "click", id: 1 }, "close gmail")).toBe(false);
  });
});

import { dockLabel } from "../desktop/src/main/pointer/commands.js";

describe("finding an app in the Dock", () => {
  it("matches the Dock's own name for the app", () => {
    const dock = ["Finder", "Google Chrome", "iTerm2", "Visual Studio Code", "Calculator"];
    expect(dockLabel("iTerm", dock)).toBe("iTerm2");
    expect(dockLabel("Calculator", dock)).toBe("Calculator");
    expect(dockLabel("Google Chrome", dock)).toBe("Google Chrome");
    expect(dockLabel("Music", dock)).toBeUndefined();
  });
});

import { fragment } from "../desktop/src/main/pointer/commands.js";

describe("after “Hey Peguin”, a scrap isn't the request (2026-10-21 log)", () => {
  it("waits on cut-off words and lone non-commands", () => {
    expect(fragment("I'm...")).toBe(true);
    expect(fragment("So")).toBe(true);
    expect(fragment("Do it is some-")).toBe(true);
  });
  it("takes real requests", () => {
    expect(fragment("close my Gmail tab")).toBe(false);
    expect(fragment("open music")).toBe(false);
  });
});

describe("just “Hey” (the owner's choice)", () => {
  it("wakes on Hey alone, marked bare so it's treated with care", () => {
    expect(wake("Hey!", ["Peguin"], true)).toEqual({ armed: true, bare: true });
    expect(wake("Hey, open Music.", ["Peguin"], true)).toEqual({ command: "open Music.", called: true, bare: true });
    expect(wake("Hey, can you close my Gmail tab?", ["Peguin"], true)).toEqual({ command: "close my Gmail tab?", called: true, bare: true });
  });
  it("still prefers the name, which isn't bare", () => {
    expect(wake("Hey Peguin, close tab", ["Peguin"], true)).toEqual({ command: "close tab", called: true });
  });
  it("does nothing with Hey unless chosen", () => {
    expect(wake("Hey!", ["Peguin"])).toBeNull();
    expect(wake("Hey, open Music.", ["Peguin"])).toBeNull();
  });
  it("needs Hey at the start, not in the middle", () => {
    expect(wake("I said hey to him", ["Peguin"], true)).toBeNull();
    expect(wake("Hello there", ["Peguin"], true)).toBeNull();
  });
  it("whisper's noise loop is dropped before it can wake anything", () => {
    expect(isFiller("Hey, hey, hey")).toBe(true);
  });
});

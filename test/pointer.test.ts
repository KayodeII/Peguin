import { describe, expect, it } from "vitest";
import { centre, commandPrompt, describe as caption, isFiller, labelScore, matchTarget, parse, searchUrl, spokenNumber, spokenUrl, wake, type Element } from "../desktop/src/main/pointer/commands.js";

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
    expect(parse("go to the moon")).toMatchObject({ kind: "unknown" });
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
    expect(wake(commandPrompt("Peguin"))).toEqual({ command: "hello there.", called: true });
    expect(parse("hello there.")).toMatchObject({ kind: "unknown" });
    expect(isFiller("Hey Peguin, hello there.")).toBe(true);
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

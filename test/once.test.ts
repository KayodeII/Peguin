import { describe, expect, it } from "vitest";
import { onePerMeeting } from "../desktop/src/main/once.js";

describe("one Peguin per meeting", () => {
  const setup = () => {
    const opened: string[] = [];
    let current: string | undefined;
    const finish: (() => void)[] = [];
    const join = onePerMeeting((url) => { opened.push(url); return new Promise<void>((r) => finish.push(() => { current = url; r(); })); }, () => current);
    return { join, opened, done: () => finish.shift()?.() };
  };
  const tick = () => new Promise((r) => setTimeout(r, 0));

  it("joins once however many times Send is clicked", async () => {
    const t = setup();
    const a = t.join("meet/abc"), b = t.join("meet/abc");
    await tick();
    t.done();
    await Promise.all([a, b]);
    await t.join("meet/abc"); // already in it
    expect(t.opened).toEqual(["meet/abc"]);
  });

  it("a different link waits for the one joining, then goes ahead", async () => {
    const t = setup();
    const a = t.join("meet/abc"), b = t.join("meet/xyz");
    await tick();
    expect(t.opened).toEqual(["meet/abc"]);
    t.done(); await a; await tick();
    expect(t.opened).toEqual(["meet/abc", "meet/xyz"]);
    t.done(); await b;
  });

  it("can try again after a join fails", async () => {
    let calls = 0;
    const join = onePerMeeting(async () => { calls++; if (calls === 1) throw new Error("no"); }, () => undefined);
    await expect(join("meet/abc")).rejects.toThrow("no");
    await join("meet/abc");
    expect(calls).toBe(2);
  });
});

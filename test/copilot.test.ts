import { describe, expect, it, vi } from "vitest";

// session.ts resolves electron from desktop/node_modules, so mock that path too.
const fake = vi.hoisted(() => {
  class BrowserWindow {
    static made: BrowserWindow[] = [];
    protectedFromCapture = false;
    webContents = { send: () => {} };
    constructor() { BrowserWindow.made.push(this); }
    setContentProtection(on: boolean) { this.protectedFromCapture = on; }
    isDestroyed() { return false; }
    destroy() {}
    on() {}
    loadFile() { return Promise.resolve(); }
  }
  return {
    app: { getPath: () => "/tmp/peguin-test", isPackaged: true, getAppPath: () => "/tmp" },
    BrowserWindow, WebContentsView: class {},
    ipcMain: { on: () => {}, removeListener: () => {} },
    safeStorage: { isEncryptionAvailable: () => false },
  };
});
vi.mock("electron", () => fake);
vi.mock("../desktop/node_modules/electron/index.js", () => fake);

const { CopilotSession, AI_NOTICE } = await import("../desktop/src/main/copilot/session.js");
const { Settings } = await import("../desktop/src/main/settings.js");

type Card = { id: number; question: string; answer?: string; error?: string };

describe("copilot suggestions", () => {
  it("answers questions in order and never leaves one stuck thinking", async () => {
    const asked: string[] = [];
    const session = new CopilotSession("https://meet.google.com/abc-defg-hij", Settings.parse({ displayName: "Ada" }), { url: "", stop: () => {} },
      {
        draft: null,
        suggest: async (q: string) => { asked.push(q); await new Promise((r) => setTimeout(r, 5)); return `General knowledge: about ${q}`; },
        online: () => null,
      },
      { file: "" }, () => {});
    const heard = (t: string) => (session as unknown as { heard: (t: string) => void }).heard(t);
    for (const q of ["What is a mutex?", "What is a semaphore?", "What is a deadlock?", "What is a livelock?", "What is starvation?"]) heard(q);
    await vi.waitFor(() => expect(asked.length).toBe(4), { timeout: 2000 });
    await new Promise((r) => setTimeout(r, 20));
    const cards = session.state().cards as Card[];
    expect(cards).toHaveLength(5);
    expect(cards.every((c) => c.answer || c.error)).toBe(true);
    // The first is answered at once; of the four that waited, only the oldest was dropped.
    expect(asked).toEqual(["What is a mutex?", "What is a deadlock?", "What is a livelock?", "What is starvation?"]);
    expect(cards.find((c) => c.question === "What is a semaphore?")?.error).toContain("Skipped");
  });
});

describe("copilot AI notice", () => {
  const make = (post: (text: string) => Promise<void>) => {
    const session = new CopilotSession("https://meet.google.com/abc-defg-hij", Settings.parse({ displayName: "Ada" }), { url: "", stop: () => {} },
      { draft: null, suggest: async () => "", online: () => null }, { file: "x.html" }, () => {});
    const s = session as unknown as { postNotice: typeof post; win: unknown; relayout: () => void };
    s.postNotice = post;
    s.win = { isDestroyed: () => false, webContents: { send: () => {} }, getPosition: () => [0, 0], getSize: () => [1440, 900] };
    return session;
  };
  const windows = () => fake.BrowserWindow.made;

  it("hides the popped-out notes from capture only after the notice is in the chat", async () => {
    const posted: string[] = [];
    let confirm = () => {};
    const session = make((text) => { posted.push(text); return new Promise((r) => { confirm = r; }); });
    session.popOut(true);
    const notes = windows().at(-1)!;
    await new Promise((r) => setTimeout(r, 5));
    expect(notes.protectedFromCapture).toBe(false);
    confirm();
    await vi.waitFor(() => expect(notes.protectedFromCapture).toBe(true));
    expect(posted).toEqual([AI_NOTICE]);
    expect(AI_NOTICE).toMatch(/AI assistant/);
    // Once per meeting: docking and popping out again doesn't post it twice.
    session.popOut(false);
    session.popOut(true);
    await vi.waitFor(() => expect(windows().at(-1)!.protectedFromCapture).toBe(true));
    expect(posted).toHaveLength(1);
  });

  it("leaves the notes visible in shares when the notice can't be posted, and retries next time", async () => {
    let fail = true;
    const session = make(async () => { if (fail) throw new Error("no chat"); });
    session.popOut(true);
    const notes = windows().at(-1)!;
    await vi.waitFor(() => expect(session.state().status?.detail).toContain("Couldn't post the AI notice"));
    expect(notes.protectedFromCapture).toBe(false);
    fail = false;
    expect(await session.disclose()).toBe(true);
  });
});

describe("copilot leave", () => {
  it("hangs up in the meeting before closing the window, once", async () => {
    const order: string[] = [];
    let ended = 0;
    const session = new CopilotSession("https://meet.google.com/abc-defg-hij", Settings.parse({ displayName: "Ada" }), { url: "", stop: () => {} },
      { draft: null, suggest: async () => "", online: () => null }, { file: "x.html" }, () => { ended++; });
    let hungUp = () => {};
    const s = session as unknown as { hangUp: () => Promise<void>; win: unknown };
    s.hangUp = () => { order.push("hang up"); return new Promise((r) => { hungUp = r; }); };
    s.win = { isDestroyed: () => false, destroy: () => order.push("close window"), webContents: { send: () => {} } };
    const first = session.stop();
    const second = session.stop();
    await new Promise((r) => setTimeout(r, 5));
    expect(order).toEqual(["hang up"]);
    hungUp();
    await Promise.all([first, second]);
    expect(order).toEqual(["hang up", "close window"]);
    expect(ended).toBe(1);
  });
});

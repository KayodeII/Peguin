// Voice control: "Hey Peguin, ..." from the owner's own mic, heard on this Mac
// by whisper, turned into an action (commands.ts) and carried out with the Swift
// helper (native/pointer.swift). A see-through window over every display shows
// Peguin's cursor travelling to what it clicks, a caption, numbered badges and
// drawings. No AI and no screenshots: buttons are found by name through the
// Mac's accessibility tree, like macOS Voice Control.
import { BrowserWindow, globalShortcut, ipcMain, screen, shell, systemPreferences, type IpcMainEvent } from "electron";
import { execFile, spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { createInterface } from "node:readline";
import path from "node:path";
import { outDir, pointerHelperPath } from "../paths.js";
import type { Settings } from "../settings.js";
import { createListener, type Whisper } from "../speech/whisper.js";
import { centre, commandPrompt, describe, Echo, isFiller, matchTarget, parse, searchUrl, wake, type Action, type Element, type Shape, type Target } from "./commands.js";

/** What the copilot hears from the meeting; a matching "Hey Peguin" from the mic came out of the speakers. */
export const echo = new Echo();

/** While the copilot is in a meeting, wait this long for its transcript before acting, so the echo check can see it. */
const ECHO_WAIT_MS = 1800;
/** After "Hey Peguin" alone (or the shortcut), the next line is the command. */
const ARMED_MS = 6000;
const GLIDE_MS = 260;
/** The overlay records at 24 kHz: whisper gets it at 16 kHz, Learn my voice keeps the full quality. */
const MIC_RATE = 24000;

type Rect = { x: number; y: number; w: number; h: number };
export type OverlayEvent =
  | { kind: "origin"; x: number; y: number; mic: boolean }
  | { kind: "glide"; from: { x: number; y: number }; x: number; y: number; ring: Rect | null }
  | { kind: "caption"; text: string; tone: "info" | "warn"; x: number; y: number }
  | { kind: "listening"; on: boolean; x: number; y: number }
  | { kind: "numbers"; items: (Rect & { n: number })[] }
  | { kind: "shape"; shape: Shape; rect: Rect }
  | { kind: "pen"; on: boolean }
  | { kind: "clear" };

export type PointerStatus = {
  on: boolean;
  /** Accessibility permission (clicks, typing, reading buttons). */
  trusted: boolean;
  mic: "granted" | "denied" | "not-determined" | "restricted" | "unknown";
  helper: boolean;
  last?: { heard: string; did: string; at: number };
  error?: string;
};

type Reply = { ok: boolean; error?: string; [k: string]: unknown };

/** The Swift helper, kept running; one JSON line per request. */
export class Helper {
  private proc: ChildProcess | null = null;
  private waiting = new Map<number, (r: Reply) => void>();
  private id = 0;

  private start() {
    const p = spawn(pointerHelperPath(), [], { stdio: ["pipe", "pipe", "ignore"] });
    p.on("error", () => {});
    p.on("exit", () => {
      if (this.proc === p) this.proc = null;
      for (const r of this.waiting.values()) r({ ok: false, error: "The voice control helper stopped." });
      this.waiting.clear();
    });
    createInterface({ input: p.stdout! }).on("line", (line) => {
      let r: Reply & { id?: number };
      try { r = JSON.parse(line); } catch { return; }
      const done = this.waiting.get(r.id ?? -1);
      if (done) { this.waiting.delete(r.id!); done(r); }
    });
    this.proc = p;
    return p;
  }

  async call<T extends Record<string, unknown> = Record<string, never>>(cmd: string, args: Record<string, unknown> = {}): Promise<T> {
    const p = this.proc ?? this.start();
    const id = ++this.id;
    const reply = await new Promise<Reply>((resolve) => {
      this.waiting.set(id, resolve);
      p.stdin!.write(`${JSON.stringify({ id, cmd, ...args })}\n`);
      setTimeout(() => { if (this.waiting.delete(id)) resolve({ ok: false, error: "The voice control helper didn't answer." }); }, 8000);
    });
    if (!reply.ok) throw new Error(reply.error ?? "The voice control helper failed.");
    return reply as unknown as T;
  }

  stop() { this.proc?.kill(); this.proc = null; }
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const rectOf = (e: Element): Rect => ({ x: e.x, y: e.y, w: e.w, h: e.h });
const pad = (r: Rect, n: number): Rect => ({ x: r.x - n, y: r.y - n, w: r.w + 2 * n, h: r.h + 2 * n });

export class VoiceControl {
  private helper = new Helper();
  private overlays = new Map<number, BrowserWindow>();
  private listen: ((chunk: ArrayBuffer) => void) | null = null;
  private armedUntil = 0;
  private numbered: Element[] = [];
  private penWindow: BrowserWindow | null = null;
  private shortcut = "";
  private running = false;
  private queue = Promise.resolve();
  private detach: (() => void)[] = [];
  private lastStatus: PointerStatus = { on: false, trusted: false, mic: "unknown", helper: false };

  constructor(
    private settings: () => Settings,
    private whisper: () => Promise<Whisper>,
    private page: { url?: string; file?: string },
    private copilotLive: () => boolean,
    private report: (s: PointerStatus) => void,
    /** The owner talking, not to Peguin (for Learn my voice, which decides whether to keep it). */
    private talk?: (pcm: Buffer, rate: number, text: string) => void,
  ) {}

  async status(): Promise<PointerStatus> {
    const helper = existsSync(pointerHelperPath());
    const trusted = helper ? await this.helper.call<{ trusted: boolean }>("status").then((r) => r.trusted, () => false) : false;
    const mic = process.platform === "darwin" ? systemPreferences.getMediaAccessStatus("microphone") : "granted";
    this.lastStatus = { ...this.lastStatus, on: this.running, trusted, mic, helper };
    return this.lastStatus;
  }

  private update(patch: Partial<PointerStatus>) {
    this.lastStatus = { ...this.lastStatus, ...patch };
    this.report(this.lastStatus);
  }

  /** Asks macOS for Accessibility (the owner switches Peguin on in System Settings). */
  async requestAccess(): Promise<PointerStatus> {
    await this.helper.call("request").catch(() => {});
    void shell.openExternal("x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility");
    return this.status();
  }

  async start() {
    if (this.running) return this.status();
    if (!existsSync(pointerHelperPath())) throw new Error("Voice control is missing from this install. Reinstall Peguin, or run `npm run setup:pointer` in desktop/.");
    if (process.platform === "darwin" && !(await systemPreferences.askForMediaAccess("microphone"))) {
      throw new Error("Peguin needs your microphone to hear “Hey Peguin”. Allow it in System Settings > Privacy & Security > Microphone.");
    }
    const w = await this.whisper();
    const s = this.settings();
    this.listen = createListener({
      whisperUrl: w.url,
      names: [s.displayName || "the owner"],
      prompt: () => commandPrompt(this.settings().pointer.wakeWords[0] ?? "Peguin"),
      endSilenceMs: 600, // commands are short; answer quickly
      rate: MIC_RATE,
      onUtterance: ({ text, pcm }) => this.heard(text, pcm),
      onError: (e) => this.update({ error: `Speech recognition error: ${message(e)}` }),
    });
    this.running = true;
    this.openOverlays();
    const rebuild = () => { if (this.running) { this.closeOverlays(); this.openOverlays(); } };
    screen.on("display-added", rebuild);
    screen.on("display-removed", rebuild);
    screen.on("display-metrics-changed", rebuild);
    this.detach.push(() => { screen.removeListener("display-added", rebuild); screen.removeListener("display-removed", rebuild); screen.removeListener("display-metrics-changed", rebuild); });
    this.bindShortcut();
    const st = await this.status();
    this.update({ ...st, error: st.trusted ? undefined : "Allow Peguin under Accessibility so it can click and type." });
    return this.lastStatus;
  }

  async stop() {
    this.running = false;
    this.listen = null;
    if (this.shortcut) globalShortcut.unregister(this.shortcut);
    this.shortcut = "";
    for (const d of this.detach.splice(0)) d();
    this.closeOverlays();
    this.helper.stop();
    this.update({ on: false });
  }

  /** The shortcut (Settings) arms one command without the wake phrase. */
  bindShortcut() {
    if (this.shortcut) globalShortcut.unregister(this.shortcut);
    this.shortcut = "";
    const acc = this.settings().pointer.shortcut;
    if (!acc || !this.running) return;
    try {
      if (globalShortcut.register(acc, () => this.arm())) this.shortcut = acc;
      else this.update({ error: `${acc} is taken by another app. Pick a different shortcut in Settings.` });
    } catch {
      this.update({ error: `“${acc}” isn't a shortcut Peguin understands. Try Control+Alt+Space.` });
    }
  }

  private async arm() {
    this.armedUntil = Date.now() + ARMED_MS;
    const p = await this.cursor();
    this.send(p, { kind: "listening", on: true, ...p });
    setTimeout(() => { if (Date.now() >= this.armedUntil) void this.cursor().then((q) => this.send(q, { kind: "listening", on: false, ...q })); }, ARMED_MS + 50);
  }

  // MARK: overlay windows

  private openOverlays() {
    const primary = screen.getPrimaryDisplay().id;
    for (const d of screen.getAllDisplays()) {
      const b = d.bounds;
      const win = new BrowserWindow({
        x: b.x, y: b.y, width: b.width, height: b.height, show: false, frame: false, transparent: true, hasShadow: false,
        focusable: false, resizable: false, movable: false, minimizable: false, maximizable: false, fullscreenable: false,
        skipTaskbar: true, enableLargerThanScreen: true, roundedCorners: false, backgroundColor: "#00000000",
        webPreferences: { preload: path.join(outDir, "preload/pointer.cjs"), sandbox: true, contextIsolation: true, backgroundThrottling: false },
      });
      win.setAlwaysOnTop(true, "screen-saver");
      win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
      win.setIgnoreMouseEvents(true);
      if (this.page.url) void win.loadURL(`${this.page.url}#pointer`);
      else void win.loadFile(this.page.file!, { hash: "pointer" });
      // Only the primary display's window listens to the mic.
      win.webContents.once("did-finish-load", () => {
        win.webContents.send("pointer:event", { kind: "origin", x: b.x, y: b.y, mic: d.id === primary } satisfies OverlayEvent);
        win.showInactive();
      });
      this.overlays.set(d.id, win);
    }
    const on = (channel: string, fn: (e: IpcMainEvent, ...a: any[]) => void) => {
      const h = (e: IpcMainEvent, ...a: any[]) => { if ([...this.overlays.values()].some((w) => w.webContents === e.sender)) fn(e, ...a); };
      ipcMain.on(channel, h);
      this.detach.push(() => ipcMain.removeListener(channel, h));
    };
    on("pointer:pcm", (_e, buf: ArrayBuffer) => this.listen?.(buf));
    on("pointer:mic-error", (_e, why: string) => this.update({ error: `Can't hear your microphone (${String(why)}).` }));
    on("pointer:pen-done", () => this.penOff());
  }

  private closeOverlays() {
    for (const w of this.overlays.values()) if (!w.isDestroyed()) w.destroy();
    this.overlays.clear();
    this.penWindow = null;
    this.numbered = [];
  }

  private windowAt(p: { x: number; y: number }) {
    return this.overlays.get(screen.getDisplayNearestPoint(p).id);
  }

  private send(p: { x: number; y: number }, e: OverlayEvent) {
    const w = this.windowAt(p);
    if (w && !w.isDestroyed()) w.webContents.send("pointer:event", e);
  }

  private all(e: OverlayEvent) {
    for (const w of this.overlays.values()) if (!w.isDestroyed()) w.webContents.send("pointer:event", e);
  }

  private async cursor() {
    return this.helper.call<{ x: number; y: number }>("cursor").catch(() => screen.getCursorScreenPoint());
  }

  private async caption(text: string, tone: "info" | "warn" = "info", at?: { x: number; y: number }) {
    const p = at ?? await this.cursor();
    this.send(p, { kind: "caption", text, tone, ...p });
  }

  // MARK: hearing

  private heard(text: string, pcm?: Buffer) {
    if (!this.running) return;
    const now = Date.now();
    const armed = now < this.armedUntil;
    const names = this.settings().pointer.wakeWords;
    if (isFiller(text, names[0])) return;
    const h = wake(text, names);
    if (h && "armed" in h) { void this.arm(); return; }
    const command = h ? h.command : armed ? text : null;
    if (!command) {
      // Not for Peguin: dropped, unless Learn my voice keeps it as a clip for the owner to review.
      // Never during a call, when the mic can pick up the meeting from the speakers.
      if (pcm && !this.copilotLive()) this.talk?.(pcm, MIC_RATE, text);
      return;
    }
    const action = parse(command);
    // A bare "Peguin ..." only counts when it's a known command.
    if (action.kind === "unknown" && h && !h.called && !armed) return;
    this.armedUntil = 0;
    void this.cursor().then((p) => this.send(p, { kind: "listening", on: false, ...p }));
    this.queue = this.queue.then(async () => {
      if (this.copilotLive()) {
        await sleep(ECHO_WAIT_MS);
        if (echo.heard(text, Date.now())) { this.update({ last: { heard: text, did: "Ignored: it came from the meeting", at: Date.now() } }); return; }
      }
      await this.run(action, text);
    }).catch((e) => void this.caption(message(e), "warn"));
  }

  // MARK: doing

  /** Runs one action now (also used by Settings' "Try it"). */
  async run(a: Action, heard = "") {
    const did = describe(a);
    this.update({ last: { heard, did, at: Date.now() }, error: undefined });
    const needsHands = !["open-url", "search", "open-app", "clear", "stop", "unknown", "draw"].includes(a.kind) || (a.kind === "draw" && a.target.by !== "cursor");
    if (needsHands && !(await this.status()).trusted) {
      await this.caption("Peguin needs Accessibility to do that. Turn it on in Settings > Voice control.", "warn");
      return;
    }
    switch (a.kind) {
      case "click": {
        const p = await this.locate(a.target, a.kind);
        if (!p) return;
        await this.glide(p.point, p.rect, did);
        await this.helper.call("click", { ...p.point, button: a.button, count: a.count, ms: 0 });
        this.numbersOff();
        return;
      }
      case "point": {
        const p = await this.locate(a.target, a.kind);
        if (p) { await this.glide(p.point, p.rect, did); await this.helper.call("move", { ...p.point, ms: 0 }); }
        return;
      }
      case "scroll": {
        const n = a.dir === "up" || a.dir === "left" ? a.amount : -a.amount;
        await this.caption(did);
        await this.helper.call("scroll", a.dir === "up" || a.dir === "down" ? { dy: n, dx: 0 } : { dx: n, dy: 0 });
        return;
      }
      case "type": await this.caption(did); await this.helper.call("type", { text: a.text }); return;
      case "key": await this.caption(did); await this.helper.call("key", { combo: a.combo }); return;
      case "find":
        await this.caption(did);
        await this.helper.call("key", { combo: "cmd+f" });
        await sleep(200);
        await this.helper.call("type", { text: a.text });
        return;
      case "open-url": await this.caption(did); await shell.openExternal(a.url); return;
      case "search": await this.caption(did); await shell.openExternal(searchUrl(this.settings().pointer.searchUrl, a.query)); return;
      case "open-app":
        await this.caption(did);
        await new Promise<void>((resolve, reject) => execFile("open", ["-a", a.name], (e) => (e ? reject(new Error(`I couldn't find an app called “${a.name}”.`)) : resolve())));
        return;
      case "browser": {
        const r = await this.helper.call<{ name: string }>("browser");
        await this.caption(r.name ? `Opening ${r.name}` : did);
        return;
      }
      case "numbers": return a.on ? this.numbersOn() : this.numbersOff();
      case "draw": {
        if (a.shape === "pen") return this.penOn(did);
        let rect: Rect;
        if (a.target.by === "cursor") {
          const c = await this.cursor();
          rect = a.shape === "underline" ? { x: c.x - 90, y: c.y + 4, w: 180, h: 10 } : a.shape === "arrow" ? { x: c.x - 150, y: c.y - 110, w: 150, h: 110 } : { x: c.x - 110, y: c.y - 55, w: 220, h: 110 };
        } else {
          const p = await this.locate(a.target, a.kind);
          if (!p?.rect) return;
          rect = a.shape === "arrow" ? { x: p.rect.x - 150, y: p.rect.y - 110, w: 150, h: 110 + p.rect.h / 2 } : pad(p.rect, a.shape === "underline" ? 0 : 8);
        }
        this.send({ x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 }, { kind: "shape", shape: a.shape, rect });
        this.numbersOff();
        return;
      }
      case "clear": this.all({ kind: "clear" }); this.numbered = []; return;
      case "stop": this.penOff(); this.numbersOff(); this.armedUntil = 0; await this.caption(did); return;
      case "unknown": await this.caption(`${did}. Try “click …”, “scroll down”, “open …”, “show numbers” or “draw a circle”.`, "warn"); return;
    }
  }

  /** Where a target is on screen; says why when it can't be found. */
  private async locate(t: Target, verb: string): Promise<{ point: { x: number; y: number }; rect: Rect | null } | null> {
    if (t.by === "cursor") return { point: await this.cursor(), rect: null };
    if (t.by === "number") {
      const e = this.numbered[t.n - 1];
      if (!e) { await this.caption(this.numbered.length ? `There's no ${t.n}. Pick 1 to ${this.numbered.length}.` : "Say “Hey Peguin, show numbers” first.", "warn"); return null; }
      return { point: centre(e), rect: rectOf(e) };
    }
    const { elements } = await this.helper.call<{ elements: Element[] }>("targets");
    const m = matchTarget(t.label, elements);
    if (!m) { await this.caption(`I can't see “${t.label}”. Say “show numbers” and pick one.`, "warn"); return null; }
    if ("choices" in m) {
      this.showNumbers(m.choices);
      await this.caption(`There are ${m.choices.length} “${t.label}”. Say “${verb === "draw" ? "circle" : "click"}” and the number.`, "warn");
      return null;
    }
    return { point: centre(m.element), rect: rectOf(m.element) };
  }

  private async glide(to: { x: number; y: number }, ring: Rect | null, caption: string) {
    const from = await this.cursor();
    this.send(from, { kind: "glide", from, x: to.x, y: to.y, ring });
    if (this.windowAt(from) !== this.windowAt(to)) this.send(to, { kind: "glide", from, x: to.x, y: to.y, ring });
    this.send(to, { kind: "caption", text: caption, tone: "info", ...to });
    await this.helper.call("move", { ...to, ms: GLIDE_MS });
  }

  private async numbersOn() {
    const { elements } = await this.helper.call<{ elements: Element[] }>("targets");
    const useful = elements.filter((e) => e.role !== "AXRow" && e.role !== "AXCell" || e.label).slice(0, 99);
    if (!useful.length) { await this.caption("I can't see anything to click in this app.", "warn"); return; }
    this.showNumbers(useful);
    await this.caption(describe({ kind: "numbers", on: true }));
  }

  private showNumbers(list: Element[]) {
    this.numbered = list;
    // Each display gets its own badges; coordinates stay global.
    const byWindow = new Map<BrowserWindow, (Rect & { n: number })[]>();
    list.forEach((e, i) => {
      const w = this.windowAt(centre(e));
      if (w) byWindow.set(w, [...(byWindow.get(w) ?? []), { ...rectOf(e), n: i + 1 }]);
    });
    for (const w of this.overlays.values()) if (!w.isDestroyed()) w.webContents.send("pointer:event", { kind: "numbers", items: byWindow.get(w) ?? [] } satisfies OverlayEvent);
  }

  private numbersOff() {
    if (!this.numbered.length) return;
    this.numbered = [];
    this.all({ kind: "numbers", items: [] });
  }

  /** Freehand: the overlay under the mouse takes the mouse until "done" or Esc. */
  private async penOn(did: string) {
    const p = await this.cursor();
    const w = this.windowAt(p);
    if (!w) return;
    this.penOff();
    this.penWindow = w;
    w.setIgnoreMouseEvents(false);
    w.setFocusable(true);
    w.focus();
    w.webContents.send("pointer:event", { kind: "pen", on: true } satisfies OverlayEvent);
    await this.caption(did);
  }

  private penOff() {
    const w = this.penWindow;
    this.penWindow = null;
    if (!w || w.isDestroyed()) return;
    w.webContents.send("pointer:event", { kind: "pen", on: false } satisfies OverlayEvent);
    w.setIgnoreMouseEvents(true);
    w.setFocusable(false);
    w.blur();
  }
}

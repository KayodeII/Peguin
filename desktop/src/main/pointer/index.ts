// Voice control: "Hey Peguin, ..." from the owner's own mic, heard on this Mac
// by whisper, turned into an action (commands.ts) and carried out with the Swift
// helper (native/pointer.swift). A see-through window over every display shows
// Peguin's cursor travelling to what it clicks, a caption, numbered badges and
// drawings. No AI and no screenshots: buttons are found by name through the
// Mac's accessibility tree, like macOS Voice Control.
import { app, BrowserWindow, globalShortcut, ipcMain, screen, shell, systemPreferences, type IpcMainEvent } from "electron";
import { execFile, spawn, type ChildProcess } from "node:child_process";
import { appendFileSync, existsSync, readdirSync, writeFileSync } from "node:fs";
import { createInterface } from "node:readline";
import path from "node:path";
import { outDir, pointerHelperPath } from "../paths.js";
import type { Settings } from "../settings.js";
import { createListener, type Whisper } from "../speech/whisper.js";
import { glanceTarget, nextDrift, roamTarget } from "./roam.js";
import { canType, drivePrompt, finishes, listTabs, stuck, MAX_STEPS, observe, readStep, screenKey, stepLine, type Seen, type Step } from "./drive.js";
import { BROWSERS, closeScript, listScript, readTabs, switchScript, type Tab } from "./tabs.js";
import { centre, commandPrompt, dockLabel, fragment, matchApp, describe, Echo, isFiller, matchTarget, parse, searchUrl, softenSpeech, wake, type Action, type Element, type Shape, type Target } from "./commands.js";

/** What the copilot hears from the meeting; a matching "Hey Peguin" from the mic came out of the speakers. */
export const echo = new Echo();

/**
 * Done on the spot even in Smart drive: instant, and nothing to work out. Everything
 * else (and opening or quitting an app whose name doesn't match one on this Mac)
 * goes to the owner's AI, which sees the screen, the tabs and the running apps.
 */
const INSTANT = new Set<Action["kind"]>(["scroll", "key", "type", "draw", "clear", "numbers", "screenshot", "stop"]);
/** Told to the AI when the words may not have been for Peguin: after a bare "Hey", or as a follow-up to the last request. */
const UNSURE = {
  greeting: "This may not have been said to Peguin: \"Hey\" is also how the owner greets a person (\"Hey John, …\"). Unless it's clearly a request to do something on this computer, reply {\"action\":\"stop\",\"say\":\"not a request\"}.",
  followUp: (last: string) => `Said without Peguin's name, seconds after the owner's last request (${last}), so it's most likely a follow-up to it: "it" and "that" mean what that request was about. Do it if it makes sense as a follow-up; if it's clearly someone talking about something else, reply {"action":"stop","say":"not a request"}.`,
};

/** How long Peguin waits for the owner's answer after it asks a question. */
const ASK_MS = 15_000;
/** Longest answer taken as the owner's (longer is most likely the room: a video, a call, the TV). */
const ANSWER_WORDS = 15;
/** The owner's recent requests, for "close it" and "do that again". */
const RECENT_MS = 10 * 60_000;

/** Runs AppleScript; resolves with what it returned. */
const osa = (script: string, timeout = 5000) => new Promise<string>((resolve, reject) =>
  execFile("osascript", ["-e", script], { timeout }, (e, out) => (e ? reject(e) : resolve(out.trim()))));

/**
 * Each browser's tab read, still running or finished. A read is never killed: the
 * first one can sit behind macOS's "allow Peguin to control Chrome?" prompt, and
 * killing it would dismiss the prompt.
 */
const tabReads = new Map<string, { at: number; tabs: Tab[] | null; pending: Promise<Tab[]> | null }>();

/** Tabs in the running browsers (titles and addresses only), waiting at most 2.5 s; `unread` are browsers still not answering. */
async function browserTabs(running: string[]): Promise<{ tabs: Tab[]; unread: string[] }> {
  const on = BROWSERS.filter((b) => running.includes(b));
  const got = await Promise.all(on.map(async (b) => {
    const r = tabReads.get(b) ?? { at: 0, tabs: null, pending: null };
    tabReads.set(b, r);
    if (!r.pending) {
      r.pending = osa(listScript(b), 120_000).then((out) => readTabs(b, out), () => r.tabs ?? []);
      void r.pending.then((t) => { r.tabs = t; r.at = Date.now(); r.pending = null; });
    }
    const t = await Promise.race([r.pending, sleep(2500).then(() => null)]);
    return { b, tabs: t ?? r.tabs };
  }));
  return { tabs: got.flatMap((g) => g.tabs ?? []), unread: got.filter((g) => !g.tabs).map((g) => g.b) };
}
/** Pause after each step so the screen settles before Peguin looks again. */
const SETTLE_MS = 700;


/** Names of the apps installed on this Mac, for "open Chrome" (re-read at most once a minute). */
let apps: { at: number; names: string[] } | null = null;
function installedApps(): string[] {
  if (apps && Date.now() - apps.at < 60_000) return apps.names;
  const dirs = ["/Applications", "/Applications/Utilities", "/System/Applications", "/System/Applications/Utilities", path.join(app.getPath("home"), "Applications")];
  const names = dirs.flatMap((d) => { try { return readdirSync(d).filter((f) => f.endsWith(".app")).map((f) => f.slice(0, -4)); } catch { return []; } });
  // Finder lives with the system's own services, not in Applications.
  if (existsSync("/System/Library/CoreServices/Finder.app")) names.push("Finder");
  apps = { at: Date.now(), names: [...new Set(names)] };
  return apps.names;
}

/** While the copilot is in a meeting, wait this long for its transcript before acting, so the echo check can see it. */
const ECHO_WAIT_MS = 1800;
/** The camera notch's width in points, from the helper (macOS reports it); null on a Mac without one. */
let cameraNotch: number | null = null;
/** Width of each side of the island beside the camera, where the dot and the waveform show (matches the overlay's CSS). */
const EAR = 46;

/** The primary display's menu bar height and, when it has a camera notch, the notch's width. */
function topOf(d: Electron.Display) {
  const bar = d.workArea.y - d.bounds.y;
  return { bar, notchW: bar >= 32 ? cameraNotch ?? 185 : 0 };
}

/** The fin's resting place: on the right side of the island, like a flipper on Peguin's body. */
function homePoint() {
  const d = screen.getPrimaryDisplay();
  const { bar, notchW } = topOf(d);
  return { x: d.bounds.x + d.bounds.width / 2 + (notchW ? notchW / 2 + EAR + 4 : 84), y: d.bounds.y + (notchW ? bar : 50) - 6 };
}

/** The overlay records at 24 kHz: whisper gets it at 16 kHz, Learn my voice keeps the full quality. */
const MIC_RATE = 24000;

type Rect = { x: number; y: number; w: number; h: number };
export type OverlayEvent =
  /** `island`: this display shows the Dynamic Island (the primary one); `notch`: the menu bar has a camera notch, so the island hugs it. */
  | { kind: "origin"; x: number; y: number; mic: boolean; island: boolean; notch: boolean; bar: number; notchW: number }
  /** Peguin's own cursor, in global points; every display draws it when it's on that display. */
  | { kind: "agent"; x: number; y: number; ring: Rect | null; animate: boolean; docked: boolean; ms?: number }
  /** How Peguin's cursor looks and moves, and whether the island shows (from Settings). */
  | { kind: "style"; cursor: Settings["pointer"]["cursor"]; island: boolean }
  /** The owner's mouse (global points), for the penguin's eye to follow while it rests. */
  | { kind: "look"; x: number; y: number }
  /** What the island and Peguin's cursor show: idle, hearing (its name was heard: a waveform), working or warn (with what it's doing). */
  | { kind: "mode"; mode: Mode; text?: string }
  | { kind: "numbers"; items: (Rect & { n: number })[] }
  | { kind: "shape"; shape: Shape; rect: Rect }
  | { kind: "pen"; on: boolean }
  | { kind: "clear" };

export type Mode = "idle" | "hearing" | "working" | "warn";

export type PointerStatus = {
  on: boolean;
  /** Accessibility permission (clicks, typing, reading buttons). */
  trusted: boolean;
  mic: "granted" | "denied" | "not-determined" | "restricted" | "unknown";
  helper: boolean;
  /** The app to switch on under Accessibility: "Peguin", or "Electron" when running from source. */
  appName: string;
  last?: { heard: string; did: string; at: number };
  error?: string;
};

type Reply = { ok: boolean; error?: string; [k: string]: unknown };

/** The Swift helper, kept running; one JSON line per request. */
export class Helper {
  private proc: ChildProcess | null = null;
  private waiting = new Map<number, (r: Reply) => void>();
  private id = 0;
  /** Unsolicited lines from the helper (Clicky-style Control+Option push-to-talk). */
  onEvent: ((e: { event: string; phase?: string }) => void) | null = null;

  private start() {
    const p = spawn(pointerHelperPath(), [], { stdio: ["pipe", "pipe", "ignore"] });
    p.on("error", () => {});
    p.on("exit", () => {
      if (this.proc === p) this.proc = null;
      for (const r of this.waiting.values()) r({ ok: false, error: "The voice control helper stopped." });
      this.waiting.clear();
    });
    createInterface({ input: p.stdout! }).on("line", (line) => {
      let r: Reply & { id?: number; event?: string; phase?: string };
      try { r = JSON.parse(line); } catch { return; }
      if (r.event) { this.onEvent?.({ event: r.event, phase: r.phase }); return; }
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

/** Development only: what voice control hears, in userData/pointer-debug.log, to find where it stops. Never in a release. */
function debug(line: string) {
  if (app.isPackaged) return;
  try { appendFileSync(path.join(app.getPath("userData"), "pointer-debug.log"), `${new Date().toISOString()} ${line}\n`); } catch { /* best effort */ }
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const rectOf = (e: Element): Rect => ({ x: e.x, y: e.y, w: e.w, h: e.h });
const pad = (r: Rect, n: number): Rect => ({ x: r.x - n, y: r.y - n, w: r.w + 2 * n, h: r.h + 2 * n });

export class VoiceControl {
  private helper = new Helper();
  private overlays = new Map<number, BrowserWindow>();
  private listen: (((chunk: ArrayBuffer) => void) & { flush: () => boolean }) | null = null;
  private armedUntil = 0;
  private numbered: Element[] = [];
  private penWindow: BrowserWindow | null = null;
  private shortcut = "";
  private running = false;
  private queue = Promise.resolve();
  private detach: (() => void)[] = [];
  private lastStatus: PointerStatus = { on: false, trusted: false, mic: "unknown", helper: false, appName: app.isPackaged ? "Peguin" : "Electron" };
  /** Where Peguin's own cursor is (global points). It stays where it last worked; the owner's mouse is theirs. */
  private agent = { x: 0, y: 0 };
  private modeAt = 0;
  private docked = true;
  private homeTimer: NodeJS.Timeout | null = null;
  private eyes: NodeJS.Timeout | null = null;
  private roamTimer: NodeJS.Timeout | null = null;
  private chunks = 0;
  /** Holding Control+Option (Clicky-style push-to-talk). */
  private holding = false;
  /** The armed window is a follow-up after a command (not "Hey Peguin" on its own). */
  private followUp = false;
  /** Woken by a bare "Hey" (not the name): the request must be a clear one. */
  private armedBare = false;
  private armCheck: ReturnType<typeof setTimeout> | undefined;
  /** A question Peguin asked mid-task; the owner's next words answer it. */
  private asked: { goal: string; question: string; until: number } | null = null;
  /** The owner's recent requests and how they went, newest last. */
  private recent: { at: number; line: string }[] = [];
  /** The Smart drive in progress; `stop` ends it after the current step. */
  private driving: { stop: boolean } | null = null;

  constructor(
    private settings: () => Settings,
    private whisper: () => Promise<Whisper>,
    private page: { url?: string; file?: string },
    private copilotLive: () => boolean,
    private report: (s: PointerStatus) => void,
    /** The owner talking, not to Peguin (for Learn my voice, which decides whether to keep it). */
    private talk?: (pcm: Buffer, rate: number, text: string) => void,
    /** The owner's AI, for a line addressed to Peguin that it couldn't understand. */
    private interpret?: (heard: string) => Promise<string | null>,
    /** The owner's AI, for Smart drive: one prompt in, the reply out. */
    private think?: (prompt: string) => Promise<string>,
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
    // Ask up front, but don't abort: the overlay also calls getUserMedia, and a denied
    // permission used to leave dictation dead with no overlay and no way to retry.
    let micDenied = false;
    if (process.platform === "darwin") {
      const ok = await systemPreferences.askForMediaAccess("microphone");
      micDenied = !ok;
      if (!ok) debug("mic permission not granted yet");
    }
    const w = await this.whisper();
    this.running = true;
    this.helper.onEvent = (e) => { if (e.event === "ptt" && (e.phase === "down" || e.phase === "up")) this.ptt(e.phase); };
    this.openListen(w.url);
    cameraNotch = await this.helper.call<{ w?: number }>("notch").then((r) => r.w || null, () => null);
    this.openOverlays();
    const rebuild = () => { if (this.running) { this.closeOverlays(); this.openOverlays(); } };
    screen.on("display-added", rebuild);
    screen.on("display-removed", rebuild);
    screen.on("display-metrics-changed", rebuild);
    this.detach.push(() => { screen.removeListener("display-added", rebuild); screen.removeListener("display-removed", rebuild); screen.removeListener("display-metrics-changed", rebuild); });
    await this.bindTrigger();
    // The penguin's eye follows the owner's mouse (only when it moved; ~8 times a second).
    let last = "";
    this.eyes = setInterval(() => {
      const p = screen.getCursorScreenPoint(), k = `${p.x},${p.y}`;
      if (k !== last) { last = k; this.all({ kind: "look", x: p.x, y: p.y }); }
    }, 120);
    debug(`started: whisper ${w.url}`);
    this.roam();
    const rate = setInterval(() => { debug(`mic chunks in the last 10 s: ${this.chunks}`); this.chunks = 0; }, 10000);
    this.detach.push(() => clearInterval(rate));
    const st = await this.status();
    const error = micDenied
      ? "Allow Electron (or Peguin) under System Settings > Privacy & Security > Microphone, then toggle Voice control off and on."
      : !st.trusted ? `Switch on ${st.appName} under Accessibility so Peguin can click, type and hold Control+Option.`
      : this.lastStatus.error; // keep a ptt-on failure from bindTrigger
    this.update({ ...st, error });
    return this.lastStatus;
  }

  async stop() {
    this.running = false;
    this.holding = false;
    if (this.homeTimer) clearTimeout(this.homeTimer);
    if (this.roamTimer) clearTimeout(this.roamTimer);
    if (this.eyes) clearInterval(this.eyes);
    this.eyes = null;
    this.listen = null;
    this.helper.onEvent = null;
    if (this.shortcut) globalShortcut.unregister(this.shortcut);
    this.shortcut = "";
    for (const d of this.detach.splice(0)) d();
    this.closeOverlays();
    this.helper.stop();
    this.update({ on: false });
  }

  /** Whisper listener; hold-to-talk waits for release instead of a short pause. */
  private openListen(whisperUrl: string) {
    const s = this.settings();
    const hold = s.pointer.trigger === "hold";
    this.listen = createListener({
      whisperUrl,
      names: [s.displayName || "the owner"],
      prompt: () => commandPrompt(this.settings().pointer.wakeWords[0] ?? "Peguin"),
      // Hold: speak while keys are down, run on release (Clicky). Wake: pause ends the line.
      endSilenceMs: hold ? 60_000 : 900,
      rate: MIC_RATE,
      // While Control+Option is down, only release (flush) ends the utterance — not a mid-hold pause.
      canAutoFinish: () => !this.holding,
      onUtterance: ({ text, pcm }) => this.heard(text, pcm),
      onError: (e) => { debug(`stt error: ${message(e)}`); this.update({ error: `Speech recognition error: ${message(e)}` }); },
    });
  }

  /**
   * Clicky-style push-to-talk and/or the press shortcut + wake words.
   * Hold Control+Option to speak; release to run. Needs Accessibility on the helper.
   */
  async bindTrigger() {
    if (!this.running) return;
    const t = this.settings().pointer.trigger;
    if (t === "hold" || t === "both") {
      await this.helper.call("ptt-on").catch((e) => {
        debug(`ptt-on: ${message(e)}`);
        this.update({ error: message(e) });
      });
    } else {
      await this.helper.call("ptt-off").catch(() => {});
      this.holding = false;
    }
    // Press-to-arm shortcut when wake words are in play; hold-only uses Control+Option.
    if (t === "wake" || t === "both") this.bindShortcut();
    else if (this.shortcut) { globalShortcut.unregister(this.shortcut); this.shortcut = ""; }
    const w = await this.whisper().catch(() => null);
    if (w) this.openListen(w.url);
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

  /** Control+Option down: listen. Up: finish the utterance and run it. */
  private ptt(phase: "down" | "up") {
    if (!this.running) return;
    const t = this.settings().pointer.trigger;
    if (t !== "hold" && t !== "both") return;
    if (phase === "down") {
      this.holding = true;
      debug("ptt down");
      // Stay armed for the whole hold; follow-up timer must not idle mid-hold.
      this.armedUntil = Date.now() + 120_000;
      this.armedBare = false;
      this.followUp = false;
      this.mode("hearing", "Hold ⌃⌥ — speak…");
      this.armTimer();
      return;
    }
    this.holding = false;
    const sent = this.listen?.flush() ?? false;
    debug(`ptt up sent=${sent}`);
    if (!sent) {
      // Empty tap: don't sit on "listening" with the mic gated off.
      this.armedUntil = 0;
      this.mode("warn", "Hold ⌃⌥ while you speak, then release");
      return;
    }
    this.mode("working", "Got it…");
    // Keep armed until heard() runs the transcript.
    this.armedUntil = Date.now() + 30_000;
    this.armTimer();
  }

  /** Hold mode: drop the armed window and go idle (mic is gated unless keys are down). */
  private holdIdle() {
    if (this.settings().pointer.trigger !== "hold" || this.holding) return;
    this.armedUntil = 0;
    this.mode("idle");
  }

  /** Woken ("Hey Peguin", "Hey", the shortcut): the next line is the request, for the owner's few seconds (Settings). */
  private async arm(bare = false) {
    this.armedUntil = Date.now() + this.settings().pointer.listenS * 1000;
    this.armedBare = bare;
    this.followUp = false;
    this.mode("hearing");
    this.armTimer();
  }

  /** Goes back to idle when the listening time is up; checks again if talking stretched it. */
  private armTimer() {
    if (this.armCheck) clearTimeout(this.armCheck);
    this.armCheck = setTimeout(() => {
      if (this.holding) { this.armedUntil = Math.max(this.armedUntil, Date.now() + 1000); this.armTimer(); return; }
      if (!this.armedUntil || this.followUp) return;
      if (Date.now() < this.armedUntil) { this.armTimer(); return; }
      this.armedUntil = 0;
      this.mode("idle");
    }, Math.max(50, this.armedUntil - Date.now() + 50));
  }

  /** After a request, follow-ups for the owner's few seconds without the wake word. */
  private listenOn() {
    // Hold-to-talk: the next command is another Control+Option hold, not ambient follow-ups.
    if (this.settings().pointer.trigger === "hold") return;
    const s = this.settings().pointer.followS;
    if (!s) return;
    this.armedUntil = Date.now() + s * 1000;
    this.followUp = true;
    this.armedBare = false;
  }

  // MARK: overlay windows

  private openOverlays() {
    const primary = screen.getPrimaryDisplay().id;
    // Peguin's cursor starts at home: the island, or the middle of the screen when it roams.
    if (this.docked) {
      const home = this.settings().pointer.cursor.home;
      if (home === "island") this.agent = homePoint();
      else { const w = screen.getPrimaryDisplay().workArea; this.agent = { x: w.x + w.width / 2, y: w.y + w.height / 2 }; this.docked = false; }
    }
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
      // Seed once loaded; the overlay also asks again via pointer:ready (React can bind late).
      win.webContents.once("did-finish-load", () => {
        this.seedOverlay(win, d, primary);
        win.showInactive();
      });
      this.overlays.set(d.id, win);
    }
    const on = (channel: string, fn: (e: IpcMainEvent, ...a: any[]) => void) => {
      const h = (e: IpcMainEvent, ...a: any[]) => { if ([...this.overlays.values()].some((w) => w.webContents === e.sender)) fn(e, ...a); };
      ipcMain.on(channel, h);
      this.detach.push(() => ipcMain.removeListener(channel, h));
    };
    on("pointer:ready", (e) => {
      const entry = [...this.overlays.entries()].find(([, w]) => w.webContents === e.sender);
      if (!entry) return;
      const [id, win] = entry;
      const d = screen.getAllDisplays().find((x) => x.id === id) ?? screen.getPrimaryDisplay();
      this.seedOverlay(win, d, screen.getPrimaryDisplay().id);
      debug(`overlay ready: display ${id} mic=${id === screen.getPrimaryDisplay().id}`);
    });
    on("pointer:pcm", (_e, buf: ArrayBuffer) => {
      this.chunks++;
      // Hold-only: ignore the room until Control+Option is down (Clicky).
      if (this.settings().pointer.trigger === "hold" && !this.holding) return;
      this.listen?.(buf);
    });
    on("pointer:mic-error", (_e, why: string) => { debug(`mic error: ${why}`); this.update({ error: `Can't hear your microphone (${String(why)}).` }); });
    on("pointer:pen-done", () => this.penOff());
  }

  /** Origin, style and cursor for one overlay. `mic` only on the primary display. */
  private seedOverlay(win: BrowserWindow, d: Electron.Display, primaryId: number) {
    if (win.isDestroyed()) return;
    const b = d.bounds;
    const { bar, notchW } = topOf(d);
    win.webContents.send("pointer:event", { kind: "origin", x: b.x, y: b.y, mic: d.id === primaryId, island: d.id === primaryId, notch: notchW > 0, bar, notchW } satisfies OverlayEvent);
    const p = this.settings().pointer;
    win.webContents.send("pointer:event", { kind: "style", cursor: p.cursor, island: p.island } satisfies OverlayEvent);
    win.webContents.send("pointer:event", { kind: "agent", ...this.agent, ring: null, animate: false, docked: this.docked } satisfies OverlayEvent);
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

  /** The island and Peguin's cursor; working and warn go back to idle by themselves. */
  private mode(mode: Mode, text?: string) {
    if (mode !== "idle") this.modeAt = Date.now();
    this.all({ kind: "mode", mode, text });
    if (process.env.PENGUIN_OVERLAY_SNAP && !app.isPackaged) setTimeout(() => void this.snapTop(mode), 700);
  }

  /** Development only: the top of the primary overlay as Peguin drew it (its own window, so no Screen Recording needed). */
  private async snapTop(label: string) {
    const win = this.overlays.get(screen.getPrimaryDisplay().id);
    if (!win || win.isDestroyed()) return;
    const img = await win.webContents.capturePage({ x: Math.round(win.getBounds().width / 2) - 300, y: 0, width: 600, height: 110 });
    writeFileSync(path.join(app.getPath("userData"), `overlay-${label}.png`), img.toPNG());
    debug(`overlay ${label}: bounds ${JSON.stringify(win.getBounds())}`);
  }

  private async caption(text: string, tone: "info" | "warn" = "info") {
    this.mode(tone === "warn" ? "warn" : "working", text);
  }

  // MARK: hearing

  private heard(raw: string, pcm?: Buffer) {
    const text = softenSpeech(raw);
    const p = this.settings().pointer;
    // "Hey" alone wakes Peguin only when the owner chose it, and never in a meeting, where "Hey" is for people.
    const hey = p.wake === "hey" && !this.copilotLive();
    debug(`heard: ${JSON.stringify(text)}${text !== raw ? ` (was ${JSON.stringify(raw)})` : ""} (wake: ${JSON.stringify(wake(text, p.wakeWords, hey))})`);
    if (!this.running) return;
    const now = Date.now();
    const armed = now < this.armedUntil;
    const names = p.wakeWords;
    const h = wake(text, names, hey);
    // The answer to a question Peguin just asked: back to the same task, with the answer.
    // Only a short answer counts: a TV or a video in the room talks in long sentences.
    // Checked before isFiller so "hello" / "hi" still count as the message to send.
    const asked = this.asked && now < this.asked.until && !h && text.trim().split(/\s+/).length <= ANSWER_WORDS ? this.asked : null;
    if (asked) {
      this.asked = null;
      this.armedUntil = 0;
      // Speech may garble short words; the drive prompt already softens aye/I → hi. Keep going unless the reply is clearly off-topic.
      const goal = `${asked.goal}\n(You asked “${asked.question}” and the owner answered: “${text.trim()}”. Use the most likely reading — short garbles like “aye”/“I” often mean “hi” — and continue the task. Only stop if the reply is clearly about something else.)`;
      debug(`answer: ${JSON.stringify(text)}`);
      this.mode("hearing");
      this.queue = this.queue.then(async () => { if (await this.drive(goal)) this.listenOn(); }).catch((e) => { debug(`failed: ${message(e)}`); void this.caption(message(e), "warn"); });
      return;
    }
    if (isFiller(text, names[0])) { this.holdIdle(); return; }
    if (h && "armed" in h) { void this.arm(!!h.bare); return; }
    const command = h ? h.command : armed ? text : null;
    const followUp = !h && armed && this.followUp;
    // Not sure it's for Peguin: a bare "Hey …", the line after a bare "Hey", or a follow-up. The AI decides,
    // and if it isn't a request for the computer Peguin drops it without a word.
    const unsure = !!h?.bare || (!h && armed && (this.armedBare || followUp));
    if (!command) {
      // Not for Peguin: dropped, unless Learn my voice keeps it as a clip for the owner to review.
      // Never during a call, when the mic can pick up the meeting from the speakers.
      if (pcm && !this.copilotLive()) this.talk?.(pcm, MIC_RATE, text);
      this.holdIdle();
      return;
    }
    let action = parse(command);
    // "Stop" while Peguin is driving ends it now, not after the queue.
    if (action.kind === "stop" && this.driving) { this.driving.stop = true; this.mode("warn", "Stopped"); return; }
    // A bare "Peguin ..." only counts when it's a known command.
    if (action.kind === "unknown" && h && !h.called && !armed) return;
    // A cut-off scrap ("Hey Peguin, I'm...", "So") isn't the request yet: keep listening for it (talking stretches the wait).
    // Hold-to-talk already released: nothing more is coming, so don't wait with the mic gated off.
    if (action.kind === "unknown" && fragment(command) && !(p.trigger === "hold" && !this.holding)) {
      debug(`fragment: ${JSON.stringify(command)}`);
      if (h) void this.arm(!!h.bare);
      else if (armed && !followUp) { this.armedUntil = Math.max(this.armedUntil, now + p.listenS * 1000); this.armTimer(); }
      return;
    }
    // Unsure lines Peguin can't make sense of on its own need the owner's AI (Smart); without it they're the room.
    if (action.kind === "unknown" && unsure && !this.smart()) return;
    // A new request replaces one still being worked through: the owner changed their mind.
    if (this.driving) this.driving.stop = true;
    debug(`run: ${JSON.stringify(action)}`);
    this.armedUntil = 0;
    if (!unsure || action.kind !== "unknown") this.mode("hearing"); // its name was heard: the cursor becomes a waveform until it acts
    this.queue = this.queue.then(async () => {
      if (this.copilotLive()) {
        await sleep(ECHO_WAIT_MS);
        if (echo.heard(text, Date.now())) { this.update({ last: { heard: text, did: "Ignored: it came from the meeting", at: Date.now() } }); this.mode("idle"); return; }
      }
      // Smart drive: opening, finding, clicking and searching are worked out by the owner's AI, step by step, on screen.
      if (this.smart() && !this.local(action) && (action.kind !== "unknown" || h?.called || armed)) {
        const quiet = !unsure || action.kind !== "unknown" ? undefined : h?.bare || this.armedBare && !followUp ? "greeting" as const : "followUp" as const;
        const acted = await this.drive(command, { quiet });
        if (acted) this.listenOn();
        return;
      }
      // Addressed to Peguin but not understood: ask the owner's AI what they meant (the words only).
      if (action.kind === "unknown" && (h?.called || (armed && !followUp)) && this.interpret && this.settings().pointer.askAi) {
        this.mode("working", "Working out what you meant…");
        const guess = await this.interpret(command).catch((e) => {
          const msg = message(e);
          debug(`ai failed: ${msg}`);
          if (/out of uses|session limit|rate.?limit/i.test(msg)) throw e; // show under the cursor
          return null;
        });
        debug(`ai: ${JSON.stringify(command)} -> ${JSON.stringify(guess)}`);
        const better = guess ? parse(guess) : null;
        if (better && better.kind !== "unknown") action = better;
      }
      const started = Date.now();
      await this.run(action, text);
      this.remember(`“${command}”: ${describe(action)}`);
      if (this.modeAt <= started) this.mode("idle"); // nothing to say about it (clear, hide numbers)
      // A follow-up ("now scroll down") doesn't need the wake phrase again.
      if (action.kind !== "unknown" && action.kind !== "stop") this.listenOn();
    }).catch((e) => { debug(`failed: ${message(e)}`); void this.caption(message(e), "warn"); });
  }

  // MARK: doing

  /** Runs one action now (also used by Settings' "Try it"). */
  async run(a: Action, heard = "") {
    const did = describe(a);
    this.update({ last: { heard, did, at: Date.now() }, error: undefined });
    const needsHands = !["open-url", "search", "clear", "stop", "unknown", "draw", "screenshot"].includes(a.kind) || (a.kind === "draw" && a.target.by !== "cursor");
    if (needsHands && !(await this.status()).trusted) {
      await this.caption("Peguin needs Accessibility to do that. Turn it on in Settings > Voice control.", "warn");
      return;
    }
    switch (a.kind) {
      case "click": {
        const p = await this.locate(a.target, a.kind);
        if (!p) return;
        await this.glide(p.point, p.rect, did);
        // The click happens where Peguin's cursor is; the owner's mouse goes straight back to where it was.
        await this.helper.call("click", { ...p.point, button: a.button, count: a.count, restore: true });
        this.numbersOff();
        return;
      }
      case "point": {
        const p = await this.locate(a.target, a.kind);
        if (p) await this.glide(p.point, p.rect, did);
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
      // Visibly, like a person: Peguin clicks it in the Dock (no AI needed for this one).
      case "open-app": await this.openApp(a.name, ""); return;
      case "quit-app": await this.quitApp(a.name, ""); return;
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
      case "screenshot": await this.takeScreenshot(a.of, did); return;
      case "stop": this.penOff(); this.numbersOff(); this.armedUntil = 0; await this.caption(did); return;
      case "unknown": await this.caption(`${did}. Try “click …”, “scroll down”, “open …”, “show numbers” or “draw a circle”.`, "warn"); return;
    }
  }

  /** A typed command (Settings' "Try it", development): the same routing as a spoken one, without the wake phrase. */
  async command(text: string) {
    const a = parse(text);
    if (this.smart() && !this.local(a)) return this.drive(text);
    return this.run(a, text);
  }

  private smart() { return this.settings().pointer.drive === "smart" && !!this.think; }

  /** Done here without the AI: instant actions, and apps named exactly as installed. */
  private local(a: Action) {
    if (INSTANT.has(a.kind)) return true;
    if (a.kind === "open-app" || a.kind === "quit-app") return !!matchApp(a.name, installedApps());
    return false;
  }

  private remember(line: string) {
    const now = Date.now();
    this.recent = [...this.recent.filter((r) => now - r.at < RECENT_MS), { at: now, line: line.slice(0, 200) }].slice(-5);
  }

  /**
   * Smart drive: look at the screen, ask the owner's AI for one step, do it with
   * Peguin's cursor where the owner can see, and again, until it's done (or stopped,
   * or 12 steps). Esc or "Hey Peguin, stop" ends it.
   */
  /**
   * `quiet`: Peguin isn't sure the words were for it (a bare "Hey …", a follow-up). Nothing shows until the
   * AI picks a real step; if it says this isn't a request, Peguin goes back to idle without a word.
   * Resolves false when nothing was done.
   */
  async drive(goal: string, o: { quiet?: "greeting" | "followUp" } = {}): Promise<boolean> {
    if (this.driving) this.driving.stop = true;
    const run = { stop: false };
    this.driving = run;
    const esc = () => { run.stop = true; this.mode("warn", "Stopped"); };
    const escBound = globalShortcut.register("Escape", esc);
    const history: string[] = [];
    const earlier = this.recent.filter((r) => Date.now() - r.at < RECENT_MS).map((r) => r.line);
    let prev: Step | undefined, prevTarget: Seen | undefined, lastKey = "";
    let outcome = "didn't finish";
    let acted = false;
    try {
      if (!(await this.status()).trusted) { await this.caption("Peguin needs Accessibility to do that. Turn it on in Settings > Voice control.", "warn"); return acted; }
      for (let i = 0; i < MAX_STEPS; i++) {
        if (run.stop) return acted;
        // First, what Peguin heard, so the owner can tell a mishearing straight away.
        if (!(o.quiet && i === 0)) this.mode("working", i ? "Looking at the screen…" : `“${goal.split("\n")[0]!.slice(0, 60)}”`);
        const [seen, apps] = await Promise.all([
          this.helper.call<{ app: string; elements: Seen[] }>("targets", { dock: true }),
          this.helper.call<{ names: string[] }>("apps").then((r) => r.names, () => [] as string[]),
        ]);
        const { tabs, unread } = await browserTabs(apps);
        const { list, byId } = observe(seen.elements);
        const tabIds = listTabs(tabs).byId;
        if (unread.length && i === 0) await this.caption(`Allow Peguin to see ${unread.join(" and ")} tabs if macOS asks.`);
        const key = screenKey(seen.app, seen.elements), changed = key !== lastKey;
        lastKey = key;
        debug(`drive ${i + 1} sees ${seen.app}: ${seen.elements.length} elements (${["dock", "window", "menu"].map((k) => `${k} ${seen.elements.filter((e) => (e.area ?? "window") === k).length}`).join(", ")})`);
        debug(`drive ${i + 1}: ${tabs.length} tabs${unread.length ? ` (not answering: ${unread.join(", ")})` : ""}`);
        const note = o.quiet === "greeting" ? UNSURE.greeting : o.quiet === "followUp" ? UNSURE.followUp(earlier.at(-1) ?? "none") : "";
        const asked = note && !acted ? `${goal}\n(${note})` : goal;
        const reply = await this.think!(drivePrompt(asked, seen.app, list, history, { tabs, apps, earlier, unread }));
        if (run.stop) return acted;
        const step = readStep(reply, byId, tabIds);
        debug(`drive ${i + 1}: ${JSON.stringify(step)} from ${JSON.stringify(reply.slice(0, 200))}`);
        if (!step) { history.push("(that reply wasn't one usable JSON step with an id from the list)"); continue; }
        if (step.action === "done") { outcome = step.say || "done"; if (o.quiet && !acted) { this.mode("idle"); return acted; } this.mode("working", step.say || "Done"); return true; }
        // Unsure it was for Peguin and the AI agrees it isn't a request: drop it without a word.
        if (o.quiet && !acted && (step.action === "stop" || step.action === "ask")) { outcome = "not a request"; this.mode("idle"); return acted; }
        if (step.action === "stop") { outcome = `stopped: ${step.say}`; await this.caption(step.say, "warn"); return acted; }
        if (step.action === "ask") {
          // One ask per goal. After the owner has already answered, keep going instead of looping.
          if (/the owner answered:/i.test(goal) || history.some((h) => h.startsWith("asked"))) {
            history.push("(already asked once; act on the best reading instead of asking again)");
            continue;
          }
          // Wait for the answer without "Hey Peguin"; it comes back to this same task.
          outcome = `asked “${step.question}”`;
          this.asked = { goal, question: step.question, until: Date.now() + ASK_MS };
          this.armedUntil = Date.now() + ASK_MS; this.followUp = false;
          await this.caption(step.question);
          return true;
        }
        if (stuck(step, prev, changed)) {
          await this.caption(`That didn't work: ${stepLine(step, byId)} changed nothing. Try asking another way.`, "warn");
          return acted;
        }
        if (step.action === "type" && !canType(prev, prevTarget, changed)) {
          debug(`drive ${i + 1}: typing refused (nothing chosen to type into)`);
          history.push("(typing refused: click a text field you can see in the list first; keys would go to whatever app is in front)");
          continue;
        }
        await this.doStep(step, byId, tabIds, seen.elements);
        acted = true;
        prev = step;
        prevTarget = "id" in step && step.id ? byId.get(step.id) : undefined;
        history.push(stepLine(step, byId, tabIds));
        outcome = `last step: ${stepLine(step, byId, tabIds)}`;
        this.update({ last: { heard: goal, did: `Step ${i + 1}: ${stepLine(step, byId, tabIds)}`, at: Date.now() } });
        if (finishes(step, goal)) {
          const said = stepLine(step, byId, tabIds);
          outcome = said;
          this.mode("working", said.charAt(0).toUpperCase() + said.slice(1));
          return acted;
        }
        await sleep(step.action === "wait" ? 1500 : SETTLE_MS);
      }
      await this.caption(`I stopped after ${MAX_STEPS} steps without finishing. Try asking in smaller parts.`, "warn");
      return acted;
    } finally {
      this.remember(`“${goal.split("\n")[0]}”: ${outcome}`);
      if (escBound) globalShortcut.unregister("Escape");
      if (this.driving === run) this.driving = null;
      this.goHomeLater();
    }
  }

  /**
   * Save a PNG on the Desktop via macOS `screencapture` (what you see on the main
   * display). Needs Screen Recording for Electron/Peguin on recent macOS; the file
   * stays on this Mac only. `of` is kept for the AI's wording; capture is the screen.
   */
  private async takeScreenshot(_of: "screen" | "window", say: string) {
    await this.caption(say || "Taking a screenshot…");
    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const file = path.join(app.getPath("desktop"), `Peguin ${stamp}.png`);
    await new Promise<void>((resolve, reject) => {
      execFile("screencapture", ["-x", "-m", file], { timeout: 15000 }, (e) => {
        if (e) reject(new Error("Couldn't take a screenshot. Allow Screen Recording for Electron (or Peguin) in System Settings > Privacy & Security, then try again."));
        else resolve();
      });
    });
    await this.caption(`Saved on your Desktop as Peguin ${stamp}.png`);
  }

  /** One planned step, done visibly: Peguin's cursor goes there first. */
  private async doStep(s: Exclude<Step, { action: "done" | "stop" | "ask" }>, byId: Map<number, Seen>, tabs: Map<string, Tab>, seen: Seen[]) {
    const say = s.why || stepLine(s, byId, tabs);
    switch (s.action) {
      case "click": case "double_click": case "right_click": {
        const e = byId.get(s.id)!;
        const p = centre(e);
        await this.glide(p, rectOf(e), say);
        await this.helper.call("click", { ...p, button: s.action === "right_click" ? "right" : "left", count: s.action === "double_click" ? 2 : 1, restore: true });
        return;
      }
      case "type": await this.caption(say); await this.helper.call("type", { text: s.text }); return;
      case "key": await this.caption(say); await this.helper.call("key", { combo: s.combo }); return;
      case "scroll": {
        const e = s.id ? byId.get(s.id) : undefined;
        const p = e ? centre(e) : this.agent;
        if (e) await this.glide(p, rectOf(e), say); else await this.caption(say);
        await this.helper.call("scroll", { dy: s.dir === "up" ? 8 : -8, dx: 0, x: p.x, y: p.y });
        return;
      }
      case "open_url": await this.caption(say); await shell.openExternal(s.url); return;
      case "screenshot": await this.takeScreenshot(s.of ?? "screen", say); return;
      case "wait": await this.caption(say); return;
      case "open_app": return this.openApp(s.name, say);
      case "quit_app": return this.quitApp(s.name, say);
      case "close_tab": case "switch_tab": {
        const x = tabs.get(s.tab)!;
        // Peguin's cursor goes to the tab when it's on screen, then the browser is told which one.
        const el = seen.find((e) => e.area === "window" && e.label && x.title && (e.label === x.title || e.label.startsWith(x.title.slice(0, 30))));
        if (el) await this.glide(centre(el), rectOf(el), say); else await this.caption(say);
        await osa(s.action === "close_tab" ? closeScript(x) : switchScript(x)).catch(() => { throw new Error(`${x.browser} didn't let Peguin ${s.action === "close_tab" ? "close" : "switch to"} that tab. Allow Peguin under System Settings > Privacy & Security > Automation.`); });
        return;
      }
    }
  }

  /**
   * Opens an app the way a person would: Peguin's cursor goes to it in the Dock and
   * clicks. When the Dock is hidden (a full-screen app) or the app isn't in it, the
   * cursor heads to where the Dock is and Peguin opens it directly.
   */
  private async openApp(spoken: string, say: string) {
    const name = matchApp(spoken, installedApps());
    if (!name) throw new Error(`I couldn't find an app called “${spoken}”.`);
    const { elements } = await this.helper.call<{ elements: Seen[] }>("targets", { dock: true });
    const item = this.dockItem(name, elements);
    if (item) {
      const p = centre(item);
      await this.glide(p, rectOf(item), say || `Clicking ${name} in the Dock`);
      await this.helper.call("click", { ...p, button: "left", count: 1, restore: true });
      return;
    }
    const d = screen.getDisplayNearestPoint(this.agent).bounds;
    await this.glide({ x: d.x + d.width / 2, y: d.y + d.height - 40 }, null, `Opening ${name}`);
    await new Promise<void>((resolve, reject) => execFile("open", ["-a", name], (e) => (e ? reject(new Error(`${name} didn't open.`)) : resolve())));
  }

  /** The app's icon in the Dock: matched loosely, since the Dock's name can differ from the installed one ("iTerm2" for iTerm). */
  private dockItem(name: string, elements: Seen[]): Seen | undefined {
    const dock = elements.filter((e) => e.area === "dock" && e.role === "AXDockItem");
    const label = dockLabel(name, dock.map((e) => e.label));
    return dock.find((e) => e.label === label);
  }

  /**
   * Quits an app the way a person would: Peguin's cursor goes to its Dock icon,
   * right-clicks, and clicks Quit in the menu. Without a Dock icon (a hidden Dock),
   * the app is asked to quit directly. Either way it can still ask about unsaved work.
   */
  private async quitApp(spoken: string, say: string) {
    const name = matchApp(spoken, installedApps());
    if (!name) throw new Error(`I couldn't find an app called “${spoken}”.`);
    const app = JSON.stringify(name);
    if ((await osa(`application ${app} is running`).catch(() => "false")) !== "true") { await this.caption(`${name} isn't open.`, "warn"); return; }
    const { elements } = await this.helper.call<{ elements: Seen[] }>("targets", { dock: true });
    const item = this.dockItem(name, elements);
    if (item) {
      const p = centre(item);
      await this.glide(p, rectOf(item), say || `Quitting ${name}`);
      await this.helper.call("click", { ...p, button: "right", count: 1, restore: true });
      await sleep(500);
      const menu = (await this.helper.call<{ elements: Seen[] }>("targets", { dock: true })).elements.filter((e) => e.area === "dock" && e.role === "AXMenuItem");
      const quit = menu.find((e) => /^quit\b/i.test(e.label));
      if (quit) {
        const q = centre(quit);
        await this.glide(q, rectOf(quit), `Clicking ${quit.label}`);
        await this.helper.call("click", { ...q, button: "left", count: 1, restore: true });
        return;
      }
      debug(`quit: no Quit in ${name}'s Dock menu (${menu.map((e) => e.label).join(", ")})`);
      await this.helper.call("key", { combo: "escape" }).catch(() => {});
    } else await this.caption(say || `Quitting ${name}`);
    await osa(`tell application ${app} to quit`).catch(() => { throw new Error(`${name} didn't quit. It may be asking you something.`); });
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
    this.mode("working", caption);
    this.moveAgent(to, ring, false);
    await sleep(this.settings().pointer.cursor.glideMs);
    this.goHomeLater();
  }

  private moveAgent(to: { x: number; y: number }, ring: Rect | null, docked: boolean, ms?: number) {
    if (this.homeTimer) clearTimeout(this.homeTimer);
    this.agent = { x: to.x, y: to.y };
    this.docked = docked;
    this.all({ kind: "agent", ...this.agent, ring, animate: true, docked, ms });
  }

  /** Peguin is free to wander: roaming is on, nothing is happening and the owner isn't drawing. */
  private idle() {
    return this.running && this.settings().pointer.cursor.home === "roam" && Date.now() - this.modeAt > 8000 && !this.penWindow && !this.numbered.length && Date.now() >= this.armedUntil;
  }

  /** Every 7 to 14 s, a slow drift around the middle of the screen the owner is on, away from their mouse. */
  private roam() {
    if (this.roamTimer) clearTimeout(this.roamTimer);
    if (!this.running) return;
    this.roamTimer = setTimeout(() => {
      if (this.idle()) {
        const mouse = screen.getCursorScreenPoint();
        const a = screen.getDisplayNearestPoint(mouse).workArea;
        this.moveAgent(roamTarget({ x: a.x, y: a.y, w: a.width, h: a.height }, mouse, this.agent), null, false, 2400);
      }
      this.roam();
    }, nextDrift() * 1000);
  }

  /**
   * The work log just noted the window the owner is in: Peguin goes and looks at it
   * (when it's roaming and free), so the owner can see it gathering context.
   */
  peek(win: Rect | undefined, appName: string) {
    if (!this.idle()) return;
    const p = glanceTarget(win, screen.getCursorScreenPoint());
    if (!p) return;
    this.moveAgent(p, null, false, 1800);
    this.mode("working", `Noting what you're on: ${appName}`);
    this.modeAt = 0; // a glance doesn't count as work; it can drift again soon
  }

  /** With home set to the island, it swims back after the owner's few seconds. */
  private goHomeLater() {
    const c = this.settings().pointer.cursor;
    if (this.homeTimer) clearTimeout(this.homeTimer);
    if (c.home !== "island") return;
    this.homeTimer = setTimeout(() => { if (this.running) this.moveAgent(homePoint(), null, true); }, c.returnAfterS * 1000);
  }

  /** Settings changed: new look for the cursor and island, and home if that's where it should be. */
  restyle() {
    if (!this.running) return;
    const p = this.settings().pointer;
    this.all({ kind: "style", cursor: p.cursor, island: p.island });
    if (p.cursor.home === "island") this.moveAgent(homePoint(), null, true);
    else if (this.docked) { const w = screen.getPrimaryDisplay().workArea; this.moveAgent({ x: w.x + w.width / 2, y: w.y + w.height / 2 }, null, false); }
    else if (this.homeTimer) clearTimeout(this.homeTimer);
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

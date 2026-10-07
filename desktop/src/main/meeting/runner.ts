// One meeting: a hidden Chromium window that joins as a guest, listens with
// whisper.cpp, decides with the shared TurnDetector, and speaks.
import { BrowserWindow, ipcMain, type IpcMainEvent } from "electron";
import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
import path from "node:path";
import { TurnDetector } from "../../../../src/realtime/turn.js";
import type { Settings } from "../settings.js";
import { synthesize } from "../speech/tts.js";
import { createListener, type Whisper } from "../speech/whisper.js";
import { botName, detectPlatform, webClientUrl, type Platform } from "./platform.js";

export type MeetingStatus = "joining" | "waiting" | "in_call" | "ended" | "failed";
export type MeetingEvent =
  | { kind: "status"; status: MeetingStatus; detail?: string }
  | { kind: "log"; text: string }
  | { kind: "heard"; text: string; action: string; sttMs: number };

const SIGN_IN_HOSTS = /^(login\.microsoftonline\.com|login\.live\.com|accounts\.google\.com)$/;

/** The words Penguin may say. Nothing here is a fact about the user's work. */
export function lines(s: Settings) {
  const first = (s.displayName.trim().split(/\s+/)[0] || "my owner");
  const notes = s.standingNotes.trim();
  return {
    // Non-negotiable: disclose first. The update is only what the user wrote.
    update: `Hi everyone, I'm Penguin, ${first}'s AI assistant. ${first} is in another meeting, so I'm covering the update. `
      + (notes || `I don't have an update prepared, so ${first} will share it after the call.`)
      + ` ${first} can follow up on anything after the call.`,
    defer: `Good question. I'll get ${first} to follow up on that after the call.`,
    ack: "Yes, I'm here. Go ahead.",
  };
}

export class MeetingRunner extends EventEmitter<{ event: [MeetingEvent] }> {
  readonly platform: Platform;
  private win?: BrowserWindow;
  private status: MeetingStatus = "joining";
  private readonly detach: Array<() => void> = [];

  constructor(
    private readonly url: string,
    private readonly settings: Settings,
    private readonly whisper: Whisper,
    private readonly paths: { preload: string; inject: string },
  ) {
    super();
    this.platform = detectPlatform(url);
  }

  private emitEvent(e: MeetingEvent) { this.emit("event", e); }
  private log(text: string) { this.emitEvent({ kind: "log", text }); }
  private setStatus(status: MeetingStatus, detail?: string) {
    if (this.status === "ended" || this.status === "failed") return;
    this.status = status;
    this.emitEvent({ kind: "status", status, detail });
  }

  async start() {
    if (this.platform === "unknown") throw new Error("That isn't a Google Meet, Zoom or Teams link.");
    const s = this.settings;
    const name = botName(s.displayName, this.platform);
    const first = s.displayName.trim().split(/\s+/)[0] ?? "";
    const names = [...new Set([s.displayName.trim(), first, ...s.aliases].filter(Boolean))];
    const say = lines(s);
    // Pre-synthesize so Penguin answers instantly when called on.
    const audio = { update: synthesize(say.update), defer: synthesize(say.defer), ack: synthesize(say.ack) };
    for (const a of Object.values(audio)) a.catch((e) => this.log(`speech output failed: ${e}`));

    const win = new BrowserWindow({
      width: 1280, height: 800, show: !s.runHidden, title: name,
      webPreferences: {
        preload: this.paths.preload,
        partition: `meeting-${Date.now()}`,   // fresh guest profile per meeting
        nodeIntegrationInSubFrames: true,     // Zoom's client runs in an iframe
        sandbox: true, contextIsolation: true, nodeIntegration: false,
        backgroundThrottling: false,
        autoplayPolicy: "no-user-gesture-required",
      },
    });
    this.win = win;
    const wc = win.webContents;
    wc.setAudioMuted(true); // never play the call out of the user's speakers
    wc.session.setPermissionRequestHandler((_wc, perm, cb) => cb(perm === "media"));
    wc.session.setPermissionCheckHandler((_wc, perm) => perm === "media");
    wc.setWindowOpenHandler(() => ({ action: "deny" }));
    wc.on("will-frame-navigate", (e) => {
      if (!/^(https?|about|blob|data):/i.test(e.url)) e.preventDefault(); // msteams:, zoommtg:
    });
    wc.on("will-navigate", (e) => {
      if (SIGN_IN_HOSTS.test(new URL(e.url).hostname) || /zoom\.us\/signin/.test(e.url)) {
        e.preventDefault(); this.log("Blocked a sign-in page: Penguin only joins as a guest.");
      }
    });
    // Typing through the DevTools protocol works in a hidden window; insertText freezes it.
    wc.debugger.attach("1.3");

    const turn = new TurnDetector({ names });
    const speak = async (what: Promise<Buffer>, label: string) => {
      turn.setSpeaking(true, Date.now());
      this.log(`Speaking: ${label}`);
      const buf = await what;
      for (const f of wc.mainFrame.framesInSubtree) f.send("mtg:speak", buf);
    };
    const onPcm = createListener({
      whisperUrl: this.whisper.url, names,
      onError: (e) => this.log(`speech recognition error: ${e}`),
      onUtterance: ({ text, sttMs }) => {
        const d = turn.onUtterance(text, Date.now());
        this.emitEvent({ kind: "heard", text, action: d.action, sttMs });
        if (d.action === "give_update") { turn.markUpdateGiven(); void speak(audio.update, "the update"); }
        else if (d.action === "answer") void speak(audio.defer, "deferring the question to you");
        else if (d.action === "acknowledge") void speak(audio.ack, "acknowledging");
      },
    });

    const inject = readFileSync(this.paths.inject, "utf8");
    const mine = (e: IpcMainEvent) => e.sender === wc;
    const on = (channel: string, fn: (e: IpcMainEvent, ...a: any[]) => void) => {
      const h = (e: IpcMainEvent, ...a: any[]) => { if (mine(e)) fn(e, ...a); };
      ipcMain.on(channel, h);
      this.detach.push(() => ipcMain.removeListener(channel, h));
    };
    on("mtg:config", (e) => { e.returnValue = { name, platform: this.platform, debug: false }; });
    on("mtg:inject", (e) => { e.returnValue = inject; });
    on("mtg:log", (_e, msg: string) => {
      this.log(msg);
      if (/waiting room/.test(msg)) this.setStatus("waiting");
      if (/refused us|gave up/.test(msg)) this.setStatus("failed", msg);
    });
    on("mtg:type", (_e, text: string) => { void wc.debugger.sendCommand("Input.insertText", { text }).catch(() => {}); });
    on("mtg:pcm", (_e, buf: ArrayBuffer) => onPcm(buf));
    on("mtg:in-call", () => this.setStatus("in_call", `Joined as "${name}". Muted until someone calls ${first || "you"}.`));
    on("mtg:playback-ended", () => turn.setSpeaking(false, Date.now()));
    on("mtg:ended", () => { this.setStatus("ended", "The call ended or Penguin was removed."); this.stop(); });
    on("mtg:level", () => {});

    win.on("closed", () => { this.setStatus("ended"); this.cleanup(); });
    this.setStatus("joining", `Joining as "${name}"`);
    await win.loadURL(webClientUrl(this.url, this.platform));
  }

  stop() {
    if (this.win && !this.win.isDestroyed()) this.win.destroy();
    this.setStatus("ended");
    this.cleanup();
  }

  private cleanup() {
    while (this.detach.length) this.detach.pop()!();
  }
}

export const meetingPaths = (appRoot: string, outDir: string) => ({
  preload: path.join(outDir, "preload/meeting.cjs"),
  inject: path.join(appRoot, "resources/meeting-inject.js"),
});

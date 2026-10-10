// One meeting: a hidden Chromium window that joins as a guest, listens with
// whisper.cpp, decides with the shared TurnDetector, and speaks.
import { BrowserWindow, ipcMain, type IpcMainEvent } from "electron";
import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
import path from "node:path";
import { TurnDetector } from "../../../../src/realtime/turn.js";
import type { Draft } from "../brain.js";
import type { Settings } from "../settings.js";
import { synthesize, type SynthesizeOptions } from "../speech/tts.js";
import { usingOwnVoice } from "../speech/voice/index.js";
import { sentences } from "../speech/voice/text.js";
import { createListener, transcribeSamples, type Whisper } from "../speech/whisper.js";
import { vocabulary } from "../speech/hints.js";
import { outDir, resource } from "../paths.js";
import { botName, detectPlatform, webClientUrl, type Platform } from "./platform.js";
import { MeetingLog, type MeetingRecord } from "./record.js";
import { stripCues } from "../../../../src/core/brain/prompts.js";

export type MeetingStatus = "joining" | "waiting" | "in_call" | "ended" | "failed";
export type MeetingEvent =
  | { kind: "status"; status: MeetingStatus; detail?: string }
  | { kind: "log"; text: string }
  | { kind: "heard"; text: string; action: string; sttMs: number };

/** How long someone must keep talking over Peguin before it stops (short enough to feel polite, long enough to skip coughs). */
const INTERRUPT_AFTER_MS = 800;

const SIGN_IN_HOSTS = /^(login\.microsoftonline\.com|login\.live\.com|accounts\.google\.com)$/;

/**
 * The fixed words Peguin says. The update itself is the prepared draft, never made up here.
 * In the owner's own voice, the disclosure also says so.
 */
export function lines(s: Settings, draft: Draft | null, ownVoice = false) {
  const first = (s.displayName.trim().split(/\s+/)[0] || "my owner");
  return {
    // Non-negotiable: disclose first.
    update: `Hi everyone, I'm Peguin, ${first}'s AI assistant${ownVoice ? `, speaking in ${first}'s voice` : ""}. ${first} is in another meeting, so I'm covering the update. `
      + (draft?.script ?? `I don't have an update prepared, so ${first} will share it after the call.`)
      + ` ${first} will follow up on anything else after the call.`,
    defer: `Good question. I'll get ${first} to follow up on that after the call.`,
    ack: "Yes, I'm here. Go ahead.",
    // The owner is joining themselves: say so before leaving, so nobody wonders where the assistant went.
    handover: `${first} is joining now, so I'll hand over. Thanks, everyone.`,
  };
}

export class MeetingRunner extends EventEmitter<{ event: [MeetingEvent]; record: [MeetingRecord] }> {
  readonly platform: Platform;
  private win?: BrowserWindow;
  private status: MeetingStatus = "joining";
  private readonly detach: Array<() => void> = [];
  /** What happened, for the recap; handed over once, when the meeting ends. */
  private meeting?: MeetingLog;
  /** Says the hand-over line and waits for it to finish; set once the meeting starts. */
  private handoff?: () => Promise<void>;

  constructor(
    readonly url: string,
    private readonly settings: Settings,
    private readonly whisper: Whisper,
    private readonly paths: { preload: string; inject: string },
    private readonly brain: { draft: Draft | null; answer: ((q: string, recent: string[]) => Promise<string>) | null },
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
    const own = usingOwnVoice(s);
    const say = lines(s, this.brain.draft, own);
    const standard = lines(s, this.brain.draft, false);
    // In the owner's voice, the prepared lines are checked by ear (redone, up to their attempts setting, if a word comes out wrong);
    // live answers skip the check to stay quick.
    const voice = (standardText?: string): SynthesizeOptions => ({
      settings: s, standardText,
      check: (wav) => transcribeSamples(this.whisper.url, wav, names),
      onFallback: (reason) => this.log(`Your voice wasn't available (${reason}); using the standard voice.`),
    });
    // Pre-synthesize so Peguin answers instantly when called on (usually already cached from preparing).
    const audio = {
      update: synthesize(say.update, voice(standard.update)),
      defer: synthesize(say.defer, voice()),
      ack: synthesize(say.ack, voice()),
      handover: synthesize(say.handover, voice()),
    };
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
        e.preventDefault(); this.log("Blocked a sign-in page: Peguin only joins as a guest.");
      }
    });
    // Typing through the DevTools protocol works in a hidden window; insertText freezes it.
    wc.debugger.attach("1.3");

    const turn = new TurnDetector({ names });
    const log = new MeetingLog({ url: this.url, platform: this.platform, joinedAs: name });
    this.meeting = log;
    const recent: string[] = [];
    const remember = (line: string) => { recent.push(line); if (recent.length > 12) recent.shift(); };
    // Facts-only answer when there's a draft; otherwise (or on any failure) defer.
    // Spoken a sentence at a time, so Peguin starts talking as soon as the first is ready.
    async function* reply(question: string): AsyncGenerator<Buffer> {
      const q = log.asked(question);
      const answer = self.brain.answer;
      if (!answer || !self.brain.draft?.facts.length) { q.deferred(say.defer); yield await audio.defer; return; }
      let text: string;
      try {
        text = await answer(question, recent);
      } catch (e) {
        self.log(`Couldn't answer (${e instanceof Error ? e.message : e}); deferring to you.`);
        q.deferred(say.defer);
        yield await audio.defer;
        return;
      }
      remember(`Peguin: ${text}`);
      q.answered(text);
      self.log(`Answer: ${stripCues(text)}`);
      for (const sentence of sentences(text)) yield await synthesize(sentence, { ...voice(), check: undefined });
    }
    const self = this;
    const frames = () => wc.mainFrame.framesInSubtree;
    // Each turn gets an id; talking over Peguin bumps it, which drops anything still being prepared.
    let turnId = 0;
    const speak = async (parts: Promise<Buffer> | AsyncIterable<Buffer>, label: string) => {
      const id = ++turnId;
      turn.setSpeaking(true, Date.now());
      this.log(`Speaking: ${label}`);
      try {
        for await (const buf of parts instanceof Promise ? [await parts] : parts) {
          if (id !== turnId) return;
          for (const f of frames()) f.send("mtg:speak", buf);
        }
      } catch (e) {
        this.log(`speech output failed: ${e instanceof Error ? e.message : e}`);
      }
      if (id === turnId) for (const f of frames()) f.send("mtg:speak-end");
    };
    let playbackDone: (() => void) | undefined;
    this.handoff = async () => {
      turnId++;
      for (const f of frames()) f.send("mtg:stop"); // cut off anything still playing
      const line = await audio.handover.catch(() => null);
      if (!line) return;
      log.said("handover", say.handover);
      const finished = new Promise<void>((r) => { playbackDone = r; setTimeout(r, 12000); });
      void speak(Promise.resolve(line), "handing over to you");
      await finished;
    };
    const interrupt = () => {
      if (!s.stopWhenInterrupted || !turn.isSpeaking) return;
      turnId++;
      turn.interrupted(Date.now());
      for (const f of frames()) f.send("mtg:stop");
      log.note("Someone talked over Peguin, so it stopped to listen");
      this.log("Someone started talking, so Peguin stopped to listen.");
    };
    const onPcm = createListener({
      whisperUrl: this.whisper.url, names,
      vocab: () => vocabulary(this.brain.draft?.facts ?? []),
      // About a second of someone else's voice while Peguin talks means they're talking over it.
      onSustainedSpeech: interrupt, sustainedMs: INTERRUPT_AFTER_MS,
      onError: (e) => this.log(`speech recognition error: ${e}`),
      onUtterance: ({ text, sttMs }) => {
        const d = turn.onUtterance(text, Date.now());
        remember(`Someone: ${text}`);
        log.heard(text);
        this.emitEvent({ kind: "heard", text, action: d.action, sttMs });
        if (d.action === "give_update") { turn.markUpdateGiven(); log.said("update", say.update); void speak(audio.update, "the update"); }
        else if (d.action === "answer") void speak(reply(d.question), "answering from your work");
        else if (d.action === "acknowledge") { log.said("ack", say.ack); void speak(audio.ack, "acknowledging"); }
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
    on("mtg:in-call", () => { log.joined(); this.setStatus("in_call", `Joined as "${name}". Muted until someone calls ${first || "you"}.`); });
    on("mtg:playback-ended", () => { turn.setSpeaking(false, Date.now()); playbackDone?.(); playbackDone = undefined; });
    on("mtg:ended", () => { this.setStatus("ended", "The call ended or Peguin was removed."); this.stop(); });
    on("mtg:level", () => {});

    win.on("closed", () => { this.setStatus("ended"); this.cleanup(); });
    this.setStatus("joining", `Joining as "${name}"`);
    await win.loadURL(webClientUrl(this.url, this.platform));
  }

  /** The owner is taking over: Peguin says so in the call, then leaves. */
  async handOver() {
    if (this.status === "in_call" && this.handoff) {
      this.log("Handing over to you.");
      await this.handoff().catch(() => {});
    }
    this.stop();
  }

  stop() {
    if (this.win && !this.win.isDestroyed()) this.win.destroy();
    this.setStatus("ended");
    this.cleanup();
  }

  private cleanup() {
    while (this.detach.length) this.detach.pop()!();
    const log = this.meeting;
    this.meeting = undefined;
    if (log) this.emit("record", log.end());
  }
}

export const meetingPaths = () => ({
  preload: path.join(outDir, "preload/meeting.cjs"),
  inject: resource("meeting-inject.js"),
});

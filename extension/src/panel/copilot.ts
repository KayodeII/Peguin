// The copilot itself, running in the side panel: starts both ears on the Meet
// tab (after the AI notice is confirmed in the meeting chat), merges what they
// hear, spots questions for the owner and streams suggested answers from the
// owner's own AI. The panel renders its snapshot.
import { AI_NOTICE, answerContext, copilotSystem, copilotWebSystem, isQuestion, plainSpoken } from "../../../src/core/brain/prompts.js";
import { ask, checkOnline } from "../ai.js";
import { CardQueue, type Card } from "../cards.js";
import { DEFAULT_MERGE, Merger, type Line, type Source } from "../merge.js";
import { isMeetUrl, type FromAudio, type FromMeet, type MeetState, type ToAudio, type ToMeet } from "../messages.js";
import { factsOf, loadApiKey, loadSettings, type Settings } from "../settings.js";

export type Phase = "idle" | "starting" | "notice" | "listening" | "ended";
export type Ear = { state: "off" | "loading" | "live" | "error"; detail?: string; progress?: number; level: number; lastHeard: number };

export type Snapshot = {
  phase: Phase;
  error?: string;
  noticeFailed?: string;
  meet: MeetState | null;
  ears: Record<Source, Ear>;
  lines: Line[];
  cards: Card[];
  startedAt: number;
};

const ear = (): Ear => ({ state: "off", level: 0, lastHeard: 0 });

export class Copilot {
  snap: Snapshot = { phase: "idle", meet: null, ears: { captions: ear(), audio: ear() }, lines: [], cards: [], startedAt: 0 };
  private listeners = new Set<() => void>();
  private merger = new Merger();
  private tabId: number | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private settings: Settings | null = null;
  private queue = new CardQueue((card, onText) => this.answer(card, onText), () => this.set({ cards: [...this.queue.cards] }));

  constructor() {
    chrome.runtime.onMessage.addListener((m: FromMeet | FromAudio, sender) => {
      if (m.type.startsWith("meet:") && sender.tab?.id !== this.tabId) return;
      this.onMessage(m);
    });
  }

  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => this.listeners.delete(fn); };
  private set(patch: Partial<Snapshot>) { this.snap = { ...this.snap, ...patch }; this.listeners.forEach((f) => f()); }
  private setEar(source: Source, patch: Partial<Ear>) { this.set({ ears: { ...this.snap.ears, [source]: { ...this.snap.ears[source], ...patch } } }); }

  async start() {
    this.set({ phase: "starting", error: undefined, noticeFailed: undefined });
    try {
      this.settings = await loadSettings();
      // The Meet tab in front, or else the only Meet call open in this window.
      const [front] = await chrome.tabs.query({ active: true, currentWindow: true });
      const meets = (await chrome.tabs.query({ currentWindow: true, url: "https://meet.google.com/*" })).filter((t) => isMeetUrl(t.url));
      const tab = isMeetUrl(front?.url) ? front : meets.length === 1 ? meets[0] : undefined;
      if (!tab?.id) throw new Error(meets.length > 1 ? "Switch to the Meet call you want help with, then press Start." : "Open your Google Meet call in this window, then press Start.");
      this.tabId = tab.id;
      const hello = await this.toMeet<{ state: MeetState }>({ type: "meet:hello" }).catch(() => null);
      if (!hello) throw new Error("Reload the Meet tab once (Peguin was installed after it opened), then press Start.");
      this.set({ meet: hello.state });
      if (hello.state !== "in-call") throw new Error("Join the call first, then press Start.");
      await this.notice();
    } catch (e) {
      this.set({ phase: "idle", error: e instanceof Error ? e.message : String(e) });
    }
  }

  /** The call is told in chat before anything is heard; the panel is hidden from tab shares, so this is the condition for running. */
  async notice() {
    this.set({ phase: "notice", noticeFailed: undefined });
    const failed = await this.toMeet<string>({ type: "meet:notice", text: AI_NOTICE }).catch((e) => String(e));
    if (failed) { this.set({ noticeFailed: failed }); return; }
    await this.listen();
  }

  private async listen() {
    const s = this.settings!;
    this.merger = new Merger({ ...DEFAULT_MERGE, priority: s.hearing.priority, active: { captions: s.hearing.captions, audio: s.hearing.audio } });
    this.set({ phase: "listening", startedAt: Date.now(), lines: [], ears: { captions: ear(), audio: ear() } });
    if (s.hearing.captions) {
      this.setEar("captions", { state: "loading", detail: "Turning on Meet captions" });
      const r = await this.toMeet<{ captions: boolean }>({ type: "meet:captions", on: true }).catch(() => ({ captions: false }));
      this.setEar("captions", r.captions ? { state: "live", detail: undefined } : { state: "error", detail: "Couldn't turn on captions. Press CC in Meet." });
    }
    if (s.hearing.audio) void this.startAudio();
    this.timer = setInterval(() => this.flush(), 250);
  }

  private async startAudio() {
    try {
      this.setEar("audio", { state: "loading", progress: 0 });
      const streamId = await chrome.tabCapture.getMediaStreamId({ targetTabId: this.tabId! });
      const ok = await chrome.runtime.sendMessage({ type: "offscreen:ensure" }) as { ok: boolean; error?: string };
      if (!ok.ok) throw new Error(ok.error);
      await chrome.runtime.sendMessage({ type: "audio:start", streamId, model: this.settings!.hearing.whisper } satisfies ToAudio);
    } catch (e) {
      const why = e instanceof Error ? e.message : String(e);
      this.audioDown(/not been invoked|activeTab/i.test(why)
        ? "Chrome only lets Peguin hear a tab after you click its toolbar icon on that tab. Click it on the Meet tab, then Start again. Captions carry on alone."
        : `Can't hear the tab (${why.replace(/\.+$/, "")}). Captions carry on alone.`);
    }
  }

  private audioDown(detail: string) {
    this.setEar("audio", { state: "error", detail, level: 0 });
    this.merger.options = { ...this.merger.options, active: { ...this.merger.options.active, audio: false } };
  }

  async stop(phase: Phase = "idle") {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.flush();
    if (this.tabId) await this.toMeet({ type: "meet:stop" }).catch(() => {});
    await chrome.runtime.sendMessage({ type: "audio:stop" } satisfies ToAudio).catch(() => {});
    this.set({ phase, ears: { captions: ear(), audio: ear() } });
  }

  /** A question the owner types themselves. */
  askTyped(text: string) {
    const now = Date.now();
    this.queue.add({ id: `t${now}`, text, speaker: "You asked", own: false, start: now, end: now, heardBy: [], via: "captions" }, now);
  }

  /** Who should win when both ears heard the same thing; applies at once. */
  setPriority(priority: Settings["hearing"]["priority"]) {
    this.merger.options = { ...this.merger.options, priority };
  }

  private onMessage(m: FromMeet | FromAudio) {
    const now = Date.now();
    switch (m.type) {
      case "meet:heard":
        if (this.snap.phase !== "listening") return;
        for (const h of m.heard) this.merger.push(h, now);
        this.setEar("captions", { lastHeard: now, state: "live" });
        return;
      case "meet:state":
        this.set({ meet: m.state });
        if (m.state === "ended" && this.snap.phase === "listening") void this.stop("ended");
        return;
      case "audio:heard":
        if (this.snap.phase !== "listening") return;
        this.merger.push(m.heard, now);
        this.setEar("audio", { lastHeard: now });
        return;
      case "audio:level":
        if (this.snap.ears.audio.state === "live") this.setEar("audio", { level: m.level });
        return;
      case "audio:status":
        if (m.status === "error") this.audioDown(m.detail ?? "Whisper stopped.");
        else if (m.status === "loading") this.setEar("audio", { state: "loading", progress: m.progress ?? this.snap.ears.audio.progress, detail: m.detail });
        else if (m.status === "listening") this.setEar("audio", { state: "live", detail: undefined, progress: undefined });
    }
  }

  private flush() {
    const lines = this.merger.flush(Date.now());
    if (!lines.length) return;
    this.set({ lines: [...this.snap.lines, ...lines].slice(-200) });
    for (const l of lines) if (!l.own && isQuestion(l.text)) this.queue.add(l, Date.now());
  }

  private recent(): string[] {
    return this.snap.lines.slice(-14).map((l) => `${l.own ? "Me" : l.speaker ?? "Someone"}: ${l.text}`);
  }

  private async answer(card: Card, onText: (soFar: string) => void): Promise<string> {
    const s = this.settings ?? await loadSettings();
    const key = await loadApiKey(s.provider);
    const model = s.models[s.provider];
    if (!key || !model) throw new Error("Connect your AI in Settings first.");
    const name = s.name || "the owner";
    let reply = "";
    for await (const piece of ask({ provider: s.provider, key, model, system: copilotSystem(name, s.mode), user: answerContext(factsOf(s.notes), undefined, this.recent(), card.question) })) {
      reply += piece;
      onText(plainSpoken(reply));
    }
    reply = plainSpoken(reply);
    if (s.web && s.provider === "anthropic" && reply.trimStart().startsWith("General knowledge:")) void this.check(card, s, key, model, reply);
    return reply;
  }

  private async check(card: Card, s: Settings, key: string, model: string, quick: string) {
    card.web = { state: "checking" };
    this.set({ cards: [...this.queue.cards] });
    try {
      const user = `Recent conversation:\n${this.recent().join("\n")}\n\nQuestion: ${card.question}\n\nQuick answer from memory: ${quick}`;
      const r = await checkOnline({ provider: s.provider, key, model, system: copilotWebSystem(s.name || "the owner", s.mode), user });
      card.web = { state: "done", answer: plainSpoken(r.answer), source: r.source };
    } catch {
      card.web = { state: "failed" };
    }
    this.set({ cards: [...this.queue.cards] });
  }

  private toMeet<T>(m: ToMeet): Promise<T> {
    return chrome.tabs.sendMessage(this.tabId!, m) as Promise<T>;
  }
}

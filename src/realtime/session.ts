import type WebSocket from "ws";
import type { Redis } from "ioredis";
import { answerFollowUp, disclosure } from "../core/brain/claude.js";
import { log } from "../core/log.js";
import { meetingChannel } from "../core/redis.js";
import * as repo from "../core/repo.js";
import { openListener, speak } from "../core/speech/deepgram.js";
import { TurnDetector } from "./turn.js";

/**
 * One live meeting. Lives entirely on the realtime node that holds the bot
 * page's WebSocket, so nothing about it needs to be shared between nodes.
 * Durable state (transcript, "update given") goes to Postgres; live events
 * go to Redis pub/sub for any dashboard or API node that wants them.
 */
export class MeetingSession {
  private readonly turn: TurnDetector;
  private listener?: ReturnType<typeof openListener>;
  private updateAudio?: Promise<Buffer>;
  private ackAudio?: Promise<Buffer>;
  private static readonly ACK = "Yes, I'm here. Go ahead.";
  private busy = false;               // generating or playing audio
  private playbackTimer?: NodeJS.Timeout;
  private onPlaybackDone?: () => void;
  private segments: string[] = [];
  private segmentSpeaker: number | null = null;
  private unsaved: repo.Utterance[] = [];
  private recent: repo.Utterance[] = [];
  private flushTimer?: NodeJS.Timeout;
  private closed = false;
  private readonly l: typeof log;

  constructor(
    private readonly meeting: repo.Meeting,
    private readonly user: repo.User,
    private readonly page: WebSocket,
    private readonly pub: Redis,
  ) {
    const names = [user.name, user.name.split(/\s+/)[0]!, ...user.aliases].filter(Boolean);
    this.turn = new TurnDetector({ names });
    this.l = log.child({ meetingId: meeting.id });
  }

  get id() { return this.meeting.id; }

  start() {
    if (this.meeting.update_given_at) this.turn.markUpdateGiven(); // reconnect after a node restart
    // Synthesize the update now, so Penguin answers instantly when called on.
    this.updateAudio = speak(this.updateText());
    this.updateAudio.catch((e) => this.l.error({ err: String(e) }, "pre-synthesis failed"));
    this.ackAudio = speak(MeetingSession.ACK);
    this.ackAudio.catch((e) => this.l.error({ err: String(e) }, "pre-synthesis failed"));

    this.listener = openListener({
      keywords: [this.user.name.split(/\s+/)[0]!, ...this.user.aliases].slice(0, 10),
      onTranscript: (e) => {
        if (!e.isFinal) return this.sendPage({ type: "caption", text: [...this.segments, e.text].join(" "), interim: true });
        this.segments.push(e.text);
        this.segmentSpeaker ??= e.speaker;
        if (e.speechFinal) this.endUtterance();
      },
      onUtteranceEnd: () => this.endUtterance(),
      onError: (err) => this.l.error({ err: String(err) }, "speech-to-text error"),
    });

    this.page.on("message", (data, isBinary) => {
      if (isBinary) return this.listener?.send(data as Buffer);
      let m: any;
      try { m = JSON.parse(data.toString()); } catch { return; }
      if (m.type === "playback_ended") this.finishPlayback();
    });

    this.flushTimer = setInterval(() => void this.flush(), 5000);
    void this.emit({ type: "session_started" });
    this.sendPage({ type: "state", state: "listening", label: `${this.user.name.split(/\s+/)[0]}'s assistant` });
    this.l.info("session started");
  }

  /** Manual override from the API ("speak now"), delivered over Redis. */
  async command(cmd: { type: "give_update" } | { type: "leave_silent" }) {
    if (cmd.type === "give_update" && !this.busy) await this.giveUpdate();
  }

  private updateText(): string {
    const script = this.meeting.draft?.script
      ?? `${this.user.name.split(/\s+/)[0]} doesn't have an update prepared today. ${this.user.standing_notes || "They'll share details in the team channel."}`;
    return `${disclosure(this.user)} ${script}`;
  }

  private endUtterance() {
    const text = this.segments.join(" ").trim();
    const speakerNum = this.segmentSpeaker;
    this.segments = [];
    this.segmentSpeaker = null;
    if (!text) return;
    const u: repo.Utterance = { speaker: speakerNum === null ? null : `Speaker ${speakerNum + 1}`, text, is_bot: false, at: new Date() };
    this.record(u);
    this.sendPage({ type: "caption", text, interim: false });

    if (this.busy) return;
    const d = this.turn.onUtterance(text, Date.now());
    if (d.action === "give_update") void this.giveUpdate();
    else if (d.action === "answer") void this.answer(d.question);
    else if (d.action === "acknowledge") void this.acknowledge();
  }

  /** Called by name with no question yet: let them know Penguin is listening. */
  private async acknowledge() {
    this.busy = true;
    try {
      await this.play(await (this.ackAudio ?? speak(MeetingSession.ACK)), MeetingSession.ACK);
    } catch (e) {
      this.l.error({ err: String(e) }, "failed to acknowledge");
    } finally {
      this.busy = false;
    }
  }

  private async giveUpdate() {
    this.busy = true;
    try {
      const audio = await (this.updateAudio ?? speak(this.updateText()));
      await this.play(audio, this.updateText());
      this.turn.markUpdateGiven();
      await repo.markUpdateGiven(this.meeting.id);
      void this.emit({ type: "update_given" });
    } catch (e) {
      this.l.error({ err: String(e) }, "failed to give update");
    } finally {
      this.busy = false;
    }
  }

  private async answer(question: string) {
    this.busy = true;
    this.sendPage({ type: "state", state: "thinking" });
    try {
      const reply = await answerFollowUp(this.user, this.meeting.draft, question, this.recent.slice(-12));
      await this.play(await speak(reply), reply);
    } catch (e) {
      this.l.error({ err: String(e) }, "failed to answer follow-up");
    } finally {
      this.busy = false;
      this.sendPage({ type: "state", state: "listening" });
    }
  }

  /** Send MP3 to the page and resolve when it reports playback finished. */
  private play(audio: Buffer, text: string): Promise<void> {
    return new Promise((resolve) => {
      this.turn.setSpeaking(true, Date.now());
      this.sendPage({ type: "state", state: "speaking", text });
      this.page.send(audio, { binary: true });
      this.record({ speaker: "Penguin", text, is_bot: true, at: new Date() });
      // Safety net if the page never reports back: ~2.5 words/sec + margin.
      const ms = (text.split(/\s+/).length / 2.5) * 1000 + 5000;
      this.onPlaybackDone = resolve;
      this.playbackTimer = setTimeout(() => this.finishPlayback(), ms);
    });
  }

  private finishPlayback() {
    clearTimeout(this.playbackTimer);
    this.turn.setSpeaking(false, Date.now());
    this.sendPage({ type: "state", state: "listening" });
    const done = this.onPlaybackDone;
    this.onPlaybackDone = undefined;
    done?.();
  }

  private record(u: repo.Utterance) {
    this.unsaved.push(u);
    this.recent.push(u);
    if (this.recent.length > 50) this.recent.shift();
    void this.emit({ type: "utterance", speaker: u.speaker, text: u.text, is_bot: u.is_bot });
  }

  private async flush() {
    const batch = this.unsaved.splice(0);
    try { await repo.insertUtterances(this.meeting.id, batch); }
    catch (e) { this.unsaved.unshift(...batch); this.l.error({ err: String(e) }, "transcript flush failed"); }
  }

  private sendPage(m: object) {
    if (this.page.readyState === 1) this.page.send(JSON.stringify(m));
  }

  private emit(event: object) {
    return this.pub.publish(meetingChannel(this.meeting.id), JSON.stringify({ meetingId: this.meeting.id, ...event })).catch(() => {});
  }

  async close(reason: string) {
    if (this.closed) return;
    this.closed = true;
    clearInterval(this.flushTimer);
    clearTimeout(this.playbackTimer);
    this.listener?.close();
    await this.flush();
    await this.emit({ type: "session_ended", reason });
    this.l.info({ reason }, "session closed");
  }
}

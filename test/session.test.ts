import { EventEmitter } from "node:events";
import { describe, expect, it, vi, beforeEach } from "vitest";

// Fake speech-to-text: tests push transcript events through `stt`.
const stt: { onTranscript?: (e: any) => void; onUtteranceEnd?: () => void; sent: number } = { sent: 0 };
vi.mock("../src/core/speech/deepgram.js", () => ({
  openListener: (o: any) => { stt.onTranscript = o.onTranscript; stt.onUtteranceEnd = o.onUtteranceEnd; return { send: () => stt.sent++, close: () => {} }; },
  speak: vi.fn(async (text: string) => Buffer.from(`mp3:${text}`)),
}));
vi.mock("../src/core/brain/claude.js", () => ({
  disclosure: () => "Hi, this is Peguin, Mujeeb's AI assistant.",
  answerFollowUp: vi.fn(async () => "Yes, it merged yesterday."),
}));
const saved: any[] = [];
vi.mock("../src/core/repo.js", () => ({
  insertUtterances: vi.fn(async (_id: string, u: any[]) => { saved.push(...u); }),
  markUpdateGiven: vi.fn(async () => {}),
}));

const { MeetingSession } = await import("../src/realtime/session.js");

class FakePage extends EventEmitter {
  readyState = 1;
  out: (string | Buffer)[] = [];
  send(d: any) { this.out.push(d); }
  audio() { return this.out.filter((x) => Buffer.isBuffer(x)).map(String); }
}
const say = (text: string) => stt.onTranscript!({ text, isFinal: true, speechFinal: true, speaker: 0 });
const tick = (ms = 20) => new Promise((r) => setTimeout(r, ms));

const meeting: any = { id: "m1", draft: { script: "Mujeeb merged the dispute webhook PR.", facts: ["PR merged"] }, update_given_at: null };
const user: any = { id: "u1", name: "Mujeeb Adebowale", aliases: ["MJ"], standing_notes: "" };
const pub: any = { publish: vi.fn(async () => 1) };

describe("MeetingSession", () => {
  beforeEach(() => { saved.length = 0; });

  it("stays quiet, gives the update when called on, then answers a follow-up", async () => {
    const page = new FakePage();
    const s = new MeetingSession(meeting, user, page as any, pub);
    s.start();

    page.emit("message", Buffer.alloc(3200), true);
    expect(stt.sent).toBe(1); // meeting audio forwarded to speech-to-text

    say("Morning all, Tolu you go first");
    await tick();
    expect(page.audio()).toHaveLength(0);

    say("Thanks Tolu. Mujib, you're up");
    await tick();
    expect(page.audio()).toEqual(["mp3:Hi, this is Peguin, Mujeeb's AI assistant. Mujeeb merged the dispute webhook PR."]);

    say("Mujeeb, you're up"); // while speaking: ignored
    await tick();
    expect(page.audio()).toHaveLength(1);

    page.emit("message", Buffer.from(JSON.stringify({ type: "playback_ended" })), false);
    await tick(1300); // past the echo tail
    say("Nice, is that PR merged?");
    await tick();
    expect(page.audio()[1]).toBe("mp3:Yes, it merged yesterday.");

    await s.close("test");
    expect(saved.map((u) => u.is_bot)).toContain(true);
    expect(saved.find((u) => u.text.startsWith("Thanks Tolu"))?.speaker).toBe("Speaker 1");
  });
});

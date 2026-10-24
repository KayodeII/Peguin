import { describe, expect, it } from "vitest";
import { chatModels, sseDeltas } from "../extension/src/ai.js";
import { CaptionTracker, splitBlock } from "../extension/src/captions.js";
import { CardQueue, MAX_WAITING, splitLabel } from "../extension/src/cards.js";
import { clean, DEFAULT_MERGE, isNoise, Merger, pick, similarity, type Heard, type Line } from "../extension/src/merge.js";
import { Vad } from "../extension/src/vad.js";
import { factsOf } from "../extension/src/settings.js";

const cap = (id: string, text: string, start: number, end: number, speaker = "Maya", final = true): Heard => ({ source: "captions", id, text, speaker, start, end, final });
const aud = (id: string, text: string, start: number, end: number): Heard => ({ source: "audio", id, text, start, end, final: true });

describe("cleaning what was heard", () => {
  it("drops whisper tags, fillers and stutters and capitalises", () => {
    expect(clean("um so [BLANK_AUDIO] the the deploy is, uh, done ♪")).toBe("So the deploy is done");
    expect(clean("(music) what's the ETA?")).toBe("What's the ETA?");
  });
  it("keeps a repeated word across a sentence end", () => {
    expect(clean("Yes. Yes we can.")).toBe("Yes. Yes we can.");
  });
  it("treats whisper's silence phrases as noise, not speech", () => {
    expect(isNoise("Thank you.")).toBe(true);
    expect(isNoise("Thanks for watching!")).toBe(true);
    expect(isNoise("Thank you for the update on payments")).toBe(false);
  });
});

describe("matching the two ears", () => {
  it("scores word overlap regardless of punctuation and case", () => {
    expect(similarity("When will the API ship?", "when will the api ship").dice).toBe(1);
    expect(similarity("When will the API ship?", "Lunch is at noon").dice).toBe(0);
  });
  it("prefers captions unless whisper clearly heard more of the same thing", () => {
    expect(pick("When will it ship?", "When will it ship?", "auto")).toBe("captions");
    expect(pick("When will the", "When will the payments API ship to production", "auto")).toBe("audio");
    expect(pick("When will the", "Something else entirely and much longer here", "auto")).toBe("captions");
    expect(pick("a", "b", "audio")).toBe("audio");
  });
});

describe("Merger", () => {
  it("pairs the same speech from both sources into one line with the caption's speaker", () => {
    const m = new Merger();
    m.push(cap("c1", "When will the payments API ship?", 1000, 3000), 3100);
    m.push(aud("a1", "when will the payments api ship", 900, 3200), 3300);
    const lines = m.flush(3300);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ speaker: "Maya", heardBy: ["captions", "audio"], via: "captions", own: false });
  });

  it("waits for the twin, then emits a single source alone", () => {
    const m = new Merger();
    m.push(cap("c1", "Can you walk us through the rollout?", 1000, 2000), 2000);
    expect(m.flush(2500)).toHaveLength(0);
    expect(m.flush(2000 + DEFAULT_MERGE.waitMs)).toHaveLength(1);
  });

  it("doesn't wait for a source that's off", () => {
    const m = new Merger({ ...DEFAULT_MERGE, active: { captions: true, audio: false } });
    m.push(cap("c1", "Is the migration done?", 1000, 2000), 2000);
    expect(m.flush(2001)).toHaveLength(1);
  });

  it("emits the owner's own caption at once (their mic never reaches the tab audio)", () => {
    const m = new Merger();
    m.push(cap("c1", "I'll check and get back to you", 1000, 2000, "You"), 2000);
    const [line] = m.flush(2001);
    expect(line?.own).toBe(true);
  });

  it("holds captions until they're final, and uses the latest text", () => {
    const m = new Merger({ ...DEFAULT_MERGE, active: { captions: true, audio: false } });
    m.push(cap("c1", "When will", 1000, 1500, "Maya", false), 1500);
    expect(m.flush(1600)).toHaveLength(0);
    m.push(cap("c1", "When will it ship?", 1000, 2500, "Maya", true), 2500);
    expect(m.flush(2600).map((l) => l.text)).toEqual(["When will it ship?"]);
  });

  it("drops a twin that arrives after its line went out, but learns the speaker", () => {
    const m = new Merger();
    m.push(aud("a1", "who owns the billing service", 1000, 2000), 2000);
    const [line] = m.flush(2000 + DEFAULT_MERGE.waitMs);
    expect(line?.speaker).toBeUndefined();
    m.push(cap("c1", "Who owns the billing service?", 1000, 2200, "Sam"), 4000);
    expect(m.flush(4000 + DEFAULT_MERGE.waitMs)).toHaveLength(0);
    expect(line).toMatchObject({ speaker: "Sam", heardBy: ["audio", "captions"] });
  });

  it("doesn't pair different speech that happens to be close in time (false positive)", () => {
    const m = new Merger();
    m.push(cap("c1", "Let's move to the next item", 1000, 2000), 2000);
    m.push(aud("a1", "Sorry, is my screen visible to everyone", 1100, 2100), 2100);
    expect(m.flush(2100)).toHaveLength(0);
    expect(m.flush(2100 + DEFAULT_MERGE.waitMs)).toHaveLength(2);
  });

  it("doesn't pair the same words said far apart in time", () => {
    const m = new Merger();
    m.push(cap("c1", "Any blockers today?", 1000, 2000), 2000);
    m.push(aud("a1", "Any blockers today?", 60_000, 61_000), 61_000);
    expect(m.flush(70_000)).toHaveLength(2);
  });

  it("drops whisper noise without emitting a line", () => {
    const m = new Merger();
    m.push(aud("a1", "Thank you.", 1000, 1500), 1500);
    expect(m.flush(10_000)).toHaveLength(0);
  });
});

describe("caption tracking", () => {
  it("reads speaker and text from a caption block", () => {
    expect(splitBlock("Maya Chen\nWhen will it ship?")).toEqual({ speaker: "Maya Chen", text: "When will it ship?" });
    expect(splitBlock("Only one line")).toBeNull();
  });

  it("sends growing pieces, then one final piece after a pause, then the next piece", () => {
    const t = new CaptionTracker(1000);
    t.observe("b1", "Maya", "When will", 0);
    expect(t.tick(100)).toMatchObject([{ text: "When will", final: false }]);
    expect(t.tick(200)).toEqual([]); // unchanged: nothing new
    t.observe("b1", "Maya", "When will it ship?", 300);
    const final = t.tick(1400);
    expect(final).toMatchObject([{ id: "b1#1", text: "When will it ship?", final: true }]);
    t.observe("b1", "Maya", "When will it ship? And who owns it?", 2000);
    expect(t.tick(3100)).toMatchObject([{ id: "b1#2", text: "And who owns it?", final: true, start: 2000 }]);
  });

  it("finalises what's left when the block leaves the page", () => {
    const t = new CaptionTracker(1000);
    t.observe("b1", "Sam", "Quick question", 0);
    expect(t.gone("b1", 200)).toMatchObject([{ text: "Quick question", final: true }]);
    expect(t.tick(5000)).toEqual([]);
  });
});

describe("voice detection", () => {
  const frame = (amp: number) => Float32Array.from({ length: 1600 }, (_, i) => amp * Math.sin(i / 3));
  it("cuts an utterance after the silence and ignores short clicks", () => {
    const v = new Vad();
    let t = 0;
    for (let i = 0; i < 10; i++) v.push(frame(0.001), (t += 100));
    expect(v.push(frame(0.3), (t += 100))).toBeNull(); // one loud frame: a click
    for (let i = 0; i < 8; i++) v.push(frame(0.001), (t += 100));
    let cut = null;
    for (let i = 0; i < 10; i++) v.push(frame(0.3), (t += 100));
    for (let i = 0; i < 10 && !cut; i++) cut = v.push(frame(0.001), (t += 100));
    expect(cut).not.toBeNull();
    expect(cut!.samples.length).toBeGreaterThanOrEqual(16000);
  });
});

describe("cards", () => {
  it("splits the label, even while it's still streaming", () => {
    expect(splitLabel("From your notes: shipped on Tuesday")).toEqual({ label: "notes", body: "shipped on Tuesday" });
    expect(splitLabel("General kno")).toEqual({ body: "" });
    expect(splitLabel("Not in your notes. I'll check.")).toEqual({ label: "unknown", body: "I'll check." });
  });

  it("answers in order and skips the oldest beyond the waiting limit", async () => {
    const order: string[] = [];
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => (release = r));
    const q = new CardQueue(async (c) => { order.push(c.question); if (order.length === 1) await gate; return "General knowledge: yes"; }, () => {});
    const line = (text: string): Line => ({ id: text, text, own: false, start: 0, end: 0, heardBy: ["captions", "audio"], via: "captions" });
    for (let i = 1; i <= MAX_WAITING + 2; i++) q.add(line(`q${i}?`), i);
    release();
    await new Promise((r) => setTimeout(r, 10));
    expect(q.cards.find((c) => c.question === "q2?")?.state).toBe("skipped");
    expect(order).toEqual(["q1?", "q3?", "q4?", "q5?"]);
    expect(q.cards.every((c) => ["answered", "skipped"].includes(c.state))).toBe(true);
    expect(q.cards[0]).toMatchObject({ label: "general", answer: "yes", confirmed: true });
  });
});

describe("the user's own AI", () => {
  it("lists chat models only, the default Claude first", () => {
    expect(chatModels("anthropic", ["claude-haiku-5-5", "claude-opus-5-5"])).toEqual(["claude-opus-5-5", "claude-haiku-5-5"]);
    expect(chatModels("openai", ["gpt-5", "whisper-1", "gpt-image-1", "text-embedding-3-large"])).toEqual(["gpt-5"]);
    expect(chatModels("xai", ["grok-4", "grok-imagine-video"])).toEqual(["grok-4"]);
  });
  it("parses streamed deltas and keeps an unfinished line", () => {
    const { deltas, rest } = sseDeltas('data: {"choices":[{"delta":{"content":"Hel"}}]}\n\ndata: {"choices":[{"delta":{"content":"lo"}}]}\ndata: [DONE]\ndata: {"cho');
    expect(deltas).toEqual(["Hel", "lo"]);
    expect(rest).toBe('data: {"cho');
  });
  it("turns notes into facts", () => {
    expect(factsOf("- Shipped retries\n\n• Next: webhooks\n")).toEqual(["Shipped retries", "Next: webhooks"]);
  });
});

import { describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({
  app: { getPath: () => "/tmp/peguin-test", isPackaged: false },
  BrowserWindow: class {},
  ipcMain: { on: () => {}, removeListener: () => {} },
  safeStorage: { isEncryptionAvailable: () => false },
}));

const { puncNorm, respell, sentences, wordError, words } = await import("../desktop/src/main/speech/voice/text.js");
const { rng, sampleToken } = await import("../desktop/src/main/speech/voice/sampling.js");
const { decodeWav, encodeWav, fade, joinSentences, level, SAMPLE_RATE, trimSilence } = await import("../desktop/src/main/speech/voice/audio.js");
const { Settings } = await import("../desktop/src/main/settings.js");
const { lines } = await import("../desktop/src/main/meeting/runner.js");

describe("own voice: text", () => {
  it("tidies punctuation the way Resemble's punc_norm does", () => {
    expect(puncNorm("  yesterday: merged it — then tests…")).toBe("Yesterday, merged it, then tests.");
    expect(puncNorm("No blockers")).toBe("No blockers.");
  });
  it("splits into sentences", () => {
    expect(sentences("It's in progress. No date yet! Ask Mujeeb?")).toEqual(["It's in progress.", "No date yet!", "Ask Mujeeb?"]);
  });
  it("respells the owner's words: whole words only, any case, including possessives", () => {
    expect(respell("I'm Peguin, Mujeeb's AI assistant. Peguins! mujeeb", { Peguin: "Peh-gwin", Mujeeb: "Moo-jeeb" }))
      .toBe("I'm Peh-gwin, Moo-jeeb's AI assistant. Peguins! Moo-jeeb");
    expect(respell("Nothing to change.", {})).toBe("Nothing to change.");
  });
  it("compares words, reading digits as numbers", () => {
    expect(words("PR 482 is merged")).toEqual(["pr", "four", "hundred", "eighty", "two", "is", "merged"]);
    expect(wordError("Thanks, will do.", "Thanks, will do")).toBe(0);
    expect(wordError("Thanks, will do.", "Dance with do.")).toBeGreaterThan(0.5);
  });
  it("treats a flipped negation as completely wrong, even if it's one word", () => {
    expect(wordError("Mujeeb can follow up on anything after the call.", "Mujeeb can't follow up on anything after the call.")).toBe(1);
    expect(wordError("No blockers.", "Blockers.")).toBe(1);
  });
  it("doesn't count how recognition hears an accented name as a mistake", () => {
    expect(wordError("Mujeeb will follow up.", "Mujib will follow up.")).toBeGreaterThan(0);
    expect(wordError("Mujeeb will follow up.", "Mujib will follow up.", { mujib: "mujeeb" })).toBe(0);
  });
});

describe("own voice: sampling", () => {
  it("is repeatable with a seed", () => {
    const logits = Float32Array.from({ length: 50 }, (_, i) => Math.sin(i) * 3);
    const a = rng(7), b = rng(7);
    expect(Array.from({ length: 20 }, () => sampleToken(logits, [], a, 0.6))).toEqual(Array.from({ length: 20 }, () => sampleToken(logits, [], b, 0.6)));
  });
  it("almost always picks a clear winner, and penalises repeats", () => {
    const logits = new Float32Array(10).fill(0); logits[3] = 20;
    const r = rng(1);
    expect(sampleToken(logits, [], r, 0.6)).toBe(3);
    const close = new Float32Array(10).fill(0); close[3] = 2.0; close[4] = 1.9;
    const picks = Array.from({ length: 200 }, () => sampleToken(close, [3], r, 0.6));
    expect(picks.filter((p) => p === 4).length).toBeGreaterThan(picks.filter((p) => p === 3).length);
  });
  it("only picks from the top-p set", () => {
    const logits = new Float32Array(100).fill(-50); logits[0] = 10; logits[1] = 9;
    const r = rng(3);
    for (let i = 0; i < 100; i++) expect([0, 1]).toContain(sampleToken(logits, [], r, 0.6));
  });
  it("is steadier at low expressiveness than high", () => {
    const logits = Float32Array.from([2, 1.6, 1.2, 0.8]);
    const spread = (t: number) => { const r = rng(5); return new Set(Array.from({ length: 300 }, () => sampleToken(logits, [], r, t))).size; };
    const low = Array.from({ length: 300 }, ((r) => () => sampleToken(logits, [], r, 0.3))(rng(9))).filter((x) => x === 0).length;
    const high = Array.from({ length: 300 }, ((r) => () => sampleToken(logits, [], r, 0.9))(rng(9))).filter((x) => x === 0).length;
    expect(low).toBeGreaterThan(high);
    expect(spread(0.9)).toBeGreaterThanOrEqual(spread(0.3));
  });
});

describe("own voice: audio", () => {
  const tone = (s: number, amp = 0.5) => Float32Array.from({ length: Math.round(s * SAMPLE_RATE) }, (_, i) => amp * Math.sin(i / 10));
  it("trims silence but keeps a little padding", () => {
    const wav = new Float32Array(SAMPLE_RATE * 2); wav.set(tone(0.5), SAMPLE_RATE / 2);
    const t = trimSilence(wav);
    expect(t.length / SAMPLE_RATE).toBeGreaterThan(0.5);
    expect(t.length / SAMPLE_RATE).toBeLessThan(0.62);
  });
  it("joins sentences with the owner's pause and levels loudness without clipping", () => {
    const out = level(joinSentences([tone(0.5, 0.01), tone(0.5, 0.9)], 0.4));
    expect(out.length / SAMPLE_RATE).toBeCloseTo(0.5 + 0.4 + 0.5 + 0.2, 2);
    expect(Math.max(...out.map(Math.abs))).toBeLessThanOrEqual(0.95);
  });
  it("fades the ends so joins don't click", () => {
    const f = fade(tone(0.2));
    expect(Math.abs(f[0]!)).toBe(0);
  });
  it("round-trips WAV", () => {
    const wav = tone(0.1);
    const back = decodeWav(encodeWav(wav)).samples;
    expect(back.length).toBe(wav.length);
    expect(Math.abs(back[100]! - wav[100]!)).toBeLessThan(1e-3);
  });
});

describe("own voice: settings and disclosure", () => {
  it("starts with no built-in pronunciations and default tuning the owner can change", () => {
    expect(Settings.parse({}).voice).toEqual({ mode: "standard", pronunciations: [], pause: 0.32, expressiveness: 0.6, attempts: 3 });
    expect(() => Settings.parse({ voice: { pause: 5 } })).toThrow();
  });
  it("migrates older voice settings instead of resetting everything", () => {
    const old = Settings.parse({ displayName: "Mujeeb Adebowale", voice: "default" });
    expect(old.voice.mode).toBe("standard");
    expect(old.displayName).toBe("Mujeeb Adebowale");
    const named = Settings.parse({ displayName: "Mujeeb Adebowale", voice: { mode: "mine", namePronounced: "Moo jeeb" } });
    expect(named.voice.mode).toBe("mine");
    expect(named.voice.pronunciations).toEqual([{ word: "Mujeeb", sayAs: "Moo jeeb" }]);
    expect(Settings.parse({ displayName: "Ada Obi", voice: { namePronounced: "" } }).voice.pronunciations).toEqual([]);
  });
  it("always discloses it's an AI, and says so when it's the owner's voice", () => {
    const s = Settings.parse({ displayName: "Mujeeb Adebowale" });
    expect(lines(s, null).update).toMatch(/^Hi everyone, I'm Peguin, Mujeeb's AI assistant\. /);
    expect(lines(s, null, true).update).toMatch(/^Hi everyone, I'm Peguin, Mujeeb's AI assistant, speaking in Mujeeb's voice\. /);
  });
});

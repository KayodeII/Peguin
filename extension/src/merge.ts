// Two ears on one meeting: Meet's own live captions (fast, with speaker names,
// including the owner's own lines as "You") and the tab's audio through
// whisper (only the other participants, no names). Each piece of speech can
// arrive from either, both or neither, late and in any order. The Merger
// cleans each piece, pairs pieces from the two sources that are the same
// speech (close in time, similar words), picks the better text by the chosen
// priority, and emits each utterance exactly once. Pure: time is passed in.

export type Source = "captions" | "audio";
export type Priority = "auto" | "captions" | "audio";

/** One piece of heard speech from one source. Captions update in place (same id) until final. */
export type Heard = {
  source: Source;
  id: string;
  text: string;
  /** Captions only: who said it, as Meet shows it ("You" for the owner). */
  speaker?: string;
  /** Epoch ms. */
  start: number;
  end: number;
  final: boolean;
};

/** One utterance, after cleaning and matching. */
export type Line = {
  id: string;
  text: string;
  speaker?: string;
  /** The owner said it (Meet's "You"). Context only, never a question for them. */
  own: boolean;
  start: number;
  end: number;
  /** Which sources heard it; two means they agreed. */
  heardBy: Source[];
  /** Whose text was kept. */
  via: Source;
};

export type MergeOptions = {
  priority: Priority;
  /** Which sources are running now. A source that's off is never waited for. */
  active: Record<Source, boolean>;
  /** How long a finished piece waits for its twin from the other source. */
  waitMs: number;
  /** Slack when deciding whether two pieces overlap in time. */
  slackMs: number;
};

export const DEFAULT_MERGE: MergeOptions = { priority: "auto", active: { captions: true, audio: true }, waitMs: 1600, slackMs: 2500 };

const FILLER_RE = /(^|,?\s+)(u+m+|u+h+|erm|er|h+m+|m+h?m+|ah)(?=[\s,.!?]|$),?/gi;
/** Whole-utterance phrases whisper invents from silence or noise. */
const NOISE = new Set(["you", "thank you", "thanks", "thank you very much", "thanks for watching", "thanks for watching!", "bye", "okay", "so", "the end",
  "please subscribe", "subtitles by the amara.org community", "i'm sorry", "oh"]);

/** Readable text: no whisper tags, fillers or stutters, tidy spacing, a capital first letter (pure). */
export function clean(text: string): string {
  let t = text
    .replace(/\[[^\]]*\]|\([^)]*(music|applause|laughter|inaudible|blank|silence|noise)[^)]*\)|[♪♫]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  // A filler goes with the commas around it: "is, uh, done" -> "is done".
  t = t.replace(FILLER_RE, " ").replace(FILLER_RE, " ").replace(/\s+/g, " ").trim();
  const out: string[] = [];
  for (const w of t.split(" ")) {
    const prev = out[out.length - 1];
    if (prev && norm(prev) === norm(w) && norm(w).length > 0 && !/[.!?]$/.test(prev)) continue; // "the the" -> "the"
    out.push(w);
  }
  t = out.join(" ").replace(/\s+([,.!?;:])/g, "$1").replace(/^[,.;:\s]+/, "");
  return t ? t[0]!.toUpperCase() + t.slice(1) : "";
}

const norm = (w: string) => w.toLowerCase().replace(/[^a-z0-9']/g, "");
export const tokens = (text: string) => text.split(/\s+/).map(norm).filter(Boolean);

/** Speech-recognition noise rather than something anyone said (pure). */
export function isNoise(text: string): boolean {
  const t = tokens(text);
  return t.length === 0 || NOISE.has(t.join(" ")) || NOISE.has(text.trim().toLowerCase());
}

/** How alike two texts are, by words: Dice overlap, and how much of the shorter one the longer contains (pure). */
export function similarity(a: string, b: string): { dice: number; contained: number } {
  const ta = tokens(a), tb = tokens(b);
  if (!ta.length || !tb.length) return { dice: 0, contained: 0 };
  const counts = new Map<string, number>();
  for (const w of ta) counts.set(w, (counts.get(w) ?? 0) + 1);
  let common = 0;
  for (const w of tb) { const n = counts.get(w) ?? 0; if (n > 0) { common++; counts.set(w, n - 1); } }
  return { dice: (2 * common) / (ta.length + tb.length), contained: common / Math.min(ta.length, tb.length) };
}

/** The same speech heard by both sources (pure). */
export function sameSpeech(a: Heard, b: Heard, slackMs: number): boolean {
  if (a.start > b.end + slackMs || b.start > a.end + slackMs) return false;
  const s = similarity(a.text, b.text);
  const shorter = Math.min(tokens(a.text).length, tokens(b.text).length);
  return s.dice >= 0.4 || (shorter >= 3 && s.contained >= 0.7);
}

/** Which source's text to keep for one utterance heard by both (pure). */
export function pick(captions: string, audio: string, priority: Priority): Source {
  if (priority !== "auto") return priority;
  // Captions are punctuated and usually right; whisper wins when it clearly heard more of the same thing.
  const c = tokens(captions).length, a = tokens(audio).length;
  return a >= c * 1.25 && similarity(captions, audio).contained >= 0.75 ? "audio" : "captions";
}

const isOwn = (speaker?: string) => !!speaker && /^(you|you \(presenting\))$/i.test(speaker.trim());

type Waiting = { heard: Heard; finalAt: number };

export class Merger {
  private waiting = new Map<string, Waiting>();
  private recent: Line[] = [];
  private seq = 0;

  constructor(public options: MergeOptions = DEFAULT_MERGE) {}

  /** A new or updated piece. Non-final captions are held until they're final. */
  push(h: Heard, now: number) {
    const key = `${h.source}:${h.id}`;
    const text = clean(h.text);
    const prev = this.waiting.get(key);
    this.waiting.set(key, { heard: { ...h, text }, finalAt: h.final ? (prev?.heard.final ? prev.finalAt : now) : 0 });
  }

  /** Utterances ready now: matched pairs at once, single pieces once their twin can't still be coming. */
  flush(now: number): Line[] {
    const out: Line[] = [];
    const finals = [...this.waiting.entries()].filter(([, w]) => w.heard.final).sort((x, y) => x[1].heard.start - y[1].heard.start);
    for (const [key, w] of finals) {
      if (!this.waiting.has(key)) continue; // taken as someone's twin already
      const h = w.heard;
      if (isNoise(h.text)) { this.waiting.delete(key); continue; }
      const other: Source = h.source === "captions" ? "audio" : "captions";
      const twin = [...this.waiting.entries()].find(([k, o]) => k !== key && o.heard.source === other && o.heard.final && sameSpeech(h, o.heard, this.options.slackMs));
      if (twin) {
        this.waiting.delete(key); this.waiting.delete(twin[0]);
        const [c, a] = h.source === "captions" ? [h, twin[1].heard] : [twin[1].heard, h];
        out.push(this.emit(c, a));
        continue;
      }
      // The owner's own words never reach the tab audio, so there's nothing to wait for.
      const lonely = isOwn(h.speaker) || !this.options.active[other] || now - w.finalAt >= this.options.waitMs;
      if (!lonely) continue;
      this.waiting.delete(key);
      const dupe = this.recent.find((l) => l.end + this.options.slackMs >= h.start && sameSpeech(h, { ...h, text: l.text, start: l.start, end: l.end }, this.options.slackMs));
      if (dupe) {
        // A twin that came too late: keep the first line, but learn the speaker.
        if (!dupe.speaker && h.speaker) Object.assign(dupe, { speaker: h.speaker, own: isOwn(h.speaker) });
        if (!dupe.heardBy.includes(h.source)) dupe.heardBy.push(h.source);
        continue;
      }
      out.push(h.source === "captions" ? this.emit(h, null) : this.emit(null, h));
    }
    // Pieces that never finish (a frozen caption) are dropped after a while.
    for (const [k, w] of this.waiting) if (!w.heard.final && now - w.heard.end > 30_000) this.waiting.delete(k);
    this.recent = [...this.recent, ...out].filter((l) => now - l.end < 15_000).slice(-20);
    return out;
  }

  private emit(c: Heard | null, a: Heard | null): Line {
    const via: Source = c && a ? pick(c.text, a.text, this.options.priority) : c ? "captions" : "audio";
    const chosen = (via === "captions" ? c : a)!;
    return {
      id: `l${++this.seq}`,
      text: chosen.text,
      speaker: c?.speaker,
      own: isOwn(c?.speaker),
      start: Math.min(c?.start ?? Infinity, a?.start ?? Infinity),
      end: Math.max(c?.end ?? 0, a?.end ?? 0),
      heardBy: [...(c ? ["captions" as const] : []), ...(a ? ["audio" as const] : [])],
      via,
    };
  }
}

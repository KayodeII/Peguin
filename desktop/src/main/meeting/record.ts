// What happened in one meeting, as it happened (pure, no I/O): what was heard,
// what Peguin said, and every question with how it was handled. The recap is
// built from this, so the follow-ups never depend on a model getting it right.

export type Entry =
  | { at: number; who: "them"; text: string }
  | { at: number; who: "peguin"; kind: "update" | "answer" | "defer" | "ack"; text: string }
  | { at: number; who: "system"; text: string };

export type Question = { at: number; text: string; outcome: "pending" | "answered" | "deferred"; answer?: string };

export type MeetingRecord = {
  id: string;
  url: string;
  platform: string;
  joinedAs: string;
  startedAt: number;
  joinedAt: number | null;
  endedAt: number | null;
  updateGiven: boolean;
  entries: Entry[];
  questions: Question[];
  recap?: Recap;
};

export type Recap = {
  /** Two or three sentences from Claude, only from the transcript. Absent if summaries are off or unavailable. */
  summary?: string;
  /** Things the owner needs to do: every deferred question, plus requests Claude found. */
  followUps: { text: string; done: boolean }[];
  createdAt: number;
};

const MAX_ENTRIES = 2000;

export class MeetingLog {
  private readonly r: MeetingRecord;

  constructor(o: { url: string; platform: string; joinedAs: string; now?: number }) {
    const now = o.now ?? Date.now();
    this.r = { id: `${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`, url: o.url, platform: o.platform, joinedAs: o.joinedAs,
      startedAt: now, joinedAt: null, endedAt: null, updateGiven: false, entries: [], questions: [] };
  }

  private add(e: Entry) { if (this.r.entries.length < MAX_ENTRIES) this.r.entries.push(e); }

  joined(now = Date.now()) { this.r.joinedAt ??= now; this.add({ at: now, who: "system", text: "Peguin joined" }); }
  heard(text: string, now = Date.now()) { this.add({ at: now, who: "them", text }); }
  note(text: string, now = Date.now()) { this.add({ at: now, who: "system", text }); }

  said(kind: "update" | "answer" | "defer" | "ack", text: string, now = Date.now()) {
    if (kind === "update") this.r.updateGiven = true;
    this.add({ at: now, who: "peguin", kind, text });
  }

  /** A question Peguin is handling; settle it when the answer (or deferral) is known. */
  asked(text: string, now = Date.now()) {
    const q: Question = { at: now, text, outcome: "pending" };
    this.r.questions.push(q);
    return {
      answered: (answer: string, at = Date.now()) => { q.outcome = "answered"; q.answer = answer; this.said("answer", answer, at); },
      deferred: (said: string, at = Date.now()) => { q.outcome = "deferred"; this.said("defer", said, at); },
    };
  }

  end(now = Date.now()): MeetingRecord {
    this.r.endedAt ??= now;
    // A question still pending when the call ended was never answered: the owner should follow up.
    for (const q of this.r.questions) if (q.outcome === "pending") q.outcome = "deferred";
    return structuredClone(this.r);
  }
}

/** Worth keeping: Peguin got into the call. */
export const worthKeeping = (r: MeetingRecord) => r.joinedAt !== null;

/** The follow-ups no model is needed for: every question Peguin deferred, in order. */
export function deferredFollowUps(r: MeetingRecord): string[] {
  return r.questions.filter((q) => q.outcome === "deferred").map((q) => `Answer: "${q.text.trim()}"`);
}

const STOP = new Set(["a", "an", "the", "to", "of", "and", "or", "is", "are", "be", "can", "could", "will", "would", "my", "your", "their",
  "it", "this", "that", "on", "in", "for", "if", "you", "we", "i", "me", "do", "does", "answer", "tell", "them", "team", "about", "with"]);
const keywords = (s: string) => new Set(s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter((w) => w.length > 1 && !STOP.has(w)));
/** Same task if most of the shorter one's key words appear in the other. */
function sameTask(a: string, b: string): boolean {
  const ka = keywords(a), kb = keywords(b);
  const small = ka.size <= kb.size ? ka : kb, big = small === ka ? kb : ka;
  if (!small.size) return false;
  let shared = 0;
  for (const w of small) if (big.has(w)) shared++;
  return shared / small.size >= 0.6;
}

/**
 * Deferred questions first, then Claude's extra follow-ups. Every deferred
 * question stays (it never depends on the model), but when Claude described
 * the same task, its more actionable wording is used in that place.
 */
export function mergeFollowUps(deferred: string[], extra: string[]): string[] {
  const out = deferred.map((d) => d.trim());
  const used = new Set<number>();
  extra.map((e) => e.trim()).filter(Boolean).forEach((e) => {
    const i = out.findIndex((d, j) => !used.has(j) && j < deferred.length && sameTask(d, e));
    if (i >= 0) { out[i] = e; used.add(i); return; }
    if (!out.some((o) => sameTask(o, e))) out.push(e);
  });
  return out;
}

/** One line for the list and the notification: "Gave your update, answered 1, 2 to follow up". */
export function headline(r: MeetingRecord): string {
  if (!r.joinedAt) return "Didn't get into the call";
  const answered = r.questions.filter((q) => q.outcome === "answered").length;
  const open = r.recap ? r.recap.followUps.filter((f) => !f.done).length : deferredFollowUps(r).length;
  const parts = [r.updateGiven ? "Gave your update" : "Wasn't called on"];
  if (answered) parts.push(`answered ${answered}`);
  parts.push(open ? `${open} to follow up` : "nothing to follow up");
  return parts.join(", ");
}

/** Transcript lines for the recap prompt. Speakers aren't identified, so others are "Someone". */
export function transcriptLines(r: MeetingRecord): string[] {
  return r.entries.filter((e) => e.who !== "system").map((e) => (e.who === "them" ? `Someone: ${e.text}` : `Peguin (${e.kind}): ${e.text}`));
}

/** Drops meetings older than the owner's retention period. */
export function expired(r: Pick<MeetingRecord, "startedAt">, keepDays: number, now = Date.now()): boolean {
  return now - r.startedAt > keepDays * 86_400_000;
}

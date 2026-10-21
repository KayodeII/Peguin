// Meet's captions, turned into pieces of speech. Meet keeps one caption block
// per speaker turn and keeps rewriting and extending it, so a long turn is one
// growing block. The tracker cuts each block into utterances at pauses: what's
// new since the last cut is one piece, updated in place while it grows and
// final once the block has been quiet for `quietMs`. Pure: the content script
// reads the page and passes the time in.
import type { Heard } from "./merge.js";

type Block = { speaker: string; text: string; cut: number; part: number; start: number; changed: number; sent: string };

export class CaptionTracker {
  private blocks = new Map<string, Block>();

  constructor(private quietMs = 1200) {}

  /** The current text of one caption block. */
  observe(key: string, speaker: string, text: string, now: number) {
    const b = this.blocks.get(key);
    if (!b) { this.blocks.set(key, { speaker, text, cut: 0, part: 1, start: now, changed: now, sent: "" }); return; }
    if (b.text === text && b.speaker === speaker) return;
    // Meet rewrote text before the last cut (a correction): keep the cut where the words still line up.
    if (text.length < b.cut || !sameStart(b.text.slice(0, b.cut), text)) b.cut = Math.min(b.cut, commonPrefix(b.text, text));
    if (!b.text.slice(b.cut).trim()) b.start = now; // a new piece starts speaking now
    Object.assign(b, { speaker, text, changed: now });
  }

  /** A block left the page: whatever it still holds is final now. */
  gone(key: string, now: number): Heard[] {
    const b = this.blocks.get(key);
    this.blocks.delete(key);
    return b ? this.cut(key, b, now, true) : [];
  }

  /** Updates since the last tick: growing pieces (not final) and pieces whose block went quiet (final). */
  tick(now: number): Heard[] {
    const out: Heard[] = [];
    for (const [key, b] of this.blocks) out.push(...this.cut(key, b, now, now - b.changed >= this.quietMs));
    return out;
  }

  private cut(key: string, b: Block, now: number, final: boolean): Heard[] {
    const piece = b.text.slice(b.cut).trim();
    if (!piece || (!final && piece === b.sent)) return [];
    const h: Heard = { source: "captions", id: `${key}#${b.part}`, text: piece, speaker: b.speaker, start: b.start, end: b.changed, final };
    if (final) Object.assign(b, { cut: b.text.length, part: b.part + 1, sent: "" });
    else b.sent = piece;
    return [h];
  }
}

function commonPrefix(a: string, b: string): number {
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  // Back up to a word boundary so a half-rewritten word goes with the new piece.
  while (i > 0 && !/\s/.test(a[i - 1]!)) i--;
  return i;
}

const sameStart = (prefix: string, text: string) => text.startsWith(prefix);

/** Speaker and text from one caption block's visible text: the first line is the name, the rest is speech (pure). */
export function splitBlock(innerText: string): { speaker: string; text: string } | null {
  const lines = innerText.split("\n").map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return null;
  const [speaker, ...rest] = lines;
  if (speaker!.length > 60) return null;
  return { speaker: speaker!, text: rest.join(" ") };
}

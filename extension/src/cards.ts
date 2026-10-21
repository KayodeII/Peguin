// Question cards, answered one at a time in order. Like the desktop copilot:
// at most MAX_WAITING wait; beyond that the oldest waiting one is marked
// skipped, so every card ends answered, failed or skipped, never stuck on
// "Thinking". No Chrome APIs, so it's tested directly.
import { COPILOT_LABELS } from "../../src/core/brain/prompts.js";
import type { Line } from "./merge.js";

export const MAX_WAITING = 3;

export type Label = "notes" | "general" | "unknown";
export type Card = {
  id: number;
  question: string;
  speaker?: string;
  /** Both ears heard it the same way. */
  confirmed: boolean;
  at: number;
  state: "waiting" | "thinking" | "answered" | "failed" | "skipped";
  answer: string;
  label?: Label;
  error?: string;
  web?: { state: "checking" | "done" | "failed"; answer?: string; source?: string };
};

/** The label a reply starts with, and the reply without it (pure). Works on a half-streamed reply too. */
export function splitLabel(reply: string): { label?: Label; body: string } {
  const t = reply.trimStart();
  for (const [label, text] of Object.entries(COPILOT_LABELS) as [Label, string][]) {
    if (t.startsWith(text)) return { label, body: t.slice(text.length).trim() };
    if (text.startsWith(t)) return { body: "" }; // the label is still arriving
  }
  return { body: t };
}

export type Answerer = (card: Card, onText: (soFar: string) => void) => Promise<string>;

export class CardQueue {
  cards: Card[] = [];
  private seq = 0;
  private running = false;

  constructor(private answer: Answerer, private changed: () => void) {}

  add(line: Line, at: number): Card {
    const card: Card = { id: ++this.seq, question: line.text, speaker: line.speaker, confirmed: line.heardBy.length > 1, at, state: "waiting", answer: "" };
    this.cards = [card, ...this.cards].slice(0, 30);
    const waiting = this.cards.filter((c) => c.state === "waiting").reverse(); // oldest first
    for (const c of waiting.slice(0, Math.max(0, waiting.length - MAX_WAITING))) c.state = "skipped";
    this.changed();
    void this.run();
    return card;
  }

  private async run() {
    if (this.running) return;
    this.running = true;
    try {
      for (let next = this.oldestWaiting(); next; next = this.oldestWaiting()) {
        const card = next;
        card.state = "thinking";
        this.changed();
        try {
          const reply = await this.answer(card, (soFar) => { Object.assign(card, toCard(soFar)); this.changed(); });
          Object.assign(card, toCard(reply), { state: "answered" });
        } catch (e) {
          Object.assign(card, { state: "failed", error: e instanceof Error ? e.message : String(e) });
        }
        this.changed();
      }
    } finally { this.running = false; }
  }

  private oldestWaiting = () => [...this.cards].reverse().find((c) => c.state === "waiting");
}

const toCard = (reply: string) => { const { label, body } = splitLabel(reply); return { label, answer: body }; };

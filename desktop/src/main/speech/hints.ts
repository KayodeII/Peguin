// Words to prime speech recognition with, so names and jargon from the owner's
// work come out spelled right (whisper's prompt; pure).

const COMMON = new Set("The A An And Or But If So We I It This That These Those Next Also Then Now Today Yesterday Merged Added Fixed Moved Shipped Built Updated Opened Closed PR PRs Oct Nov Dec Jan Feb Mar Apr May Jun Jul Aug Sep".split(" "));

/** Always said in a Peguin meeting, and whisper's guess otherwise is "Pergun" or "plugin". */
const PRODUCT = "Peguin";

/** Jargon whatever its position: GitHub, ElevenLabs, CI, D1, Node.js. */
const distinctive = (w: string) => /[a-z][A-Z]/.test(w) || /^(?=.*[A-Z])[A-Z0-9]{2,}$/.test(w) || /\d/.test(w) && /[a-z]/i.test(w) || /\.[a-z]/i.test(w);

/**
 * Distinctive terms from the facts: capitalised words that aren't just starting
 * a sentence, mixed-case words, acronyms, words with digits. At most `max`.
 * Sentence starts are skipped because priming whisper with everyday words
 * ("Desktop", "Leave") makes it hear them where they weren't said.
 */
export function vocabulary(facts: string[], max = 30): string[] {
  const out = new Set<string>();
  // Sentences, clauses, quoted titles and brackets each start afresh.
  const parts = facts.flatMap((f) => f.split(/[.:!?;]+(?:\s|$)|[()"“”]|(?:^|\s)'|'(?:\s|$)/));
  for (const part of parts) {
    let first = true;
    for (const raw of part.split(/[\s,]+/)) {
      const w = raw.replace(/^[^\w]+|[^\w.+#]+$|\.$/g, "");
      if (!w) continue;
      const start = first;
      first = false;
      if (w.length < 2 || COMMON.has(w)) continue;
      if (distinctive(w) || !start && /^[A-Z]/.test(w)) out.add(w);
      if (out.size >= max) return [...out];
    }
  }
  return [...out];
}

/** Whisper's prompt: neutral (a "standup" prompt skewed other meetings), plus names, Peguin and vocabulary. */
export function whisperPrompt(names: string[], vocab: string[] = []): string {
  const words = [PRODUCT, ...vocab.filter((v) => v !== PRODUCT)];
  return `A meeting with ${names.join(", ")}. ${words.join(", ")}.`;
}

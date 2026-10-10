// Words to prime speech recognition with, so names and jargon from the owner's
// work come out spelled right (whisper's prompt; pure).

const COMMON = new Set("The A An And Or But If So We I It This That These Those Next Also Then Now Today Yesterday Merged Added Fixed Moved Shipped Built Updated Opened Closed PR PRs Oct Nov Dec Jan Feb Mar Apr May Jun Jul Aug Sep".split(" "));

/** Distinctive terms from the facts: capitalised or mixed-case words, acronyms, words with digits. At most `max`. */
export function vocabulary(facts: string[], max = 30): string[] {
  const out = new Set<string>();
  for (const f of facts) {
    for (const raw of f.split(/[\s,;:()'"“”]+/)) {
      const w = raw.replace(/^[^\w]+|[^\w.+#]+$|\.$/g, "");
      if (w.length < 2 || COMMON.has(w)) continue;
      if (/[A-Z]/.test(w) || /\d/.test(w) && /[a-z]/i.test(w)) out.add(w);
      if (out.size >= max) return [...out];
    }
  }
  return [...out];
}

/** Whisper's prompt: neutral (a "standup" prompt skewed other meetings), plus names and vocabulary. */
export function whisperPrompt(names: string[], vocab: string[] = []): string {
  return `A meeting with ${names.join(", ")}.${vocab.length ? ` ${vocab.join(", ")}.` : ""}`;
}

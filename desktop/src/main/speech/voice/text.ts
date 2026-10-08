// Text handling for the owner's-voice model (pure, no I/O). What we send the
// model is tidied and respelled; what we check against is what we meant to say.

/** Resemble's punc_norm (tidy punctuation the model wasn't trained on), minus the stray ", ." it can leave. */
export function puncNorm(input: string): string {
  let text = input.trim().replace(/\s+/g, " ");
  if (!text) return text;
  if (/^[a-z]/.test(text)) text = text[0]!.toUpperCase() + text.slice(1);
  const swaps: [string, string][] = [
    ["...", ", "], ["…", ", "], [":", ","], [" - ", ", "], [";", ", "], ["—", ", "], ["–", ", "],
    [" ,", ","], ["“", '"'], ["”", '"'], ["‘", "'"], ["’", "'"],
  ];
  for (const [a, b] of swaps) text = text.split(a).join(b);
  text = text.replace(/\s+/g, " ").replace(/\s+,/g, ",").trim().replace(/,$/, ""); // swaps can leave doubles
  if (!/[.!?-]$/.test(text)) text += ".";
  return text;
}

/** Sentences, in order. The model is far more reliable one sentence at a time. */
export function sentences(text: string): string[] {
  return puncNorm(text).split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Swap words for spellings the model says right, e.g. { Peguin: "Peh-gwin" }. Whole words, case-sensitive. */
export function respell(text: string, pronounce: Record<string, string>): string {
  let out = text;
  for (const [word, said] of Object.entries(pronounce)) {
    if (!word.trim() || !said.trim()) continue;
    out = out.replace(new RegExp(`(?<![\\w'])${escape(word)}(?![\\w])`, "g"), said);
  }
  return out;
}

const ONES = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve",
  "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

/** 0..9999 in words ("482" -> "four hundred eighty two"); larger numbers are left as digits. */
function numberWords(n: number): string {
  if (n < 20) return ONES[n]!;
  if (n < 100) return `${TENS[Math.floor(n / 10)]}${n % 10 ? ` ${ONES[n % 10]}` : ""}`;
  if (n < 1000) return `${ONES[Math.floor(n / 100)]} hundred${n % 100 ? ` ${numberWords(n % 100)}` : ""}`;
  if (n < 10000) return `${numberWords(Math.floor(n / 1000))} thousand${n % 1000 ? ` ${numberWords(n % 1000)}` : ""}`;
  return String(n);
}

/** Lowercase words for comparison; digits become words so "482" matches "four eighty-two" loosely. */
export function words(text: string, aliases: Record<string, string> = {}): string[] {
  const out = text.toLowerCase()
    .replace(/\d+/g, (d) => ` ${numberWords(Number(d))} `)
    .replace(/-/g, " ")
    .match(/[a-z']+/g) ?? [];
  return out.map((w) => w.replace(/'s$/, "").replace(/'/g, "")).map((w) => aliases[w] ?? w);
}

/** Longest common subsequence length, for a word-level similarity score. */
function lcs(a: string[], b: string[]): number {
  const row = new Array<number>(b.length + 1).fill(0);
  for (const x of a) {
    let prev = 0;
    for (let j = 1; j <= b.length; j++) {
      const tmp = row[j]!;
      row[j] = x === b[j - 1] ? prev + 1 : Math.max(row[j]!, row[j - 1]!);
      prev = tmp;
    }
  }
  return row[b.length]!;
}

/**
 * How wrong a transcript is compared with what we meant: 0 = every word right,
 * 1 = nothing right, or the meaning flipped (a negation added or lost). `aliases` maps how speech recognition tends to hear a name
 * ("mujib") to the name itself ("mujeeb"), so an accent isn't counted as a mistake.
 */
export function wordError(target: string, heard: string, aliases: Record<string, string> = {}): number {
  const t = words(target, aliases), h = words(heard, aliases);
  if (!t.length) return 0;
  const err = 1 - (2 * lcs(t, h)) / (t.length + h.length);
  // "can" heard as "can't" is one word but the opposite meaning: never accept it.
  return negations(t) === negations(h) ? err : Math.max(err, 1);
}

const NEGATIONS = new Set(["not", "no", "never", "cant", "cannot", "wont", "dont", "doesnt", "didnt", "isnt", "arent", "wasnt", "werent", "havent", "hasnt", "nothing", "none", "nobody"]);
const negations = (ws: string[]) => ws.filter((w) => NEGATIONS.has(w)).length;

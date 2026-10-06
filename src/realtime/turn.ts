/**
 * Decides when Penguin should speak. Pure logic, no I/O, fully unit-tested.
 *
 * Inputs are finalised utterances from speech-to-text. Penguin speaks when:
 *  1. someone hands the floor to the user by name ("Mujeeb, you're up",
 *     "Mujeeb?", "what about Mujeeb") and the update hasn't been given; or
 *  2. after the update, someone asks a question that names the user, or asks
 *     a question within the follow-up window right after Penguin finished.
 * It stays silent while it is talking and for a short tail after, so it never
 * reacts to its own voice echoing back from the call.
 */

export type Decision =
  | { action: "none" }
  | { action: "give_update" }
  | { action: "answer"; question: string };

export type TurnOptions = {
  names: string[];              // the user's name plus aliases
  followUpWindowMs?: number;    // questions right after the update count as follow-ups
  echoTailMs?: number;          // ignore audio this long after Penguin stops
  maxFollowUps?: number;
};

const HANDOFF = [
  /\byou'?re up\b/, /\byour turn\b/, /\bgo ahead\b/, /\bover to\b/, /\bwhat about\b/, /\bhow about\b/,
  /\bupdate\b/, /\bnext\b/, /\bcan you\b/, /\bwant to go\b/, /\bdo you want\b/, /\bfloor\b/, /\byou next\b/,
  /\banything from\b/, /\bwhat'?s new\b/, /\bwhat do you have\b/, /\bkick us off\b/, /\bstart us\b/,
];
const QUESTION_START = /^(what|when|why|how|who|where|which|is|are|was|were|do|does|did|can|could|will|would|should|have|has|any)\b/;

export function normalize(s: string): string {
  return s.toLowerCase().replace(/[^\p{L}\p{N}'?\s]/gu, " ").replace(/\s+/g, " ").trim();
}

function editDistance(a: string, b: string): number {
  const dp = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0]!; dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j]!;
      dp[j] = Math.min(dp[j]! + 1, dp[j - 1]! + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[b.length]!;
}

/** Rough sound-alike key so "Mujeeb", "Mujib" and "Moo jeeb" compare equal. */
export function soundKey(w: string): string {
  return w.replace(/ph/g, "f").replace(/ck|q/g, "k").replace(/ee|ea|ie|y(?=[^aeiou]|$)/g, "i")
    .replace(/oo|ou/g, "u").replace(/(.)\1+/g, "$1");
}

/** Name match tolerant of speech-to-text spelling ("Mujeeb" ~ "Mujib", "Mu jeeb"). */
export function mentionsName(text: string, names: string[]): boolean {
  const t = normalize(text).replace(/\?/g, "");
  const words = t.split(" ");
  const squashed = words.join("");
  for (const raw of names) {
    const n = normalize(raw).replace(/\?/g, "");
    if (!n) continue;
    if (` ${t} `.includes(` ${n} `)) return true;
    const nn = n.replace(/ /g, "");
    if (nn.length >= 5 && squashed.includes(nn)) return true;
    if (nn.length >= 4) {
      const key = soundKey(nn);
      const tol = key.length >= 7 ? 2 : 1;
      for (let i = 0; i < words.length; i++) {
        const one = soundKey(words[i]!);
        const two = soundKey(words[i]! + (words[i + 1] ?? ""));
        if (Math.abs(one.length - key.length) <= tol && editDistance(one, key) <= tol) return true;
        if (words[i + 1] && Math.abs(two.length - key.length) <= tol && editDistance(two, key) <= tol) return true;
      }
    }
  }
  return false;
}

export function isQuestion(text: string): boolean {
  const t = normalize(text);
  return t.endsWith("?") || QUESTION_START.test(t);
}

export function isHandoff(text: string, names: string[]): boolean {
  if (!mentionsName(text, names)) return false;
  const t = normalize(text);
  const words = t.split(" ").filter(Boolean);
  // "Mujeeb?" / "Mujeeb, go" — short address is a handoff on its own.
  if (words.length <= 4) return true;
  if (t.endsWith("?")) return true;
  return HANDOFF.some((r) => r.test(t));
}

export class TurnDetector {
  private updateGiven = false;
  private speaking = false;
  private lastSpokeEndedAt = -Infinity;
  private followUps = 0;
  private readonly o: Required<TurnOptions>;

  constructor(opts: TurnOptions) {
    this.o = { followUpWindowMs: 15000, echoTailMs: 1200, maxFollowUps: 3, ...opts };
  }

  get hasGivenUpdate() { return this.updateGiven; }

  /** Call when Penguin starts/stops playing audio into the call. */
  setSpeaking(on: boolean, now: number) {
    this.speaking = on;
    if (!on) this.lastSpokeEndedAt = now;
  }

  markUpdateGiven() { this.updateGiven = true; }

  onUtterance(text: string, now: number): Decision {
    if (this.speaking || now - this.lastSpokeEndedAt < this.o.echoTailMs) return { action: "none" };
    const t = text.trim();
    if (!t) return { action: "none" };

    if (!this.updateGiven) {
      return isHandoff(t, this.o.names) ? { action: "give_update" } : { action: "none" };
    }

    if (this.followUps >= this.o.maxFollowUps || !isQuestion(t)) return { action: "none" };
    const named = mentionsName(t, this.o.names);
    const inWindow = now - this.lastSpokeEndedAt <= this.o.followUpWindowMs;
    // "Sarah, what about you?" right after Penguin finishes is the floor moving
    // on, not a follow-up for us.
    const handsToSomeoneElse = !named && HANDOFF.some((r) => r.test(normalize(t)));
    if (named || (inWindow && !handsToSomeoneElse)) {
      this.followUps++;
      return { action: "answer", question: t };
    }
    return { action: "none" };
  }
}

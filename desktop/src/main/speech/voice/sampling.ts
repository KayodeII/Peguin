// Picking the next speech token (pure). Sampling with a little randomness sounds
// human; always taking the most likely token sounds flat and slurs words.

/** Properties of the model from Resemble's reference code, not preferences. */
const MODEL = { topK: 1000, topP: 0.95, repetitionPenalty: 1.2 };

/** Small seeded PRNG (mulberry32), so a line can be regenerated identically in tests. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** `temperature` is the owner's expressiveness setting: lower is steadier, higher livelier. */
export function sampleToken(logits: ArrayLike<number>, previous: Iterable<number>, random: () => number, temperature: number): number {
  const o = { ...MODEL, temperature };
  const scores = Float64Array.from(logits as ArrayLike<number>);
  // Penalise tokens already spoken, once each.
  for (const id of new Set(previous)) {
    const v = scores[id];
    if (v !== undefined) scores[id] = v < 0 ? v * o.repetitionPenalty : v / o.repetitionPenalty;
  }
  // Top-k by score, then softmax at the temperature, then keep the smallest set reaching top-p.
  const order = Array.from(scores.keys()).sort((x, y) => scores[y]! - scores[x]!).slice(0, Math.min(o.topK, scores.length));
  const max = scores[order[0]!]!;
  const weights = order.map((i) => Math.exp((scores[i]! - max) / o.temperature));
  const total = weights.reduce((a, b) => a + b, 0);
  let kept = 0, mass = 0;
  while (kept < order.length && mass < o.topP) mass += weights[kept++]! / total;
  let r = random() * mass;
  for (let i = 0; i < kept; i++) {
    r -= weights[i]! / total;
    if (r <= 0) return order[i]!;
  }
  return order[kept - 1]!;
}

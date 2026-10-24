// Where Peguin's cursor wanders between commands (pure). It stays around the
// middle of the screen, drifts a little at a time and keeps out of the owner's
// way: never close to their mouse, never over what they're pointing at.

export type Pt = { x: number; y: number };
export type Box = { x: number; y: number; w: number; h: number };

/** Closer than this to the owner's mouse is in their way. */
export const MOUSE_GAP = 240;
const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);

/** The middle of the screen: where it rests and wanders. */
export const middle = (area: Box): Box => ({ x: area.x + area.w * 0.25, y: area.y + area.h * 0.25, w: area.w * 0.5, h: area.h * 0.5 });

/** A short drift inside the middle of `area`, away from the owner's mouse. */
export function roamTarget(area: Box, mouse: Pt, from: Pt, random: () => number = Math.random): Pt {
  const m = middle(area);
  let best: Pt | null = null, bestGap = -1;
  for (let i = 0; i < 12; i++) {
    const p = { x: Math.round(m.x + random() * m.w), y: Math.round(m.y + random() * m.h) };
    const step = dist(p, from), gap = dist(p, mouse);
    if (gap >= MOUSE_GAP && step >= 60 && step <= 420) return p;
    if (gap > bestGap) { best = p; bestGap = gap; }
  }
  return best!;
}

/** Where to look at the window the owner is working in: near its top, clear of their mouse. Null if there's no usable window. */
export function glanceTarget(win: Box | null | undefined, mouse: Pt, random: () => number = Math.random): Pt | null {
  if (!win || win.w < 200 || win.h < 120) return null;
  for (let i = 0; i < 8; i++) {
    const p = { x: Math.round(win.x + win.w * (0.3 + random() * 0.4)), y: Math.round(win.y + Math.min(80, win.h * 0.2)) };
    if (dist(p, mouse) >= MOUSE_GAP) return p;
  }
  return null;
}

/** Seconds until the next drift: unhurried and a little irregular, so it feels alive, not busy. */
export const nextDrift = (random: () => number = Math.random) => 7 + random() * 7;

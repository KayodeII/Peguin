// Peguin's cursor shapes, shared by the overlay and the Settings preview. Every
// shape's hotspot (where a click lands) is at (3, 2) in a 34x34 box.
import type { Settings } from "../main/settings";

export type CursorStyle = Settings["pointer"]["cursor"];

/** The penguin's head is always black: that's the brand. */
export const HEAD = "#0d0d10";

/** The owner's colour: the glow around the cursor (and the fin or arrow itself). `head` is the swatch. */
export const COLORS: Record<CursorStyle["color"], { label: string; head: string; glow: string }> = {
  ink: { label: "Soft white", head: "#e9e9ee", glow: "rgba(255, 255, 255, .5)" },
  tomato: { label: "Peguin orange", head: "#ff5a36", glow: "rgba(255, 90, 54, .6)" },
  blue: { label: "Blue", head: "#2f7cf6", glow: "rgba(47, 124, 246, .55)" },
  green: { label: "Green", head: "#2fa866", glow: "rgba(47, 168, 102, .55)" },
  purple: { label: "Purple", head: "#8e5bd9", glow: "rgba(142, 91, 217, .55)" },
};

export const FIN = "M3 2 C10.5 3 22.5 9.5 26.8 19.8 C29.2 26 23.6 30.2 17.8 26.6 C10.8 21.8 5.4 12.2 3 2 Z";
export const ARROW = "M3 2 L26 13 L15 16 L11 27 Z";

/** Head centre and radius; the beak runs from the tip (3, 2) to the head. */
const HX = 21, HY = 21, HR = 10.5;
const EX = 22.6, EY = 19.6; // the eye sits a little towards the beak's side
const BEAK = "M3 2 L24.5 10.6 Q14 12.5 10.6 24.5 Z";

/**
 * The penguin head: an orange beak whose tip is the hotspot, a round head and
 * an eye. `gaze` (-1..1 each way) moves the pupil; `wide` opens the eye (it heard its name).
 */
export function PenguinHead({ gaze = { x: -0.6, y: -0.6 }, wide = false }: { gaze?: { x: number; y: number }; wide?: boolean }) {
  const r = wide ? 4.6 : 3.9, p = wide ? 2.3 : 2;
  const reach = r - p - 0.4;
  return (
    <g className="penguin">
      <path d={BEAK} fill="#ff9a1f" stroke="#fff" strokeWidth={1.6} strokeLinejoin="round" />
      <circle cx={HX} cy={HY} r={HR} fill={HEAD} stroke="#fff" strokeWidth={1.6} />
      <g className="eye">
        <circle cx={EX} cy={EY} r={r} fill="#fff" />
        <circle className="pupil" cx={EX + gaze.x * reach} cy={EY + gaze.y * reach} r={p} fill="#111" />
        <circle cx={EX + gaze.x * reach - 0.7} cy={EY + gaze.y * reach - 0.8} r={0.6} fill="#fff" />
      </g>
    </g>
  );
}

/** Any shape, drawn in the 34x34 box. */
export function CursorArt({ shape, color, gaze, wide }: { shape: CursorStyle["shape"]; color: CursorStyle["color"]; gaze?: { x: number; y: number }; wide?: boolean }) {
  if (shape === "penguin") return <PenguinHead gaze={gaze} wide={wide} />;
  return <path d={shape === "fin" ? FIN : ARROW} fill={COLORS[color].head} stroke="#fff" strokeWidth={1.7} strokeLinejoin="round" />;
}

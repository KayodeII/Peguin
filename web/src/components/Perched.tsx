import { useEffect, useId, useRef, useState } from "react";
import { reducedMotion } from "../ui";

/** A short two-note chirp, synthesised (no audio file). Only ever played on click. */
function chirp() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new Ctx();
    const note = (start: number, from: number, to: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(from, ctx.currentTime + start);
      osc.frequency.exponentialRampToValueAtTime(to, ctx.currentTime + start + 0.09);
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + start);
      gain.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + start + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + start + 0.11);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + start);
      osc.stop(ctx.currentTime + start + 0.12);
    };
    note(0, 1900, 3200);
    note(0.14, 2200, 3600);
    setTimeout(() => void ctx.close(), 600);
  } catch { /* no audio: the bubble is enough */ }
}

/**
 * Peguin perched on the top edge of a card (put it inside a position: relative
 * card). Its head peeks over the corner and a flipper drapes over the front.
 * It blinks, flaps and chirps now and then, follows the cursor with its eyes,
 * tilts toward it, and chirps out loud when clicked.
 */
export function Perched({ className }: { className?: string }) {
  const ref = useRef<HTMLButtonElement>(null);
  const [look, setLook] = useState({ x: 0, y: 0 });
  const [chirping, setChirping] = useState(false);
  const still = reducedMotion();
  const clip = `above-card-${useId().replace(/:/g, "")}`;

  // Eyes and tilt follow the pointer anywhere on the page.
  useEffect(() => {
    if (still) return;
    let raf = 0;
    const move = (e: PointerEvent) => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const r = ref.current?.getBoundingClientRect();
        if (!r) return;
        const dx = e.clientX - (r.left + r.width / 2);
        const dy = e.clientY - (r.top + r.height / 3);
        const d = Math.max(1, Math.hypot(dx, dy));
        setLook({ x: (dx / d) * Math.min(1, d / 300), y: (dy / d) * Math.min(1, d / 300) });
      });
    };
    addEventListener("pointermove", move);
    return () => { removeEventListener("pointermove", move); cancelAnimationFrame(raf); };
  }, [still]);

  // A chirp bubble every few seconds, timed with a flap.
  useEffect(() => {
    if (still) return;
    let t: ReturnType<typeof setTimeout>;
    const loop = () => {
      setChirping(true);
      t = setTimeout(() => { setChirping(false); t = setTimeout(loop, 4200 + Math.random() * 2500); }, 1100);
    };
    t = setTimeout(loop, 1800);
    return () => clearTimeout(t);
  }, [still]);

  const say = () => { chirp(); setChirping(true); setTimeout(() => setChirping(false), 1100); };
  const px = look.x * 1.3, py = look.y * 1.1;

  return (
    <button ref={ref} type="button" className={`perched ${chirping ? "chirping" : ""} ${className ?? ""}`} onClick={say} aria-label="Peguin says hello"
      style={{ ["--tilt-x" as string]: `${(-look.y * 8).toFixed(1)}deg`, ["--tilt-y" as string]: `${(look.x * 12).toFixed(1)}deg` }}>
      <span className="chirp-bubble" aria-hidden>chirp!</span>
      <svg viewBox="0 0 120 132" width="144" height="158" aria-hidden>
        <defs>
          {/* Only the part above the card's top edge (y = 86) shows. */}
          <clipPath id={clip}><rect x="0" y="0" width="120" height="86" /></clipPath>
        </defs>
        <g className="p-body" clipPath={`url(#${clip})`}>
          <ellipse cx="58" cy="78" rx="36" ry="44" fill="#191919" />
          <ellipse cx="58" cy="88" rx="23" ry="30" fill="#f4f1ea" />
        </g>
        <g className="p-head">
          <g className="p-eyes">
            <g className="p-eye"><circle cx="45" cy="52" r="7" fill="#fff" /><circle cx={45 + px * 2.6} cy={52 + py * 2.4} r="3.4" fill="#191919" /><circle cx={46.2 + px * 2.6} cy={50.8 + py * 2.4} r="1" fill="#fff" /></g>
            <g className="p-eye"><circle cx="71" cy="52" r="7" fill="#fff" /><circle cx={71 + px * 2.6} cy={52 + py * 2.4} r="3.4" fill="#191919" /><circle cx={72.2 + px * 2.6} cy={50.8 + py * 2.4} r="1" fill="#fff" /></g>
          </g>
          <g className="p-beak">
            <path className="p-beak-top" d="M51 63 h14 l-7 6 z" fill="#f2a93b" />
            <path className="p-beak-bottom" d="M53 67 h10 l-5 4 z" fill="#e0912a" />
          </g>
          <ellipse cx="38" cy="66" rx="5" ry="3" fill="#f4a3a3" opacity=".55" />
          <ellipse cx="78" cy="66" rx="5" ry="3" fill="#f4a3a3" opacity=".55" />
        </g>
        {/* The flipper drapes inward over the card's front, like an elbow on a desk. */}
        <g className="p-flipper">
          <path d="M30 70 C12 76 6 96 12 118 C14 126 22 128 26 120 C30 108 30 92 34 84 Z" fill="#191919" />
        </g>
      </svg>
    </button>
  );
}

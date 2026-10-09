import { useEffect, useRef, useState, type RefObject } from "react";
import { PenguinSide, PenguinSprite } from "./HelpPenguin";

const SCALE = 1.45; // drawn larger than the help penguin, to hold its own next to the cards
const W = 64 * SCALE, H = 80 * SCALE; // the sprite box; positions are its top-left corner

type Pose = "peek" | "walk" | "hop" | "sit" | "rest";
type Point = { x: number; y: number };
/** One step of the tour: where the penguin goes, how it looks on the way, and for how long. */
type Leg = { ms: number; to: Point; pose: Pose; arc?: number; chirp?: boolean; fade?: boolean; tilt?: number };
type Rect = { left: number; right: number; top: number; bottom: number; width: number };

/**
 * The tour across the four plan cards (pure, from their positions in the grid):
 * peek-a-boo from behind the first card's edge, waddle over and hop up to sit
 * on the second, jump down, rest against the third's side, then wander off past
 * the fourth. It starts hidden behind the first card again, so it loops.
 */
export function tour(c: Rect[]): { start: Point; legs: Leg[] } {
  const [a, b, d, e] = c as [Rect, Rect, Rect, Rect];
  const hidden = { x: a.right - W - 6, y: a.bottom - H - 8 };      // fully behind card 1
  const peek = { x: a.right - W * 0.4, y: hidden.y };              // head and flag out past its edge
  const floor = a.bottom - H + 10;                                 // feet just below the cards' bottom edge
  const seat = { x: b.left + b.width * 0.42 - W / 2, y: b.top - H * 0.62 }; // bottom on the edge, feet over the front
  const restAt = { x: d.right - W * 0.42, y: floor + 4 };
  return {
    start: hidden,
    legs: [
      { ms: 900, to: hidden, pose: "peek" },
      { ms: 450, to: peek, pose: "peek" },
      { ms: 1500, to: peek, pose: "peek", chirp: true },
      { ms: 350, to: hidden, pose: "peek" },
      { ms: 700, to: hidden, pose: "peek" },
      { ms: 350, to: peek, pose: "peek" },
      { ms: 900, to: peek, pose: "peek" },
      { ms: 500, to: { x: a.right + 2, y: floor }, pose: "walk" },
      { ms: 1500, to: { x: seat.x - 10, y: floor }, pose: "walk" },
      { ms: 650, to: seat, pose: "hop", arc: 46 },
      { ms: 4800, to: seat, pose: "sit", chirp: true },
      { ms: 850, to: { x: b.right - W / 2 + 6, y: floor }, pose: "hop", arc: 30 },
      { ms: 2200, to: { x: restAt.x - 6, y: floor }, pose: "walk" },
      { ms: 350, to: restAt, pose: "rest", tilt: -16 },
      { ms: 4300, to: restAt, pose: "rest", tilt: -16, chirp: true },
      { ms: 300, to: { x: restAt.x + 4, y: floor }, pose: "walk" },
      { ms: 4200, to: { x: e.right + 24, y: floor }, pose: "walk", fade: true },
      { ms: 1600, to: { x: e.right + 24, y: floor }, pose: "walk", fade: true },
    ],
  };
}

const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

/**
 * One penguin touring the plan cards (wide screens with all four in a row).
 * It sits between the first card (in front of it) and the rest (behind it),
 * so it can hide behind the first card and still be seen everywhere else.
 * Decorative: it never blocks a click.
 */
export function TourPenguin({ grid }: { grid: RefObject<HTMLDivElement | null> }) {
  const el = useRef<HTMLDivElement>(null);
  const [pose, setPose] = useState<Pose>("peek");
  const [talking, setTalking] = useState(false);
  const [hiding, setHiding] = useState(true);

  useEffect(() => {
    const g = grid.current, me = el.current;
    if (!g || !me) return;
    let plan: ReturnType<typeof tour> | null = null;
    const measure = () => {
      const base = g.getBoundingClientRect();
      const cards = [...g.querySelectorAll<HTMLElement>(".plan-card")].map((n) => {
        const r = n.getBoundingClientRect();
        return { left: r.left - base.left, right: r.right - base.left, top: r.top - base.top, bottom: r.bottom - base.top, width: r.width };
      });
      plan = cards.length === 4 ? tour(cards) : null;
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(g);

    let t0 = performance.now(), raf = 0, lastLeg = -1;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (!plan) return;
      const total = plan.legs.reduce((s, l) => s + l.ms, 0);
      let t = (now - t0) % total;
      let from = plan.start, i = 0;
      // Where in the loop we are: walk the legs, remembering where the last one ended.
      for (; i < plan.legs.length; i++) {
        const leg = plan.legs[i]!;
        if (t < leg.ms) break;
        t -= leg.ms;
        from = leg.to;
      }
      if (i >= plan.legs.length) { t0 = now; return; }
      const leg = plan.legs[i]!;
      const k = leg.pose === "walk" ? t / leg.ms : ease(t / leg.ms);
      const x = from.x + (leg.to.x - from.x) * k;
      const y = from.y + (leg.to.y - from.y) * k - (leg.arc ? Math.sin(Math.PI * k) * leg.arc : 0);
      const fadeOut = leg.fade ? (i === plan.legs.length - 1 ? 0 : Math.max(0, 1 - Math.max(0, k - 0.7) / 0.3)) : 1;
      me.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0) rotate(${leg.tilt ?? 0}deg)`;
      me.style.opacity = String(fadeOut);
      if (i !== lastLeg) {
        lastLeg = i;
        setPose(leg.pose);
        setTalking(!!leg.chirp);
        setHiding(leg.pose === "peek" && leg.to.x === plan.start.x); // the flag goes behind the card with it
      }
    };
    raf = requestAnimationFrame(frame);
    // Pause when the cards are off screen, so it never burns battery unseen.
    const io = new IntersectionObserver(([en]) => {
      cancelAnimationFrame(raf);
      if (en?.isIntersecting) { t0 = performance.now(); lastLeg = -1; raf = requestAnimationFrame(frame); }
    });
    io.observe(g);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); io.disconnect(); };
  }, [grid]);

  const side = pose === "walk" || pose === "hop" || pose === "rest";
  return (
    <div ref={el} aria-hidden
      className={`hp tp tp-${pose} ${side ? "profile" : ""} ${pose === "walk" ? "walk" : ""} ${pose === "peek" ? "flag-up flag-right" : ""} ${talking ? "chirping" : ""}`}
      style={{ ["--dir" as string]: 1 }}>
      <div className="hp-bird">
        {pose === "peek" && !hiding && <span className="hp-flag" aria-hidden><i className="hp-pole" /><span className="hp-cloth">Peek-a-boo!</span></span>}
        <span className="hp-chirp">{pose === "rest" ? "z z z" : "chirp!"}</span>
        <PenguinSide />
        <PenguinSprite />
      </div>
    </div>
  );
}

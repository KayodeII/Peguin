import { useEffect, useRef } from "react";
import { reducedMotion } from "../ui";

/**
 * A quiet dot grid with ripples that travel outward like sound in a room.
 * Dots near a ripple front (or the cursor) grow and take the accent colour.
 * Pauses off-screen; static grid when motion is reduced.
 */
export function SoundField({ className }: { className?: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = canvas.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    const accent = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#c8432f";
    const dotColor = getComputedStyle(document.documentElement).getPropertyValue("--dot").trim() || "rgba(55,53,47,.18)";
    const GAP = 26;
    let w = 0, h = 0, dpr = 1, raf = 0, visible = true;
    let mouse = { x: -9999, y: -9999 };
    const ripples: { x: number; y: number; t0: number }[] = [];

    const resize = () => {
      dpr = Math.min(2, devicePixelRatio || 1);
      const r = c.getBoundingClientRect();
      w = r.width; h = r.height;
      c.width = w * dpr; c.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    const draw = (t: number) => {
      ctx.clearRect(0, 0, w, h);
      if (!reducedMotion() && (ripples.length === 0 || t - ripples[ripples.length - 1]!.t0 > 2600)) {
        ripples.push({ x: w * (0.55 + Math.random() * 0.4), y: h * (0.2 + Math.random() * 0.6), t0: t });
      }
      while (ripples.length && t - ripples[0]!.t0 > 6000) ripples.shift();
      for (let y = GAP / 2; y < h; y += GAP) {
        for (let x = GAP / 2; x < w; x += GAP) {
          let e = 0;
          for (const r of ripples) {
            const radius = (t - r.t0) * 0.16;
            const d = Math.hypot(x - r.x, y - r.y);
            const band = Math.max(0, 1 - Math.abs(d - radius) / 40);
            e = Math.max(e, band * Math.max(0, 1 - (t - r.t0) / 6000));
          }
          const md = Math.hypot(x - mouse.x, y - mouse.y);
          e = Math.max(e, Math.max(0, 1 - md / 120) * 0.8);
          ctx.beginPath();
          ctx.fillStyle = e > 0.05 ? accent : dotColor;
          ctx.globalAlpha = e > 0.05 ? 0.25 + e * 0.6 : 1;
          ctx.arc(x, y, 1.1 + e * 1.8, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
      if (visible && !reducedMotion()) raf = requestAnimationFrame(draw);
    };

    resize();
    const ro = new ResizeObserver(() => { resize(); if (reducedMotion()) draw(0); });
    ro.observe(c);
    const io = new IntersectionObserver(([e]) => {
      visible = !!e?.isIntersecting;
      cancelAnimationFrame(raf);
      if (visible) raf = requestAnimationFrame(draw);
    });
    io.observe(c);
    const move = (ev: PointerEvent) => { const r = c.getBoundingClientRect(); mouse = { x: ev.clientX - r.left, y: ev.clientY - r.top }; };
    const leave = () => { mouse = { x: -9999, y: -9999 }; };
    c.parentElement?.addEventListener("pointermove", move);
    c.parentElement?.addEventListener("pointerleave", leave);
    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf); ro.disconnect(); io.disconnect();
      c.parentElement?.removeEventListener("pointermove", move);
      c.parentElement?.removeEventListener("pointerleave", leave);
    };
  }, []);
  return <canvas ref={canvas} className={`bg-canvas ${className ?? ""}`} aria-hidden />;
}

/** Slow, overlapping audio waveforms drifting across a dark section. */
export function Waveforms() {
  const lines = [
    { amp: 26, len: 220, dur: 18, op: 0.22 },
    { amp: 40, len: 340, dur: 26, op: 0.14 },
    { amp: 16, len: 160, dur: 14, op: 0.18 },
  ];
  const path = (amp: number, len: number) => {
    let d = `M 0 60`;
    for (let x = 0; x <= 2400; x += len / 4) d += ` Q ${x + len / 8} ${60 - amp} ${x + len / 4} 60 T ${x + len / 2} 60`;
    return d;
  };
  return (
    <svg className="bg-waves" viewBox="0 0 1200 120" preserveAspectRatio="none" aria-hidden>
      {lines.map((l, i) => (
        <path key={i} d={path(l.amp, l.len)} fill="none" stroke="currentColor" strokeWidth="1.5" opacity={l.op} style={{ animationDuration: `${l.dur}s` }} />
      ))}
    </svg>
  );
}

/** Concentric rings expanding from a point, like a voice carrying. */
export function VoiceRings() {
  return (
    <div className="bg-rings" aria-hidden>
      {[0, 1, 2, 3].map((i) => <span key={i} style={{ animationDelay: `${i * 1.6}s` }} />)}
    </div>
  );
}

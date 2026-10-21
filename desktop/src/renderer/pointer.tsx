// Voice control's see-through overlay, one per display (#pointer). Draws
// Peguin's cursor travelling to what it clicks, a caption, the listening orb,
// numbered badges and drawings; on the primary display it also streams the
// owner's mic to the main process as 24 kHz PCM16. Click-through except while
// the owner draws freehand.
import { useEffect, useRef, useState } from "react";
import type { OverlayEvent } from "../main/pointer/index";

type Rect = { x: number; y: number; w: number; h: number };
type Mark = { id: number; shape: "circle" | "box" | "arrow" | "underline" | "highlight" | "pen"; rect: Rect; points?: [number, number][] };
type Bridge = { onEvent: (fn: (e: OverlayEvent) => void) => void; pcm: (b: ArrayBuffer) => void; micError: (why: string) => void; penDone: () => void };
declare global { interface Window { peguinPointer?: Bridge } }

const GLIDE_MS = 260;
let bound = false; // StrictMode runs effects twice in development; bind the bridge once
const CAPTION_MS = 2600;

async function startMic(bridge: Bridge) {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } });
    const ctx = new AudioContext({ sampleRate: 24000 });
    const src = ctx.createMediaStreamSource(stream);
    const proc = ctx.createScriptProcessor(2048, 1, 1);
    const mute = ctx.createGain();
    mute.gain.value = 0;
    src.connect(proc); proc.connect(mute); mute.connect(ctx.destination);
    proc.onaudioprocess = (e) => {
      const ch = e.inputBuffer.getChannelData(0);
      const out = new Int16Array(ch.length);
      for (let i = 0; i < ch.length; i++) out[i] = Math.max(-1, Math.min(1, ch[i]!)) * 0x7fff;
      bridge.pcm(out.buffer);
    };
  } catch (e) {
    bridge.micError(e instanceof Error ? e.message : String(e));
  }
}

/** A freehand stroke as a smooth SVG path (midpoint quadratic curves). */
function smooth(points: [number, number][]): string {
  if (points.length < 2) return points.length ? `M${points[0]![0]},${points[0]![1]}l0.1,0` : "";
  let d = `M${points[0]![0]},${points[0]![1]}`;
  for (let i = 1; i < points.length - 1; i++) {
    const [x, y] = points[i]!, [nx, ny] = points[i + 1]!;
    d += ` Q${x},${y} ${(x + nx) / 2},${(y + ny) / 2}`;
  }
  const last = points[points.length - 1]!;
  return `${d} L${last[0]},${last[1]}`;
}

function Shape({ m }: { m: Mark }) {
  const { x, y, w, h } = m.rect;
  switch (m.shape) {
    case "circle": return <ellipse className="ink draw" cx={x + w / 2} cy={y + h / 2} rx={w / 2 + 6} ry={h / 2 + 6} pathLength={1} />;
    case "box": return <rect className="ink draw" x={x} y={y} width={w} height={h} rx={10} pathLength={1} />;
    case "underline": return <path className="ink draw" d={`M${x},${y + h} q${w / 2},6 ${w},0`} pathLength={1} />;
    case "highlight": return <rect className="highlight" x={x} y={y} width={w} height={h} rx={6} />;
    case "arrow": {
      const tx = x + w, ty = y + h; // the tip, at what it points to
      return (
        <g className="draw-group">
          <path className="ink draw" d={`M${x},${y} Q${x + w * 0.15},${y + h * 0.8} ${tx - 6},${ty - 6}`} pathLength={1} />
          <path className="ink draw late" d={`M${tx - 30},${ty - 6} L${tx - 4},${ty - 4} L${tx - 8},${ty - 30}`} pathLength={1} />
        </g>
      );
    }
    case "pen": return <path className="ink" d={smooth(m.points ?? [])} />;
  }
}

export function PointerOverlay() {
  const origin = useRef({ x: 0, y: 0 });
  const [ghost, setGhost] = useState<{ x: number; y: number; moving: boolean; ring: Rect | null; key: number } | null>(null);
  const [caption, setCaption] = useState<{ text: string; tone: "info" | "warn"; x: number; y: number; key: number } | null>(null);
  const [listening, setListening] = useState<{ x: number; y: number } | null>(null);
  const [numbers, setNumbers] = useState<(Rect & { n: number })[]>([]);
  const [marks, setMarks] = useState<Mark[]>([]);
  const [pen, setPen] = useState(false);
  const stroke = useRef<Mark | null>(null);
  const ids = useRef(0);
  const timers = useRef<{ caption?: number; ghost?: number }>({});

  useEffect(() => {
    document.documentElement.classList.add("pointer-overlay");
    const bridge = window.peguinPointer;
    if (!bridge || bound) return;
    bound = true;
    const local = (p: { x: number; y: number }) => ({ x: p.x - origin.current.x, y: p.y - origin.current.y });
    const localRect = (r: Rect): Rect => ({ ...r, ...local(r) });
    bridge.onEvent((e) => {
      switch (e.kind) {
        case "origin": origin.current = { x: e.x, y: e.y }; if (e.mic) void startMic(bridge); return;
        case "glide": {
          const from = local(e.from), to = local(e);
          const key = ++ids.current;
          setGhost({ ...from, moving: false, ring: null, key });
          requestAnimationFrame(() => requestAnimationFrame(() => setGhost({ ...to, moving: true, ring: e.ring && localRect(e.ring), key })));
          window.clearTimeout(timers.current.ghost);
          timers.current.ghost = window.setTimeout(() => setGhost(null), GLIDE_MS + 1100);
          return;
        }
        case "caption":
          setCaption({ text: e.text, tone: e.tone, ...local(e), key: ++ids.current });
          window.clearTimeout(timers.current.caption);
          timers.current.caption = window.setTimeout(() => setCaption(null), e.tone === "warn" ? CAPTION_MS * 2 : CAPTION_MS);
          return;
        case "listening": setListening(e.on ? local(e) : null); return;
        case "numbers": setNumbers(e.items.map((i) => ({ ...i, ...local(i) }))); return;
        case "shape": setMarks((ms) => [...ms, { id: ++ids.current, shape: e.shape, rect: localRect(e.rect) }]); return;
        case "pen": setPen(e.on); return;
        case "clear": setMarks([]); setNumbers([]); return;
      }
    });
  }, []);

  useEffect(() => {
    if (!pen) return;
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") window.peguinPointer?.penDone(); };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [pen]);

  const down = (e: React.PointerEvent) => {
    if (!pen) return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    stroke.current = { id: ++ids.current, shape: "pen", rect: { x: 0, y: 0, w: 0, h: 0 }, points: [[e.clientX, e.clientY]] };
    setMarks((ms) => [...ms, stroke.current!]);
  };
  const move = (e: React.PointerEvent) => {
    const s = stroke.current;
    if (!pen || !s) return;
    s.points = [...s.points!, [e.clientX, e.clientY]];
    setMarks((ms) => ms.map((m) => (m.id === s.id ? { ...s } : m)));
  };
  const up = () => { stroke.current = null; };

  return (
    <div className={`overlay ${pen ? "pen" : ""}`} onPointerDown={down} onPointerMove={move} onPointerUp={up}>
      <style>{CSS}</style>
      <svg className="marks" width="100%" height="100%">
        {marks.map((m) => <Shape key={m.id} m={m} />)}
        {ghost?.ring && <rect key={ghost.key} className="target-ring" x={ghost.ring.x - 4} y={ghost.ring.y - 4} width={ghost.ring.w + 8} height={ghost.ring.h + 8} rx={8} />}
      </svg>
      {numbers.map((b) => <div key={b.n} className="badge" style={{ left: b.x, top: b.y }}>{b.n}</div>)}
      {ghost && (
        <div key={ghost.key} className={`ghost ${ghost.moving ? "moving" : ""}`} style={{ transform: `translate(${ghost.x}px, ${ghost.y}px)` }}>
          <svg width="30" height="30" viewBox="0 0 30 30" aria-hidden><path d="M3 2 L26 13 L15 16 L11 27 Z" /></svg>
          <span className="pulse" />
        </div>
      )}
      {listening && (
        <div className="listening" style={{ left: listening.x + 22, top: listening.y + 22 }}>
          <span className="orb"><i /><i /><i /></span>Listening
        </div>
      )}
      {caption && <div key={caption.key} className={`caption ${caption.tone}`} style={{ left: caption.x + 22, top: caption.y + 26 }}>{caption.text}</div>}
      {pen && <div className="pen-hint">Drawing. Esc or “Hey Peguin, done” to finish, “clear” to wipe it.</div>}
    </div>
  );
}

const CSS = `
html.pointer-overlay, html.pointer-overlay body, html.pointer-overlay #root { background: transparent !important; margin: 0; height: 100%; overflow: hidden; }
.overlay { --pg: #ff5a36; --pg-glow: rgba(255, 90, 54, .55); position: fixed; inset: 0; pointer-events: none; font: 500 13px/1.3 -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif; user-select: none; }
.overlay.pen { pointer-events: auto; cursor: crosshair; background: rgba(0, 0, 0, .04); }
.marks { position: absolute; inset: 0; overflow: visible; }
.ink { fill: none; stroke: var(--pg); stroke-width: 4; stroke-linecap: round; stroke-linejoin: round; filter: drop-shadow(0 0 1.5px #fff) drop-shadow(0 0 6px var(--pg-glow)); }
.draw { stroke-dasharray: 1; stroke-dashoffset: 1; animation: draw .5s cubic-bezier(.6, 0, .3, 1) forwards; }
.draw.late { animation-delay: .4s; }
.highlight { fill: rgba(255, 214, 10, .32); stroke: rgba(255, 190, 0, .8); stroke-width: 1.5; animation: fade-in .25s ease-out; }
.target-ring { fill: none; stroke: var(--pg); stroke-width: 2.5; opacity: 0; animation: ring 1.1s ease-out ${GLIDE_MS}ms forwards; filter: drop-shadow(0 0 8px var(--pg-glow)); }
.ghost { position: absolute; left: 0; top: 0; width: 30px; height: 30px; margin: -3px 0 0 -3px; transition: none; will-change: transform; }
.ghost.moving { transition: transform ${GLIDE_MS}ms cubic-bezier(.55, 0, .25, 1); }
.ghost svg { position: absolute; inset: 0; filter: drop-shadow(0 0 2px rgba(0,0,0,.5)) drop-shadow(0 0 10px var(--pg-glow)); }
.ghost path { fill: var(--pg); stroke: #fff; stroke-width: 1.8; stroke-linejoin: round; }
.ghost .pulse { position: absolute; left: 3px; top: 2px; width: 10px; height: 10px; margin: -5px; border-radius: 50%; border: 2px solid var(--pg); opacity: 0; animation: pulse .7s ease-out ${GLIDE_MS}ms 2; }
.caption, .listening, .pen-hint { position: absolute; color: #fff; background: rgba(20, 20, 24, .78); backdrop-filter: blur(14px) saturate(1.6); -webkit-backdrop-filter: blur(14px) saturate(1.6);
  border: 1px solid rgba(255, 255, 255, .14); border-radius: 999px; padding: 7px 13px; white-space: nowrap; box-shadow: 0 8px 28px rgba(0, 0, 0, .35); animation: pop .22s cubic-bezier(.2, .9, .3, 1.3); }
.caption { max-width: 520px; overflow: hidden; text-overflow: ellipsis; }
.caption::before { content: ""; display: inline-block; width: 7px; height: 7px; border-radius: 50%; background: var(--pg); margin-right: 8px; box-shadow: 0 0 8px var(--pg); vertical-align: 1px; }
.caption.warn { white-space: normal; border-radius: 14px; width: max-content; max-width: 360px; }
.caption.warn::before { background: #ffcc00; box-shadow: 0 0 8px #ffcc00; }
.listening { display: flex; align-items: center; gap: 9px; padding-left: 9px; }
.orb { display: inline-flex; gap: 2.5px; align-items: center; height: 16px; padding: 0 5px; border-radius: 999px; background: radial-gradient(circle, var(--pg) 0%, #c2361a 100%); box-shadow: 0 0 14px var(--pg-glow); }
.orb i { width: 2.5px; height: 6px; border-radius: 2px; background: #fff; animation: wave .9s ease-in-out infinite; }
.orb i:nth-child(2) { animation-delay: .15s; } .orb i:nth-child(3) { animation-delay: .3s; }
.badge { position: absolute; transform: translate(-6px, -8px); min-width: 18px; height: 18px; padding: 0 5px; border-radius: 9px; background: var(--pg); color: #fff; font: 700 11px/18px -apple-system, sans-serif;
  text-align: center; box-shadow: 0 0 0 1.5px #fff, 0 2px 8px rgba(0, 0, 0, .35); animation: pop .2s cubic-bezier(.2, .9, .3, 1.4) backwards; }
.pen-hint { left: 50%; top: 18px; transform: translateX(-50%); }
@keyframes draw { to { stroke-dashoffset: 0; } }
@keyframes fade-in { from { opacity: 0; } }
@keyframes ring { 0% { opacity: 0; transform: scale(1.25); transform-origin: center; transform-box: fill-box; } 30% { opacity: 1; transform: scale(1); } 100% { opacity: 0; transform: scale(1); } }
@keyframes pulse { from { opacity: .9; transform: scale(.6); } to { opacity: 0; transform: scale(3.2); } }
@keyframes pop { from { opacity: 0; transform: translateY(4px) scale(.96); } }
@keyframes wave { 0%, 100% { height: 4px; } 50% { height: 11px; } }
@media (prefers-reduced-motion: reduce) { .ghost.moving { transition-duration: 1ms; } .draw { animation-duration: 1ms; } .orb i { animation: none; } }
`;

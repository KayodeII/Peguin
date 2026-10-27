// Voice control's see-through overlay, one per display (#pointer). Draws
// Peguin's own cursor (it stays where it last worked; it becomes a live
// waveform when Peguin hears its name), the Dynamic Island at the top of the
// primary display (what Peguin is hearing and doing), numbered badges and
// drawings. On the primary display it also streams the owner's mic to the
// main process as 24 kHz PCM16. Click-through except while the owner draws.
import { useEffect, useRef, useState } from "react";
import type { OverlayEvent } from "../main/pointer/index";
import { COLORS, CursorArt, type CursorStyle } from "./cursorArt";

/** A unit-ish direction from `a` to `b`, for the eye (-1..1 each way). */
function towards(a: { x: number; y: number }, b: { x: number; y: number }) {
  const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
  return d < 4 ? { x: 0, y: 0 } : { x: dx / d, y: dy / d };
}

type Rect = { x: number; y: number; w: number; h: number };
type Mark = { id: number; shape: "circle" | "box" | "arrow" | "underline" | "highlight" | "pen"; rect: Rect; points?: [number, number][] };
type Bridge = { onEvent: (fn: (e: OverlayEvent) => void) => void; ready: () => void; pcm: (b: ArrayBuffer) => void; micError: (why: string) => void; penDone: () => void };
declare global { interface Window { peguinPointer?: Bridge } }

let bound = false; // StrictMode runs effects twice in development; bind the bridge once
let micStarted = false; // origin can arrive twice (load + ready); only open the mic once
const CAPTION_MS = 2600;

async function startMic(bridge: Bridge) {
  if (micStarted) return;
  micStarted = true;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } });
    const ctx = new AudioContext({ sampleRate: 24000 });
    // Chromium often starts the context suspended; without resume, dictation gets silence forever.
    if (ctx.state === "suspended") await ctx.resume();
    const src = ctx.createMediaStreamSource(stream);
    const proc = ctx.createScriptProcessor(2048, 1, 1);
    const mute = ctx.createGain();
    mute.gain.value = 0;
    src.connect(proc); proc.connect(mute); mute.connect(ctx.destination);
    proc.onaudioprocess = (e) => {
      const ch = e.inputBuffer.getChannelData(0);
      const out = new Int16Array(ch.length);
      let sum = 0;
      for (let i = 0; i < ch.length; i++) { out[i] = Math.max(-1, Math.min(1, ch[i]!)) * 0x7fff; sum += ch[i]! * ch[i]!; }
      onLevel(Math.min(1, Math.sqrt(sum / ch.length) * 9));
      bridge.pcm(out.buffer);
    };
  } catch (e) {
    micStarted = false;
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

/** The mic level (0..1), smoothed, for the island's bars and the waveform cursor. Only the primary display hears the mic. */
let onLevel: (v: number) => void = () => {};

type Mode = "idle" | "hearing" | "working" | "warn";
const BARS = [0.55, 0.85, 1, 0.75, 0.5];

/** Waveform bars sized by the live mic level (CSS var --lvl on the overlay), each with its own wobble. */
function Wave({ n = 5 }: { n?: number }) {
  return <span className="wave">{BARS.slice(0, n).map((b, i) => <i key={i} style={{ "--b": b, animationDelay: `${i * 0.11}s` } as React.CSSProperties} />)}</span>;
}

export function PointerOverlay() {
  const origin = useRef({ x: 0, y: 0 });
  const root = useRef<HTMLDivElement>(null);
  const [island, setIsland] = useState<{ notch: boolean; bar: number; notchW: number } | null>(null);
  const [agent, setAgent] = useState<{ x: number; y: number; animate: boolean; docked: boolean; ms?: number; ring: Rect | null; key: number } | null>(null);
  const [gaze, setGaze] = useState({ x: -0.6, y: -0.6 });
  const looking = useRef({ until: 0, agent: { x: 0, y: 0 } });
  const [style, setStyle] = useState<{ cursor: CursorStyle; island: boolean }>({ cursor: { shape: "penguin", color: "tomato", size: 1, glideMs: 450, home: "roam", returnAfterS: 6 }, island: true });
  const [mode, setMode] = useState<{ mode: Mode; text?: string; key: number }>({ mode: "idle", key: 0 });
  const [numbers, setNumbers] = useState<(Rect & { n: number })[]>([]);
  const [marks, setMarks] = useState<Mark[]>([]);
  const [pen, setPen] = useState(false);
  const stroke = useRef<Mark | null>(null);
  const ids = useRef(0);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    document.documentElement.classList.add("pointer-overlay");
    let level = 0;
    onLevel = (v) => { level = level * 0.6 + v * 0.4; root.current?.style.setProperty("--lvl", level.toFixed(3)); };
    const bridge = window.peguinPointer;
    if (!bridge || bound) return;
    bound = true;
    const local = (p: { x: number; y: number }) => ({ x: p.x - origin.current.x, y: p.y - origin.current.y });
    const localRect = (r: Rect): Rect => ({ ...r, ...local(r) });
    bridge.onEvent((e) => {
      switch (e.kind) {
        case "origin":
          origin.current = { x: e.x, y: e.y };
          if (e.island) setIsland({ notch: e.notch, bar: e.bar, notchW: e.notchW });
          if (e.mic) void startMic(bridge);
          return;
        case "agent": {
          const to = local(e);
          // While it travels, the eye looks where it's going; afterwards it watches the owner's mouse again.
          if (e.animate) { setGaze(towards(looking.current.agent, to)); looking.current.until = Date.now() + 1400; }
          looking.current.agent = to;
          setAgent({ ...to, animate: e.animate, docked: e.docked, ms: e.ms, ring: e.ring && localRect(e.ring), key: ++ids.current });
          return;
        }
        case "look": if (Date.now() > looking.current.until) setGaze(towards(looking.current.agent, local(e))); return;
        case "style": setStyle({ cursor: e.cursor, island: e.island }); return;
        case "mode":
          window.clearTimeout(timer.current);
          setMode({ mode: e.mode, text: e.text, key: ++ids.current });
          // Working and warn fade back to idle; hearing waits for the command (main ends it).
          // Quota / long warn lines stay long enough to read under the cursor.
          const warnMs = e.mode === "warn" ? Math.max(CAPTION_MS * 3, Math.min(12000, 40 * (e.text?.length ?? 0))) : CAPTION_MS;
          if (e.mode === "working" || e.mode === "warn") timer.current = window.setTimeout(() => setMode({ mode: "idle", key: ++ids.current }), warnMs);
          if (e.mode === "hearing") timer.current = window.setTimeout(() => setMode({ mode: "idle", key: ++ids.current }), 12000);
          return;
        case "numbers": setNumbers(e.items.map((i) => ({ ...i, ...local(i) }))); return;
        case "shape": setMarks((ms) => [...ms, { id: ++ids.current, shape: e.shape, rect: localRect(e.rect) }]); return;
        case "pen": setPen(e.on); return;
        case "clear": setMarks([]); setNumbers([]); return;
      }
    });
    // Ask main to (re)send origin/mic — did-finish-load can beat this effect, which left dictation silent.
    bridge.ready();
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

  const m = mode.mode;
  const c = style.cursor, color = COLORS[c.color];
  const vars = { "--glide": `${c.glideMs}ms`, "--size": c.size, "--pg-glow": color.glow } as React.CSSProperties;
  const hearing = m === "hearing";
  return (
    <div ref={root} style={vars} className={`overlay mode-${m} ${pen ? "pen" : ""}`} onPointerDown={down} onPointerMove={move} onPointerUp={up}>
      <style>{CSS}</style>
      <svg className="marks" width="100%" height="100%">
        {marks.map((mk) => <Shape key={mk.id} m={mk} />)}
        {agent?.ring && <rect key={agent.key} className="target-ring" x={agent.ring.x - 4} y={agent.ring.y - 4} width={agent.ring.w + 8} height={agent.ring.h + 8} rx={8} />}
      </svg>
      {numbers.map((b) => <div key={b.n} className="badge" style={{ left: b.x, top: b.y }}>{b.n}</div>)}
      {agent && (
        <div className={`agent ${c.shape} ${agent.animate ? "moving" : ""} ${agent.docked && style.island ? "docked" : ""} ${m === "hearing" ? "hearing" : ""} ${m === "warn" ? "warn" : ""}`} style={{ transform: `translate(${agent.x}px, ${agent.y}px)`, ...(agent.ms ? { "--glide": `${agent.ms}ms` } : {}) } as React.CSSProperties}>
          <svg className="arrow" width="34" height="34" viewBox="0 0 34 34" aria-hidden><CursorArt shape={c.shape} color={c.color} gaze={gaze} wide={hearing} /></svg>
          {c.shape === "penguin" ? <span className="bubble"><Wave /></span> : <span className="blob"><Wave /></span>}
          {agent.animate && <span key={agent.key} className="pulse" />}
          {(m === "working" || m === "warn") && mode.text && (
            <div key={mode.key} className={`callout ${m}`} role="status">
              <span className="callout-caret" aria-hidden />
              <p className="callout-body">{mode.text}</p>
            </div>
          )}
        </div>
      )}
      {island && style.island && (island.notch ? (
        // Around the camera, like the iPhone's Dynamic Island: the dot and the waveform sit either side of
        // the notch (nothing can show under the camera itself), and the words drop down below it.
        <div className={`island notch ${m}`} style={{ "--nw": `${island.notchW}px`, "--bar": `${island.bar}px` } as React.CSSProperties}>
          <div className="ears">
            <span className="ear l"><span className="dot" /></span>
            <span className="cam" />
            <span className="ear r"><Wave n={m === "hearing" ? 5 : 3} /></span>
          </div>
          <span key={mode.key} className="island-text">{m === "hearing" ? (mode.text || "Listening…") : m === "working" || m === "warn" ? mode.text : ""}</span>
        </div>
      ) : (
        <div className={`island float ${m}`}>
          <span className="dot" />
          <span key={mode.key} className="island-text">
            {m === "hearing" ? (mode.text || "Listening…") : m === "working" || m === "warn" ? mode.text : "Peguin"}
          </span>
          <Wave n={m === "hearing" ? 5 : 3} />
        </div>
      ))}
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
.target-ring { fill: none; stroke: var(--pg); stroke-width: 2.5; opacity: 0; animation: ring 1.1s ease-out var(--glide) forwards; filter: drop-shadow(0 0 8px var(--pg-glow)); }
.agent { position: absolute; left: 0; top: 0; width: 34px; height: 34px; margin: -3px 0 0 -3px; will-change: transform; animation: fade-in .3s ease-out; }
.agent.moving { transition: transform var(--glide) cubic-bezier(.55, 0, .25, 1); }
.agent .arrow { position: absolute; inset: 0; overflow: visible; filter: drop-shadow(0 0 2px rgba(0,0,0,.5)) drop-shadow(0 0 10px var(--pg-glow)); transform: scale(var(--size));
  transition: transform .35s cubic-bezier(.3, 1.4, .5, 1), opacity .2s; transform-origin: 3px 2px; }
.agent .pupil { transition: cx .25s ease-out, cy .25s ease-out; }
.agent .eye { transform-box: fill-box; transform-origin: center; animation: blink 5.5s infinite; }
/* The penguin keeps its head when it hears its name: the eye opens and a waveform bubble pops up beside it. */
.agent .bubble { position: absolute; left: 30px; top: -14px; height: 24px; padding: 0 8px; border-radius: 12px 12px 12px 3px; display: flex; align-items: center;
  background: radial-gradient(circle at 30% 30%, #ff8a6b, #ff5a36 60%, #c2361a); box-shadow: 0 0 0 1.5px #fff, 0 0 calc(10px + var(--lvl, 0) * 30px) var(--pg-glow);
  opacity: 0; transform: scale(.4) translateY(6px); transform-origin: 0 100%; transition: transform .3s cubic-bezier(.3, 1.5, .5, 1), opacity .2s; }
.agent.penguin.hearing .bubble { opacity: 1; transform: scale(var(--size)); }
.agent.penguin.hearing .arrow { opacity: 1; transform: scale(var(--size)); }
.agent.penguin.docked .arrow { transform: scale(calc(var(--size) * .9)); animation: bob 3.4s ease-in-out infinite; }
/* At home: the fin hangs off the island's side like a flipper, and gently paddles. */
.agent.docked .arrow { transform: scale(calc(var(--size) * .85)) rotate(-28deg); animation: paddle 3.2s ease-in-out infinite; }
.agent.docked.hearing .arrow { animation: none; }
.agent .blob { position: absolute; left: -9px; top: -10px; width: 34px; height: 34px; border-radius: 50%; display: grid; place-items: center;
  background: radial-gradient(circle at 35% 30%, #ff8a6b, var(--pg) 55%, #c2361a); box-shadow: 0 0 0 2px #fff, 0 0 calc(14px + var(--lvl, 0) * 40px) var(--pg-glow);
  opacity: 0; transform: scale(.3); transition: transform .3s cubic-bezier(.3, 1.5, .5, 1), opacity .2s; }
.agent.hearing .arrow { opacity: 0; transform: scale(.3); }
.agent .blob { scale: var(--size); }
.agent.hearing .blob { opacity: 1; transform: scale(calc(1 + var(--lvl, 0) * .35)); }
.agent .pulse { position: absolute; left: 3px; top: 2px; width: 10px; height: 10px; margin: -5px; border-radius: 50%; border: 2px solid var(--pg); opacity: 0; animation: pulse .7s ease-out var(--glide) 2; }
/* Rectangular callout under Peguin's cursor: status and out-of-uses lines. */
.callout { position: absolute; left: 4px; top: 40px; width: max-content; max-width: 260px; min-width: 148px; box-sizing: border-box;
  display: grid; grid-template-columns: 3px 1fr; align-items: stretch; gap: 0;
  background: #1a1a1a; color: #f4f4f2; border: 1px solid rgba(255, 255, 255, .14); border-radius: 6px;
  box-shadow: 0 8px 22px rgba(0, 0, 0, .45); pointer-events: none; animation: callout-in .22s cubic-bezier(.2, 1.1, .4, 1); z-index: 2;
  overflow: visible; }
.callout::before { content: ""; grid-column: 1; background: var(--pg); border-radius: 5px 0 0 5px; }
.callout-body { grid-column: 2; margin: 0; padding: 8px 11px 9px; font: 600 12px/1.4 -apple-system, "SF Pro Text", sans-serif;
  letter-spacing: -0.01em; text-align: left; white-space: normal; overflow-wrap: anywhere; }
.callout-caret { position: absolute; left: 10px; top: -6px; width: 10px; height: 6px; background: #1a1a1a;
  clip-path: polygon(50% 0, 100% 100%, 0 100%); filter: drop-shadow(0 -1px 0 rgba(255, 255, 255, .14)); }
.callout.warn { background: #2a1410; border-color: rgba(255, 120, 90, .35); }
.callout.warn::before { background: #ff5a36; }
.callout.warn .callout-caret { background: #2a1410; filter: drop-shadow(0 -1px 0 rgba(255, 120, 90, .35)); }
.callout.warn .callout-body { color: #ffe8e0; }
@keyframes callout-in { from { opacity: 0; transform: translateY(-4px) scale(.96); } to { opacity: 1; transform: none; } }
.wave { display: inline-flex; gap: 2.5px; align-items: center; height: 18px; }
.wave i { width: 3px; border-radius: 2px; background: #fff; height: calc(3px + var(--b) * (3px + var(--lvl, 0) * 26px)); animation: wobble .8s ease-in-out infinite alternate; }
.island { position: absolute; left: 50%; top: 0; transform: translateX(-50%); display: flex; align-items: center; gap: 9px; color: #fff; background: #000;
  min-width: 150px; max-width: 560px; height: 34px; padding: 0 16px; box-sizing: border-box; border-radius: 0 0 18px 18px; font: 600 12.5px/1 -apple-system, "SF Pro Text", sans-serif;
  box-shadow: 0 6px 24px rgba(0, 0, 0, .35); transition: min-width .35s cubic-bezier(.3, 1.3, .5, 1), padding .35s; }
.island.float { top: 8px; border-radius: 999px; border: 1px solid rgba(255, 255, 255, .12); }
/* Notched Macs: one black shape with the camera notch, ears either side (46px, matching EAR in main), growing down when there's something to say. */
.island.notch { display: block; padding: 0; min-width: 0; max-width: none; width: calc(var(--nw) + 92px); height: var(--bar); border-radius: 0 0 13px 13px; box-shadow: none;
  transition: width .45s cubic-bezier(.3, 1.25, .5, 1), height .45s cubic-bezier(.3, 1.25, .5, 1), border-radius .45s, box-shadow .3s; }
.island.notch::before, .island.notch::after { content: ""; position: absolute; top: 0; width: 9px; height: 9px; }
.island.notch::before { left: -9px; background: radial-gradient(circle at 0 100%, transparent 8.5px, #000 9px); }
.island.notch::after { right: -9px; background: radial-gradient(circle at 100% 100%, transparent 8.5px, #000 9px); }
.island.notch .ears { display: flex; height: var(--bar); align-items: center; }
.island.notch .cam { width: var(--nw); flex: none; }
.island.notch .ear { flex: 1; display: flex; align-items: center; min-width: 0; }
.island.notch .ear.l { justify-content: flex-end; padding-right: 15px; }
.island.notch .ear.r { justify-content: flex-start; padding-left: 11px; }
.island.notch .island-text { display: block; height: 0; padding: 0 22px; text-align: center; line-height: 30px; opacity: 0; transition: opacity .2s; }
.island.notch.hearing, .island.notch.working, .island.notch.warn { width: max(calc(var(--nw) + 92px), 400px); height: calc(var(--bar) + 32px); padding: 0; border-radius: 0 0 22px 22px; box-shadow: 0 8px 28px rgba(0, 0, 0, .4); }
.island.notch.hearing .island-text, .island.notch.working .island-text, .island.notch.warn .island-text { height: 32px; opacity: 1; transition: opacity .25s .15s; }
.island.hearing, .island.working, .island.warn { min-width: 300px; padding: 0 20px; }
.island .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--pg); box-shadow: 0 0 8px var(--pg); flex: none; }
.island.warn .dot { background: #ffcc00; box-shadow: 0 0 8px #ffcc00; }
.island-text { flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; animation: pop .25s ease-out; }
.island .wave { height: 16px; } .island .wave i { width: 2.5px; background: var(--pg); }
.island.idle .wave i { height: calc(2px + var(--b) * (1px + var(--lvl, 0) * 14px)); opacity: .8; }
.pen-hint { position: absolute; color: #fff; background: rgba(20, 20, 24, .78); backdrop-filter: blur(14px); border-radius: 999px; padding: 7px 13px; }
.badge { position: absolute; transform: translate(-6px, -8px); min-width: 18px; height: 18px; padding: 0 5px; border-radius: 9px; background: var(--pg); color: #fff; font: 700 11px/18px -apple-system, sans-serif;
  text-align: center; box-shadow: 0 0 0 1.5px #fff, 0 2px 8px rgba(0, 0, 0, .35); animation: pop .2s cubic-bezier(.2, .9, .3, 1.4) backwards; }
.pen-hint { left: 50%; top: 52px; transform: translateX(-50%); }
@keyframes draw { to { stroke-dashoffset: 0; } }
@keyframes fade-in { from { opacity: 0; } }
@keyframes ring { 0% { opacity: 0; transform: scale(1.25); transform-origin: center; transform-box: fill-box; } 30% { opacity: 1; transform: scale(1); } 100% { opacity: 0; transform: scale(1); } }
@keyframes pulse { from { opacity: .9; transform: scale(.6); } to { opacity: 0; transform: scale(3.2); } }
@keyframes pop { from { opacity: 0; transform: translateY(4px) scale(.96); } }
@keyframes blink { 0%, 95%, 100% { transform: scaleY(1); } 97% { transform: scaleY(.1); } }
@keyframes bob { 0%, 100% { translate: 0 0; } 50% { translate: 0 -2px; } }
@keyframes paddle { 0%, 100% { rotate: 0deg; } 50% { rotate: -9deg; } }
@keyframes wobble { from { transform: scaleY(.75); } to { transform: scaleY(1.15); } }
@media (prefers-reduced-motion: reduce) { .agent.moving { transition-duration: 1ms; } .draw { animation-duration: 1ms; } .wave i { animation: none; } }
`;

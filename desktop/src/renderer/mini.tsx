// Mini Peguin (#mini-island, #mini-window): the app made small. What Peguin is
// doing (the next standup, the meeting it's in, what voice control hears) and
// the few things you'd do from here. On a Mac with a notch it hugs the camera
// like the iPhone's Dynamic Island and opens when the pointer is over it, or
// while voice control is busy; otherwise it's a small window you can move.
import { useCallback, useEffect, useRef, useState } from "react";
import type { AppEvent } from "../main/index";
import type { Mode } from "../main/pointer/index";
import type { Settings } from "../main/settings";
import { Logo, message } from "./ui";

type Live = { status: string; detail?: string };
type Next = { label: string; title?: string } | null;

const busy = (m: Mode) => m === "hearing" || m === "working" || m === "warn";

export function MiniPeguin() {
  const island = location.hash === "#mini-island";
  const [settings, setSettings] = useState<Settings | null>(null);
  const [next, setNext] = useState<Next>(null);
  const [preparing, setPreparing] = useState(false);
  const [live, setLive] = useState<Live>({ status: "ended" });
  const [voice, setVoice] = useState<{ mode: Mode; text?: string }>({ mode: "idle" });
  const [notch, setNotch] = useState({ bar: 37, notchW: 185 });
  const [hover, setHover] = useState(false);
  const [error, setError] = useState("");
  const leave = useRef<number | undefined>(undefined);
  const box = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | undefined>(undefined);

  const refresh = useCallback(() => {
    void window.penguin.getSettings().then(setSettings);
    void window.penguin.nextStandup().then(setNext);
  }, []);

  useEffect(() => {
    document.documentElement.classList.add("mini-page");
    refresh();
    void window.penguin.getDraft().then((d: { preparing: boolean }) => setPreparing(d.preparing));
    void window.penguin.liveStatus().then(setLive);
    void window.penguin.miniInfo().then((i) => setNotch(i.notch));
    const t = setInterval(refresh, 60_000);
    const off = window.penguin.onEvent((raw) => {
      const e = raw as AppEvent;
      if (e.kind === "draft") setPreparing(e.preparing);
      if (e.kind === "meeting" && e.event.kind === "status") setLive({ status: e.event.status, detail: e.event.detail });
      if (e.kind === "voice-mode") setVoice({ mode: e.mode, text: e.text });
      if (e.kind === "pointer") refresh();
    });
    return () => { clearInterval(t); off(); };
  }, [refresh]);

  // The island opens under the pointer and while voice control is busy; it closes a moment after.
  const open = !island || hover || busy(voice.mode);
  // Measure what's drawn, so the window is exactly that tall (nothing see-through catches clicks).
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setHeight(el.getBoundingClientRect().height));
    ro.observe(el);
    return () => ro.disconnect();
  }, [settings]);
  useEffect(() => { void window.penguin.miniFit(open, height); }, [open, height]);
  // Working and warn captions fade back, as on the overlay.
  useEffect(() => {
    if (voice.mode !== "working" && voice.mode !== "warn") return;
    const t = setTimeout(() => setVoice({ mode: "idle" }), voice.mode === "warn" ? 8000 : 2600);
    return () => clearTimeout(t);
  }, [voice]);

  const run = (p: Promise<unknown>) => { setError(""); p.catch((e: unknown) => setError(message(e))); };
  const save = (s: Settings) => run(window.penguin.saveSettings(s).then(setSettings));

  if (!settings) return null;
  const inCall = live.status === "in_call" || live.status === "joining" || live.status === "waiting";
  const vc = settings.pointer.enabled;
  const title = busy(voice.mode) ? (voice.mode === "hearing" ? "Listening…" : voice.text || "Working…")
    : inCall ? (live.status === "in_call" ? "Peguin is in your standup" : "Peguin is joining")
    : preparing ? "Writing your update"
    : next ? `Next standup ${next.label.replace(/^\w/, (c) => c.toLowerCase())}` : "No standup set";
  const sub = busy(voice.mode) ? (voice.mode === "hearing" ? voice.text : undefined)
    : inCall ? live.detail : next?.title;
  const state = busy(voice.mode) ? voice.mode : inCall ? "live" : preparing ? "working" : "idle";
  const time = next?.label.match(/\d{1,2}:\d{2}/)?.[0];

  const panel = (
    <div className="mini-panel">
      <div className="mini-status">
        <span className={`mini-dot ${state}`} />
        <div>
          <strong>{title}</strong>
          {sub && <p>{sub}</p>}
        </div>
      </div>
      <div className="mini-actions">
        {inCall ? <>
          <button onClick={() => run(window.penguin.handOver())}>Hand over to me</button>
          <button onClick={() => run(window.penguin.leave())}>Leave</button>
        </> : <>
          <button disabled={preparing} onClick={() => run(window.penguin.prepareDraft())}>{preparing ? "Preparing…" : "Prepare update"}</button>
          {settings.standup.url && <button onClick={() => run(window.penguin.join(settings.standup.url))}>Send Peguin</button>}
        </>}
      </div>
      <div className="mini-foot">
        <button className={`mini-chip ${vc ? "on" : ""}`} onClick={() => save({ ...settings, pointer: { ...settings.pointer, enabled: !vc } })}>
          <span className="mini-led" />Voice control {vc ? "on" : "off"}
        </button>
        <button className="mini-link" onClick={() => run(window.penguin.openApp())}>Open Peguin</button>
      </div>
      {error && <p className="mini-error">{error}</p>}
    </div>
  );

  if (island) return (
    <div ref={box} className={`mini island ${open ? "open" : ""}`} style={{ "--nw": `${notch.notchW}px`, "--bar": `${notch.bar}px` } as React.CSSProperties}
      onMouseEnter={() => { clearTimeout(leave.current); setHover(true); }}
      onMouseLeave={() => { leave.current = window.setTimeout(() => setHover(false), 350); }}>
      <style>{CSS}</style>
      <div className="mini-ears">
        <span className="mini-ear"><span className={`mini-dot ${state}`} /></span>
        <span className="mini-cam" />
        <span className="mini-ear">{voice.mode === "hearing" ? <Bars /> : <span className="mini-time">{inCall ? "LIVE" : time ?? ""}</span>}</span>
      </div>
      {open && panel}
    </div>
  );

  return (
    <div ref={box} className="mini window">
      <style>{CSS}</style>
      <header className="mini-head">
        <Logo size={18} /><span>Peguin</span>
        <button className="mini-close" aria-label="Close Mini Peguin" title="Close Mini Peguin" onClick={() => save({ ...settings, mini: { ...settings.mini, mode: "off" } })}>×</button>
      </header>
      {panel}
    </div>
  );
}

function Bars() {
  return <span className="mini-bars" aria-hidden>{[0, 1, 2, 3, 4].map((i) => <i key={i} style={{ animationDelay: `${i * 0.12}s` }} />)}</span>;
}

// Dark like the hardware it sits next to, whatever the app's theme.
const CSS = `
html.mini-page, html.mini-page body, html.mini-page #root { background: transparent !important; margin: 0; height: 100%; overflow: hidden; }
.mini { font: 500 13px/1.35 -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif; color: #f4f4f5; user-select: none; -webkit-user-select: none; }
.mini.island { position: fixed; left: 0; right: 0; top: 0; margin: 0 auto; width: calc(var(--nw) + 92px); min-height: var(--bar); background: #000; border-radius: 0 0 14px 14px; transition: width .18s ease, border-radius .18s ease; }
.mini.island.open { width: 100%; border-radius: 0 0 22px 22px; }
.mini-ears { display: flex; align-items: center; height: var(--bar); }
.mini-ear { width: 46px; display: grid; place-items: center; }
.mini.island.open .mini-ear { flex: 1; }
.mini-cam { width: var(--nw); }
.mini-time { font-size: 11px; font-weight: 600; color: #d4d4d8; font-variant-numeric: tabular-nums; }
.mini-dot { display: inline-block; flex: none; width: 8px; height: 8px; border-radius: 50%; background: #71717a; }
.mini-dot.live { background: #ef4444; box-shadow: 0 0 8px #ef4444; }
.mini-dot.hearing, .mini-dot.working { background: #ff5a36; box-shadow: 0 0 8px #ff5a36; animation: mini-pulse 1.2s ease-in-out infinite; }
.mini-dot.warn { background: #f59e0b; }
@keyframes mini-pulse { 50% { opacity: .45; } }
.mini-bars { display: flex; gap: 2px; align-items: center; height: 14px; }
.mini-bars i { width: 3px; height: 100%; border-radius: 2px; background: #ff5a36; animation: mini-bar .7s ease-in-out infinite alternate; }
@keyframes mini-bar { from { transform: scaleY(.3); } to { transform: scaleY(1); } }
.mini.window { position: fixed; left: 0; right: 0; top: 0; display: flex; flex-direction: column; background: rgba(24, 24, 27, .96); border: 1px solid rgba(255, 255, 255, .1); border-radius: 14px; overflow: hidden; }
.mini-head { -webkit-app-region: drag; display: flex; align-items: center; gap: 8px; padding: 10px 12px 4px; font-weight: 600; color: #e4e4e7; }
.mini-close { -webkit-app-region: no-drag; margin-left: auto; width: 22px; height: 22px; border-radius: 6px; border: 0; background: transparent; color: #a1a1aa; font-size: 17px; line-height: 1; cursor: pointer; }
.mini-close:hover { background: rgba(255, 255, 255, .1); color: #fff; }
.mini-panel { padding: 10px 16px 14px; display: grid; gap: 12px; }
.mini-status { display: flex; gap: 10px; align-items: flex-start; }
.mini-status .mini-dot { margin-top: 6px; }
.mini-status strong { display: block; font-size: 15px; color: #fff; }
.mini-status p { margin: 2px 0 0; color: #a1a1aa; font-size: 12.5px; overflow: hidden; text-overflow: ellipsis; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
.mini-actions { display: flex; gap: 8px; }
.mini-actions button { flex: 1; padding: 8px 10px; border-radius: 9px; border: 0; background: rgba(255, 255, 255, .1); color: #fff; font: inherit; cursor: pointer; }
.mini-actions button:hover:not(:disabled) { background: rgba(255, 255, 255, .17); }
.mini-actions button:disabled { opacity: .55; cursor: default; }
.mini-foot { display: flex; align-items: center; justify-content: space-between; }
.mini-chip { display: inline-flex; align-items: center; gap: 7px; padding: 5px 10px; border-radius: 999px; border: 1px solid rgba(255, 255, 255, .14); background: transparent; color: #d4d4d8; font: inherit; font-size: 12px; cursor: pointer; }
.mini-chip.on { border-color: rgba(255, 90, 54, .6); color: #fff; }
.mini-led { width: 7px; height: 7px; border-radius: 50%; background: #52525b; }
.mini-chip.on .mini-led { background: #ff5a36; box-shadow: 0 0 6px #ff5a36; }
.mini-link { border: 0; background: none; color: #a1a1aa; font: inherit; font-size: 12px; cursor: pointer; }
.mini-link:hover { color: #fff; }
.mini-error { margin: 0; color: #fca5a5; font-size: 12px; }
`;

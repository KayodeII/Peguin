// Voice control: the owner's own mic moves the mouse, clicks, types and draws
// with Peguin's own cursor. The #cursor channel has the switch, the cursor and
// things to try (each saves at once); Settings > Voice control keeps how to talk
// to it, Smart or Quick and the search address, which save with the page.
import { useEffect, useState } from "react";
import type { PointerStatus } from "../main/pointer/index";
import type { Settings } from "../main/settings";
import { message, Toggle } from "./ui";
import { COLORS, CursorArt } from "./cursorArt";

const SAY: [string, string][] = [
  ["Click sign in", "Clicks the button or link with that name in the app in front"],
  ["Show numbers, then click 7", "Numbers everything clickable, for things without a name"],
  ["Click this · Double-click · Right-click", "Where your mouse is"],
  ["Open my browser · Go to github.com · Open Slack", "Apps and sites"],
  ["Search for …", "In your browser, with the search address below"],
  ["Scroll down a bit · Go back · New tab · Close tab", "And reload, copy, paste, undo, select all, zoom in"],
  ["Type hello there · Press enter · Find pricing", "Typing and keys"],
  ["Draw a circle · Draw an arrow here · Highlight this · Box sign in", "Marks on top of the screen, also in a screen share"],
  ["Draw · Done · Clear", "Freehand with your mouse; Done or Esc to finish"],
  ["Stop", "Hides numbers and ends drawing"],
];

/** Voice control's live status from the main process: microphone, Accessibility, the last command. */
function usePointerStatus(enabled: boolean): [PointerStatus | null, (s: PointerStatus) => void] {
  const [status, setStatus] = useState<PointerStatus | null>(null);
  useEffect(() => {
    void window.penguin.pointerStatus().then(setStatus);
    const off = window.penguin.onEvent((e: any) => { if (e?.kind === "pointer") setStatus(e.status); });
    return () => { off(); };
  }, []);
  // While Accessibility is off, check again every few seconds (it's switched on in System Settings).
  useEffect(() => {
    if (!enabled || status?.trusted !== false) return;
    const t = setInterval(() => void window.penguin.pointerStatus().then(setStatus), 3000);
    return () => clearInterval(t);
  }, [enabled, status?.trusted]);
  return [status, setStatus];
}

/** How to talk to it right now, in one line. */
export const howToTalk = (p: Settings["pointer"]) => p.trigger === "hold"
  ? "Hold Control+Option, say what you want, then let go."
  : p.trigger === "both"
    ? `Hold Control+Option and speak, or say “Hey ${p.wakeWords[0] ?? "Peguin"}” and a command.`
    : `Say “Hey ${p.wakeWords[0] ?? "Peguin"}” and a command.`;

/**
 * The on/off switch, what it hears, and the permissions it needs. Saves at once
 * (turning it on asks macOS for the mic). With `hero`, the switch sits in that
 * banner (art, title and text) instead of the plain row.
 */
export function VoiceControlSwitch({ settings, save, hero }: {
  settings: Settings; save: (s: Settings) => Promise<Settings>;
  hero?: { art: React.ReactNode; title: string; text: string };
}) {
  const p = settings.pointer;
  const [status, setStatus] = usePointerStatus(p.enabled);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const toggle = (on: boolean) => {
    setBusy(true); setError("");
    save({ ...settings, pointer: { ...p, enabled: on } })
      .then(() => window.penguin.pointerStatus().then(setStatus))
      .catch((e) => setError(message(e)))
      .finally(() => setBusy(false));
  };

  return (
    <>
      {hero ? (
        <section className={`cursor-hero ${p.enabled ? "on" : ""}`}>
          <div className="cursor-hero-art" aria-hidden>{hero.art}</div>
          <div className="cursor-hero-main">
            <h2>{hero.title}</h2>
            <p>{hero.text}</p>
          </div>
          <Toggle on={p.enabled} onChange={(v) => !busy && toggle(v)} label="Voice control" />
        </section>
      ) : <div className="row-card">
        <div className="row-main">
          <strong>Voice control</strong>
          <p>{p.trigger === "hold"
            ? "Hold Control+Option, say what you want, release — Peguin moves the mouse, clicks, types and draws. Only your own microphone, heard on this Mac."
            : "Say “Hey Peguin” and a command, and Peguin moves the mouse, clicks, types and draws for you. Only your own microphone, heard on this Mac."}
            {" "}Lines that aren't for Peguin are dropped and never sent anywhere{settings.voice.learn.enabled ? ", except clean clips of you that Learn my voice keeps for you to review (Settings > Voice)" : ""}. With Smart on, a follow-up{p.wake === "hey" ? " or a line starting with “Hey”" : ""} goes to your AI as words (never audio) to tell whether it's a request.</p>
        </div>
        <Toggle on={p.enabled} onChange={(v) => !busy && toggle(v)} label="Voice control" />
      </div>}
      {p.enabled && status && (
        <div className="row-card column">
          <PermissionRow ok={status.mic === "granted"} name="Microphone" detail={p.trigger === "hold" ? "To hear you while Control+Option is held." : "To hear “Hey Peguin”."} fix={status.mic === "granted" ? undefined : "Open System Settings > Privacy & Security > Microphone and switch Peguin on."} />
          <PermissionRow ok={status.trusted} name="Accessibility" detail="To click, type, read button names, and watch Control+Option."
            fix={`Click Allow, then switch on “${status.appName}” in System Settings > Privacy & Security > Accessibility.${status.appName === "Electron" ? " (This is a development build, so macOS calls Peguin “Electron”.)" : ""} If it's already on, switch it off and on again.`}
            action={status.trusted ? undefined : <button className="btn ghost" onClick={() => void window.penguin.pointerAccess().then(setStatus)}>Allow</button>} />
          {status.last && <p className="hint">Last heard: “{status.last.heard || "typed"}”. {status.last.did}.</p>}
          {status.error && <div className="notice error">{status.error}</div>}
        </div>
      )}
      {error && <div className="notice error">{error}</div>}
    </>
  );
}

/** Things to say, and a box to try one by typing. */
export function TryVoiceControl({ settings }: { settings: Settings }) {
  const [tryText, setTryText] = useState("");
  const [error, setError] = useState("");
  return (
    <>
      <details className="say-list" open>
        <summary>Things to say</summary>
        <dl>{SAY.map(([say, what]) => <div key={say}><dt>{say}</dt><dd>{what}</dd></div>)}</dl>
      </details>
      {settings.pointer.enabled && (
        <form className="inline-form" onSubmit={(e) => { e.preventDefault(); const t = tryText; setTryText(""); setError(""); window.penguin.pointerTry(t).catch((err: unknown) => setError(message(err))); }}>
          <input value={tryText} placeholder="Try a command: show numbers" onChange={(e) => setTryText(e.target.value)} />
          <button className="btn ghost" disabled={!tryText.trim()}>Try it</button>
        </form>
      )}
      {error && <div className="notice error">{error}</div>}
    </>
  );
}

/** Settings > Voice control: how to talk to it, Smart or Quick, the search address. Saves with the page. */
export function VoiceControlSettings({ s, setS, settings, goCursor }: { s: Settings; setS: (s: Settings) => void; settings: Settings; goCursor: () => void }) {
  const [words, setWords] = useState(s.pointer.wakeWords.join(", "));
  const p = s.pointer;
  const setPointer = (patch: Partial<Settings["pointer"]>) => setS({ ...s, pointer: { ...p, ...patch } });

  return (
    <>
      <div className="row-card">
        <div className="row-main">
          <strong>Voice control is {settings.pointer.enabled ? "on" : "off"}</strong>
          <p>Turn it on, try it, and choose how Peguin's cursor looks in #cursor.</p>
        </div>
        <button className="btn ghost" onClick={goCursor}>Open #cursor</button>
      </div>
      <div className="row-card column">
        <div className="row-main">
          <strong>How to talk to it</strong>
          <p>{p.trigger === "hold"
            ? "Hold Control and Option together, speak your command, then let go. Peguin runs it when you release — no wake phrase."
            : p.trigger === "both"
              ? "Hold Control+Option to speak a command, or say “Hey Peguin …” / use the shortcut below."
              : `Say “Hey ${p.wakeWords[0] ?? "Peguin"}” first, or press the shortcut below for one command without the name.`}</p>
        </div>
        <div className="segmented" role="radiogroup" aria-label="How to talk to it">
          {([["hold", "Hold Control+Option"], ["wake", "Wake word"], ["both", "Both"]] as const).map(([id, label]) => (
            <button key={id} role="radio" aria-checked={p.trigger === id} className={p.trigger === id ? "on" : ""} onClick={() => setPointer({ trigger: id })}>{label}</button>
          ))}
        </div>
      </div>
      {(p.trigger === "wake" || p.trigger === "both") && (
        <>
          <div className="field-grid">
            <label>Call it<input value={words} placeholder="Peguin" onChange={(e) => { setWords(e.target.value); setPointer({ wakeWords: listOf(e.target.value) }); }} /></label>
            <label>Shortcut for one command<input value={p.shortcut} placeholder="Control+Alt+Space" onChange={(e) => setPointer({ shortcut: e.target.value })} /></label>
          </div>
          <p className="hint">After “Hey”. Separate a few names with commas. The shortcut listens for one command without the wake phrase.</p>
          <div className="row-card column">
            <div className="row-main">
              <strong>Wake word</strong>
              <p>{p.wake === "hey"
                ? "“Hey” on its own wakes Peguin: “Hey, open Music”, or “Hey” and then what you want. People say “Hey” to each other too, so anything that isn't a clear command goes to your AI, and Peguin quietly ignores it if it isn't a request for your Mac. In meetings it still needs its name."
                : `Say “Hey ${p.wakeWords[0] ?? "Peguin"}” first, so Peguin never mistakes a “Hey” meant for someone else.`}</p>
            </div>
            <div className="segmented" role="radiogroup" aria-label="Wake word">
              {([["name", `“Hey ${p.wakeWords[0] ?? "Peguin"}”`], ["hey", "Just “Hey”"]] as const).map(([id, label]) => (
                <button key={id} role="radio" aria-checked={p.wake === id} className={p.wake === id ? "on" : ""} onClick={() => setPointer({ wake: id })}>{label}</button>
              ))}
            </div>
          </div>
          <div className="field-grid">
            <label>After waking, wait for you
              <select value={p.listenS} onChange={(e) => setPointer({ listenS: Number(e.target.value) })}>
                {[5, 10, 15, 20, 30, 45, 60].map((n) => <option key={n} value={n}>{n} seconds</option>)}
              </select>
            </label>
            <label>Keep listening for follow-ups
              <select value={p.followS} onChange={(e) => setPointer({ followS: Number(e.target.value) })}>
                {[0, 10, 20, 30, 45, 60, 90, 120].map((n) => <option key={n} value={n}>{n ? `${n} seconds` : "Off"}</option>)}
              </select>
            </label>
          </div>
          <p className="hint">While you're still talking, Peguin keeps waiting. Follow-ups like “now close it” need no wake word; anything that isn't for your Mac is ignored.</p>
        </>
      )}
      {p.trigger === "hold" && (
        <p className="hint">Hold Control+Option (same as Clicky). Speak while the keys are down; Peguin runs the command when you release. Needs Accessibility on.</p>
      )}
      <label>Search address<input value={p.searchUrl} onChange={(e) => setPointer({ searchUrl: e.target.value })} /></label>
      <p className="hint">Where “search for …” goes. %s is replaced by what you said.</p>
      <div className="row-card column">
        <div className="row-main">
          <strong>How Peguin gets things done</strong>
          <p>{p.drive === "smart"
            ? "Smart: your AI (Settings, AI) plans each step and Peguin does it where you can see, like a person. “Open Music” clicks Music in the Dock, or finds it in Applications. Peguin reads the names of buttons on screen and sends them, with what you asked, to your AI each step; never screenshots."
            : "Quick: fixed commands, done straight away. “Open Music” opens it directly. Nothing is sent to your AI except a line it couldn't understand (below)."}
            {" "}Scrolling, keys, typing and drawing are always instant.</p>
        </div>
        <div className="segmented" role="radiogroup" aria-label="How Peguin gets things done">
          {([["smart", "Smart (your AI)"], ["quick", "Quick"]] as const).map(([id, label]) => (
            <button key={id} role="radio" aria-checked={p.drive === id} className={p.drive === id ? "on" : ""} onClick={() => setPointer({ drive: id })}>{label}</button>
          ))}
        </div>
      </div>
      <div className="row-card">
        <div className="row-main"><strong>Ask my AI when it doesn't understand</strong><p>When you say “Hey Peguin” and the rest isn't a command it knows (a misheard word, a long way of asking), Peguin sends just the words of that line, never audio, to your AI (Settings, AI) to work out what you meant.</p></div>
        <Toggle on={p.askAi} onChange={(v) => setPointer({ askAi: v })} label="Ask my AI when it doesn't understand" />
      </div>
    </>
  );
}

const listOf = (v: string) => [...new Set(v.split(",").map((w) => w.trim()).filter((w) => w.length >= 2))].slice(0, 5);

function PermissionRow({ ok, name, detail, fix, action }: { ok: boolean; name: string; detail: string; fix?: string; action?: React.ReactNode }) {
  return (
    <div className="row-head">
      <div className="row-main">
        <strong><span className={`perm-dot ${ok ? "ok" : ""}`} />{name}{ok ? "" : ": not allowed yet"}</strong>
        <p>{ok ? detail : fix ?? detail}</p>
      </div>
      {action}
    </div>
  );
}

/* ---------------------------------------------------------------- Peguin's cursor */

type Cursor = Settings["pointer"]["cursor"];
/** How Peguin's own cursor looks, moves and rests. Saves as it changes, and the cursor on screen follows. */
export function CursorSettings({ settings, save }: { settings: Settings; save: (s: Settings) => Promise<Settings> }) {
  const p = settings.pointer;
  const [c, setC] = useState(p.cursor);
  useEffect(() => setC(p.cursor), [p.cursor]);
  const keep = (next: Partial<Cursor>, island = p.island) => { const v = { ...c, ...next }; setC(v); void save({ ...settings, pointer: { ...p, cursor: v, island } }); };

  return (
    <>
      <div className="row-card cursor-card">
        <div className="cursor-preview" aria-hidden>
          <span className="mini-island"><i />Peguin</span>
          <svg width="34" height="34" viewBox="0 0 34 34" style={{ transform: `scale(${c.size}) ${c.home === "island" && c.shape === "fin" ? "rotate(-28deg)" : ""}` }}>
            <CursorArt shape={c.shape} color={c.color} gaze={{ x: -0.7, y: -0.7 }} />
          </svg>
        </div>
        <div className="row-main">
          <strong>Its own cursor, not yours</strong>
          <p>Peguin moves its own cursor to what it works on; your mouse stays where you leave it.{c.shape === "penguin" ? " Its beak is the point that clicks; its eye looks where it's going, then watches your mouse." : ""}{c.home === "island" ? " Between commands it rests on the island." : c.home === "roam" ? " Between commands it wanders slowly around the middle of the screen, never near your mouse, and when the work log (Sources > On this Mac) notes the window you're in, it goes and looks at it." : ""}</p>
        </div>
      </div>
      <div className="field-grid">
        <div className="label">Shape
          <div className="segmented" role="radiogroup" aria-label="Shape">
            {([["penguin", "Penguin"], ["fin", "Fin"], ["arrow", "Arrow"]] as const).map(([id, label]) => (
              <button key={id} role="radio" aria-checked={c.shape === id} className={c.shape === id ? "on" : ""} onClick={() => keep({ shape: id })}>{label}</button>
            ))}
          </div>
        </div>
        <div className="label">{c.shape === "penguin" ? "Glow" : "Colour"}
          <div className="accents" role="radiogroup" aria-label="Cursor colour">
            {(Object.keys(COLORS) as Cursor["color"][]).map((id) => <button key={id} role="radio" aria-checked={c.color === id} aria-label={COLORS[id].label} title={COLORS[id].label}
              className={`accent-dot ${c.color === id ? "on" : ""}`} style={{ background: COLORS[id].head }} onClick={() => keep({ color: id })} />)}
          </div>
        </div>
      </div>
      <div className="field-grid">
        <label>Size <span className="value">{Math.round(c.size * 100)}%</span>
          <input type="range" min={0.7} max={1.8} step={0.1} value={c.size} onChange={(e) => setC({ ...c, size: Number(e.target.value) })} onPointerUp={() => keep({})} onKeyUp={() => keep({})} />
          <span className="range-ends"><span>Small</span><span>Large</span></span>
        </label>
        <label>Speed <span className="value">{(c.glideMs / 1000).toFixed(2)} s a move</span>
          <input type="range" min={150} max={1200} step={50} value={1350 - c.glideMs} onChange={(e) => setC({ ...c, glideMs: 1350 - Number(e.target.value) })} onPointerUp={() => keep({})} onKeyUp={() => keep({})} />
          <span className="range-ends"><span>Unhurried</span><span>Quick</span></span>
        </label>
      </div>
      <div className="field-grid">
        <div className="label">Between commands
          <div className="segmented" role="radiogroup" aria-label="Where the cursor rests">
            {([["roam", "Wanders mid-screen"], ["island", "On the island"], ["stay", "Stays put"]] as const).map(([id, label]) => (
              <button key={id} role="radio" aria-checked={c.home === id} className={c.home === id ? "on" : ""} onClick={() => keep({ home: id })}>{label}</button>
            ))}
          </div>
        </div>
        {c.home === "island" && <label>Goes home after
          <select value={c.returnAfterS} onChange={(e) => keep({ returnAfterS: Number(e.target.value) })}>
            {[3, 6, 10, 20, 60].map((n) => <option key={n} value={n}>{n} seconds</option>)}
          </select>
        </label>}
      </div>
      <div className="row-card">
        <div className="row-main"><strong>Dynamic Island</strong><p>A small pill at the top of your screen (around the notch, if your Mac has one) that shows when Peguin is listening and what it's doing.</p></div>
        <Toggle on={p.island} onChange={(v) => keep({}, v)} label="Dynamic Island" />
      </div>
    </>
  );
}

// Settings > Voice control: "Hey Peguin, ..." from the owner's own mic moves
// the mouse, clicks, types and draws. The switch saves at once (it asks macOS
// for the mic); wake words, shortcut and search address save with the page.
import { useEffect, useState } from "react";
import type { PointerStatus } from "../main/pointer/index";
import type { Settings } from "../main/settings";
import { message, Toggle } from "./ui";

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

export function VoiceControlSettings({ s, setS, settings, save }: { s: Settings; setS: (s: Settings) => void; settings: Settings; save: (s: Settings) => Promise<Settings> }) {
  const [status, setStatus] = useState<PointerStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [words, setWords] = useState(s.pointer.wakeWords.join(", "));
  const [tryText, setTryText] = useState("");
  const p = s.pointer;

  useEffect(() => {
    void window.penguin.pointerStatus().then(setStatus);
    const off = window.penguin.onEvent((e: any) => { if (e?.kind === "pointer") setStatus(e.status); });
    return () => { off(); };
  }, []);
  // While Accessibility is off, check again every few seconds (it's switched on in System Settings).
  useEffect(() => {
    if (!p.enabled || status?.trusted !== false) return;
    const t = setInterval(() => void window.penguin.pointerStatus().then(setStatus), 3000);
    return () => clearInterval(t);
  }, [p.enabled, status?.trusted]);

  const setPointer = (patch: Partial<Settings["pointer"]>) => setS({ ...s, pointer: { ...p, ...patch } });
  const toggle = (on: boolean) => {
    setBusy(true); setError("");
    save({ ...settings, pointer: { ...settings.pointer, enabled: on } })
      .then((saved) => { setS({ ...s, pointer: { ...p, enabled: saved.pointer.enabled } }); return window.penguin.pointerStatus().then(setStatus); })
      .catch((e) => setError(message(e)))
      .finally(() => setBusy(false));
  };

  return (
    <>
      <div className="row-card">
        <div className="row-main">
          <strong>“Hey Peguin”</strong>
          <p>Say “Hey Peguin” and a command, and Peguin moves the mouse, clicks, types and draws for you. Only your own microphone, heard on this Mac. Nothing is sent anywhere, and lines that don't start with “Hey Peguin” are dropped{s.voice.learn.enabled ? ", except clean clips of you that Learn my voice keeps for you to review (Settings > Voice)" : ""}.</p>
        </div>
        <Toggle on={settings.pointer.enabled} onChange={(v) => !busy && toggle(v)} label="Voice control" />
      </div>
      {settings.pointer.enabled && status && (
        <div className="row-card column">
          <PermissionRow ok={status.mic === "granted"} name="Microphone" detail="To hear “Hey Peguin”." fix={status.mic === "granted" ? undefined : "Open System Settings > Privacy & Security > Microphone and switch Peguin on."} />
          <PermissionRow ok={status.trusted} name="Accessibility" detail="To click, type and read the names of buttons."
            action={status.trusted ? undefined : <button className="btn ghost" onClick={() => void window.penguin.pointerAccess().then(setStatus)}>Allow</button>} />
          {status.last && <p className="hint">Last heard: “{status.last.heard || "typed"}”. {status.last.did}.</p>}
          {status.error && <div className="notice error">{status.error}</div>}
        </div>
      )}
      {error && <div className="notice error">{error}</div>}
      <div className="field-grid">
        <label>Call it<input value={words} placeholder="Peguin" onChange={(e) => { setWords(e.target.value); setPointer({ wakeWords: listOf(e.target.value) }); }} /></label>
        <label>Shortcut for one command<input value={p.shortcut} placeholder="Control+Alt+Space" onChange={(e) => setPointer({ shortcut: e.target.value })} /></label>
      </div>
      <p className="hint">After “Hey”. Separate a few names with commas. The shortcut listens for one command without the wake phrase.</p>
      <label>Search address<input value={p.searchUrl} onChange={(e) => setPointer({ searchUrl: e.target.value })} /></label>
      <p className="hint">Where “search for …” goes. %s is replaced by what you said.</p>
      <details className="say-list">
        <summary>Things to say</summary>
        <dl>{SAY.map(([say, what]) => <div key={say}><dt>{say}</dt><dd>{what}</dd></div>)}</dl>
      </details>
      {settings.pointer.enabled && (
        <form className="inline-form" onSubmit={(e) => { e.preventDefault(); const t = tryText; setTryText(""); window.penguin.pointerTry(t).catch((err: unknown) => setError(message(err))); }}>
          <input value={tryText} placeholder="Try a command: show numbers" onChange={(e) => setTryText(e.target.value)} />
          <button className="btn ghost" disabled={!tryText.trim()}>Try it</button>
        </form>
      )}
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

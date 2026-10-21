import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { AI_NOTICE } from "../../../src/core/brain/prompts.js";
import { listModels, PROVIDERS, type Provider } from "../ai.js";
import type { Card, Label } from "../cards.js";
import type { Line, Priority, Source } from "../merge.js";
import { DEFAULTS, forgetApiKey, loadApiKey, loadSettings, saveApiKey, saveSettings, type Settings } from "../settings.js";
import { Copilot, type Ear, type Snapshot } from "./copilot.js";

const copilot = new Copilot();
const LABELS: Record<Label, string> = { notes: "From your notes", general: "General knowledge", unknown: "Not in your notes" };
const EARS: Record<Source, string> = { captions: "Captions", audio: "Audio" };
const PRIORITIES: { id: Priority; name: string; hint: string }[] = [
  { id: "auto", name: "Auto", hint: "Captions, unless whisper clearly heard more" },
  { id: "captions", name: "Captions", hint: "Meet's captions win when both heard it" },
  { id: "audio", name: "Audio", hint: "Whisper wins when both heard it" },
];

export function App() {
  const snap = useSyncExternalStore(copilot.subscribe, () => copilot.snap);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [connected, setConnected] = useState(false);
  const [view, setView] = useState<"copilot" | "settings">("copilot");
  useEffect(() => { void (async () => {
    const s = await loadSettings();
    setSettings(s);
    const ok = !!(await loadApiKey(s.provider)) && !!s.models[s.provider] && !!s.name;
    setConnected(ok);
    if (!ok) setView("settings");
  })(); }, []);
  const update = (patch: Partial<Settings>) => setSettings((s) => { const next = { ...s!, ...patch }; void saveSettings(next); return next; });
  if (!settings) return <div className="shell" />;
  return (
    <div className="shell">
      <Header snap={snap} onSettings={() => setView(view === "settings" ? "copilot" : "settings")} settingsOpen={view === "settings"} />
      {view === "settings"
        ? <SettingsView s={settings} update={update} onDone={(ok) => { setConnected(ok); if (ok) setView("copilot"); }} />
        : <CopilotView snap={snap} s={settings} update={update} connected={connected} />}
    </div>
  );
}

function Header({ snap, onSettings, settingsOpen }: { snap: Snapshot; onSettings: () => void; settingsOpen: boolean }) {
  const live = snap.phase === "listening";
  const hearing = live && Object.values(snap.ears).some((e) => Date.now() - e.lastHeard < 1500 || e.level > 0.25);
  return (
    <header className="top">
      <div className={`orb ${live ? "live" : ""} ${hearing ? "hearing" : ""}`}><i /><i /><b /></div>
      <div className="brand">
        <strong>Peguin</strong>
        <span className="mono">{live ? <>Listening · <Clock since={snap.startedAt} /></> : snap.phase === "notice" ? "Telling the call" : snap.phase === "ended" ? "Call ended" : "Copilot"}</span>
      </div>
      <button className={`icon ${settingsOpen ? "on" : ""}`} onClick={onSettings} aria-label="Settings" title="Settings">
        <svg viewBox="0 0 20 20" width="16" height="16"><path fill="currentColor" d="M8.6 1h2.8l.4 2.3 1.5.8 2.1-1 2 2-1 2.1.7 1.5L19 9v2.8l-2.3.4-.7 1.5 1 2.1-2 2-2.1-1-1.5.7L11.4 19H8.6l-.4-2.3-1.5-.7-2.1 1-2-2 1-2.1-.7-1.5L1 11.4V8.6l2.3-.4.7-1.5-1-2.1 2-2 2.1 1 1.5-.8zM10 7a3 3 0 1 0 0 6 3 3 0 0 0 0-6z" /></svg>
      </button>
    </header>
  );
}

function Clock({ since }: { since: number }) {
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick((n) => n + 1), 1000); return () => clearInterval(t); }, []);
  const s = Math.max(0, Math.floor((Date.now() - since) / 1000));
  return <>{String(Math.floor(s / 60)).padStart(2, "0")}:{String(s % 60).padStart(2, "0")}</>;
}

// The copilot ---------------------------------------------------------------

function CopilotView({ snap, s, update, connected }: { snap: Snapshot; s: Settings; update: (p: Partial<Settings>) => void; connected: boolean }) {
  const live = snap.phase === "listening";
  return (
    <>
    <main className="main">
      {live || snap.phase === "notice" ? <Signal snap={snap} s={s} update={update} /> : null}
      {snap.phase === "notice" ? <Notice failed={snap.noticeFailed} /> : null}
      {!live && snap.phase !== "notice" ? <Launch snap={snap} connected={connected} s={s} update={update} /> : null}
      {live ? <Cards cards={snap.cards} /> : null}
      {live ? <Transcript lines={snap.lines} /> : null}
    </main>
    {live ? <Composer onStop={() => void copilot.stop()} /> : null}
    </>
  );
}

function Launch({ snap, connected, s, update }: { snap: Snapshot; connected: boolean; s: Settings; update: (p: Partial<Settings>) => void }) {
  const starting = snap.phase === "starting";
  return (
    <section className="launch">
      <div className="hud">
        <p className="kicker mono">{snap.phase === "ended" ? "Session complete" : "Private copilot · Google Meet"}</p>
        <h1>{snap.phase === "ended" ? "That's the call." : "Answers only you can see."}</h1>
        <p className="lede">Peguin listens to the others with two ears, Meet's captions and the tab's audio, and suggests what you could say. It posts a short notice in the chat first, so everyone knows AI is helping.</p>
        <div className="seg" role="radiogroup" aria-label="Meeting type">
          {(["work", "interview"] as const).map((m) => (
            <button key={m} role="radio" aria-checked={s.mode === m} className={s.mode === m ? "on" : ""} onClick={() => update({ mode: m })}>{m === "work" ? "Work meeting" : "Interview"}</button>
          ))}
        </div>
        <button className="go" disabled={!connected || starting} onClick={() => void copilot.start()}>
          <span>{starting ? "Starting…" : snap.phase === "ended" ? "Start again" : "Start listening"}</span>
        </button>
        {!connected ? <p className="warn">Connect your AI in Settings first.</p> : null}
        {snap.error ? <p className="warn">{snap.error}</p> : null}
      </div>
      {snap.phase === "ended" && snap.cards.length ? <Cards cards={snap.cards} /> : null}
    </section>
  );
}

function Notice({ failed }: { failed?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <section className="notice hud">
      <p className="kicker mono">Step 1 · Tell the call</p>
      <blockquote>{AI_NOTICE}</blockquote>
      {failed ? (
        <>
          <p className="warn">{failed}</p>
          <p className="muted small">You can paste it in the chat yourself; Peguin starts once it sees it there.</p>
          <div className="row">
            <button className="ghost" onClick={() => { void navigator.clipboard.writeText(AI_NOTICE); setCopied(true); }}>{copied ? "Copied" : "Copy notice"}</button>
            <button className="primary" onClick={() => void copilot.notice()}>Check again</button>
            <button className="ghost" onClick={() => void copilot.stop()}>Cancel</button>
          </div>
        </>
      ) : <p className="muted small"><span className="dots"><i /><i /><i /></span> Posting in the meeting chat…</p>}
    </section>
  );
}

function Signal({ snap, s, update }: { snap: Snapshot; s: Settings; update: (p: Partial<Settings>) => void }) {
  const setPriority = (priority: Priority) => { update({ hearing: { ...s.hearing, priority } }); copilot.setPriority(priority); };
  const both = snap.ears.captions.state === "live" && snap.ears.audio.state === "live";
  const agreed = useMemo(() => { if (!both) return null; const last = snap.lines.filter((l) => !l.own).slice(-20); return last.length ? Math.round((100 * last.filter((l) => l.heardBy.length > 1).length) / last.length) : null; }, [snap.lines, both]);
  return (
    <section className="signal">
      {(Object.keys(EARS) as Source[]).map((k) => <EarRow key={k} source={k} ear={snap.ears[k]} />)}
      <div className="merge">
        <span className="mono tag">Merge</span>
        <div className="seg tiny">
          {PRIORITIES.map((p) => <button key={p.id} title={p.hint} className={s.hearing.priority === p.id ? "on" : ""} onClick={() => setPriority(p.id)}>{p.name}</button>)}
        </div>
        {agreed !== null ? <span className="mono agree" title="Of the last lines, how many both ears heard the same way">{agreed}% agree</span> : null}
      </div>
    </section>
  );
}

function EarRow({ source, ear }: { source: Source; ear: Ear }) {
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick((n) => n + 1), 300); return () => clearInterval(t); }, []);
  const fresh = Date.now() - ear.lastHeard < 1200;
  const level = source === "audio" ? ear.level : fresh ? 0.7 : 0.05;
  const status = ear.state === "loading" ? (ear.progress != null ? `Loading ${ear.progress}%` : "Starting") : ear.state === "live" ? "Live" : ear.state === "error" ? "Down" : "Off";
  return (
    <div className={`ear ${source} ${ear.state}`} title={ear.detail}>
      <span className="dot" />
      <span className="mono tag">{EARS[source]}</span>
      <span className="meter">{Array.from({ length: 14 }, (_, i) => <i key={i} style={{ transform: `scaleY(${Math.max(0.12, Math.min(1, level * 1.6 - Math.abs(i - 6.5) / 14 + (fresh ? Math.sin(Date.now() / 120 + i) * 0.15 : 0)))})` }} />)}</span>
      <span className="mono state">{status}</span>
      {ear.detail && ear.state !== "live" ? <span className="detail">{ear.detail}</span> : null}
    </div>
  );
}

function Cards({ cards }: { cards: Card[] }) {
  if (!cards.length) return (
    <section className="empty">
      <div className="radar"><i /><i /><i /></div>
      <p>Waiting for a question.</p>
      <p className="muted small">When someone asks you something, the answer appears here.</p>
    </section>
  );
  return <section className="cards">{cards.map((c, i) => <CardView key={c.id} c={c} newest={i === 0} />)}</section>;
}

function CardView({ c, newest }: { c: Card; newest: boolean }) {
  const [copied, setCopied] = useState(false);
  const text = c.web?.state === "done" && c.web.answer ? c.web.answer : c.answer;
  return (
    <article className={`card ${c.state} ${newest ? "newest" : ""} ${c.label ?? ""}`}>
      <header>
        <span className="mono who">{c.speaker ?? "Someone"}</span>
        {c.confirmed ? <span className="mono both" title="Captions and audio heard this the same way">◎ Both ears</span> : null}
        <span className="mono when"><Ago at={c.at} /></span>
      </header>
      <p className="q">{c.question}</p>
      {c.state === "waiting" ? <p className="muted small mono">Queued</p> : null}
      {c.state === "skipped" ? <p className="muted small mono">Skipped, newer questions came in</p> : null}
      {c.state === "failed" ? <p className="warn small">{c.error}</p> : null}
      {c.state === "thinking" && !c.answer ? <p className="thinking"><span className="dots"><i /><i /><i /></span></p> : null}
      {c.answer ? (
        <div className="a">
          {c.label ? <span className={`chip mono ${c.label}`}>{LABELS[c.label]}</span> : null}
          <p className={c.state === "thinking" ? "streaming" : ""}>{text}</p>
          {c.web?.state === "checking" ? <p className="muted small mono">Checking online…</p> : null}
          {c.web?.state === "done" ? <p className="muted small mono">Checked online{c.web.source ? ` · ${c.web.source}` : ""}</p> : null}
          {c.state === "answered" ? <button className="ghost small" onClick={() => { void navigator.clipboard.writeText(text); setCopied(true); }}>{copied ? "Copied" : "Copy"}</button> : null}
        </div>
      ) : null}
    </article>
  );
}

function Ago({ at }: { at: number }) {
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick((n) => n + 1), 5000); return () => clearInterval(t); }, []);
  const s = Math.floor((Date.now() - at) / 1000);
  return <>{s < 10 ? "now" : s < 60 ? `${s}s` : `${Math.floor(s / 60)}m`}</>;
}

function Transcript({ lines }: { lines: Line[] }) {
  const [open, setOpen] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { if (open) end.current?.scrollIntoView({ block: "end" }); }, [lines.length, open]);
  const last = lines[lines.length - 1];
  return (
    <section className={`transcript ${open ? "open" : ""}`}>
      <button className="bar" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="mono tag">Transcript · {lines.length}</span>
        {!open && last ? <span className="ticker">{last.own ? "You" : last.speaker ?? "Someone"}: {last.text}</span> : null}
        <span className="mono caret">{open ? "▾" : "▴"}</span>
      </button>
      {open ? (
        <div className="lines">
          {lines.map((l) => (
            <div key={l.id} className={`line ${l.own ? "own" : ""}`}>
              <span className="src" title={`Heard by ${l.heardBy.join(" and ")}; kept ${l.via}`}>{l.heardBy.map((h) => <i key={h} className={h} />)}</span>
              <b>{l.own ? "You" : l.speaker ?? "Someone"}</b> {l.text}
            </div>
          ))}
          <div ref={end} />
        </div>
      ) : null}
    </section>
  );
}

function Composer({ onStop }: { onStop: () => void }) {
  const [q, setQ] = useState("");
  return (
    <form className="composer" onSubmit={(e) => { e.preventDefault(); if (q.trim()) { copilot.askTyped(q.trim()); setQ(""); } }}>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Ask Peguin something…" aria-label="Ask Peguin" />
      <button type="button" className="stop" onClick={onStop} title="Stop listening">■</button>
    </form>
  );
}

// Settings ------------------------------------------------------------------

function SettingsView({ s, update, onDone }: { s: Settings; update: (p: Partial<Settings>) => void; onDone: (connected: boolean) => void }) {
  const [key, setKey] = useState("");
  const [hasKey, setHasKey] = useState(false);
  const [models, setModels] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { void loadApiKey(s.provider).then((k) => { setHasKey(!!k); setModels(s.models[s.provider] ? [s.models[s.provider]!] : []); }); }, [s.provider]);

  async function connect() {
    setBusy(true); setError("");
    try {
      const list = await listModels(s.provider, key.trim());
      await saveApiKey(s.provider, key.trim());
      setModels(list); setHasKey(true); setKey("");
      update({ models: { ...s.models, [s.provider]: s.models[s.provider] && list.includes(s.models[s.provider]!) ? s.models[s.provider] : list[0] } });
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  }
  async function refresh() {
    const k = await loadApiKey(s.provider);
    if (k) { try { setModels(await listModels(s.provider, k)); } catch (e) { setError(e instanceof Error ? e.message : String(e)); } }
  }
  const ready = hasKey && !!s.models[s.provider] && !!s.name.trim();

  return (
    <main className="main settings">
      <section className="hud">
        <p className="kicker mono">01 · You</p>
        <label className="field"><span>Your name, as it shows in calls</span>
          <input value={s.name} onChange={(e) => update({ name: e.target.value })} placeholder="Mujeeb Adebowale" /></label>
      </section>

      <section className="hud">
        <p className="kicker mono">02 · Your AI</p>
        <div className="seg">
          {(Object.keys(PROVIDERS) as Provider[]).map((p) => <button key={p} className={s.provider === p ? "on" : ""} onClick={() => update({ provider: p })}>{PROVIDERS[p].name}</button>)}
        </div>
        {hasKey ? (
          <div className="row">
            <span className="mono ok">● Key saved, sealed in this browser</span>
            <button className="ghost small" onClick={() => void forgetApiKey(s.provider).then(() => { setHasKey(false); setModels([]); })}>Remove</button>
          </div>
        ) : (
          <div className="row">
            <input type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder={PROVIDERS[s.provider].keyHint} aria-label={`${PROVIDERS[s.provider].name} API key`} />
            <button className="primary" disabled={!key.trim() || busy} onClick={() => void connect()}>{busy ? "Checking…" : "Connect"}</button>
          </div>
        )}
        {!hasKey ? <p className="muted small">Calls go from this browser straight to {PROVIDERS[s.provider].name}, billed to your key. <a href={PROVIDERS[s.provider].keyUrl} target="_blank" rel="noreferrer">Get a key</a></p> : null}
        {hasKey ? (
          <label className="field"><span>Model</span>
            <select value={s.models[s.provider] ?? ""} onFocus={() => { if (models.length < 2) void refresh(); }} onChange={(e) => update({ models: { ...s.models, [s.provider]: e.target.value } })}>
              {models.map((m) => <option key={m} value={m}>{m}</option>)}
            </select></label>
        ) : null}
        {s.provider === "anthropic" && hasKey ? (
          <label className="toggle"><input type="checkbox" checked={s.web} onChange={(e) => update({ web: e.target.checked })} /><span>Check general answers online <em className="muted">(slower second pass)</em></span></label>
        ) : null}
        {error ? <p className="warn small">{error}</p> : null}
      </section>

      <section className="hud">
        <p className="kicker mono">03 · Your notes</p>
        <label className="field"><span>What Peguin may say about your work, one fact per line. Anything not here, it won't make up.</span>
          <textarea rows={6} value={s.notes} onChange={(e) => update({ notes: e.target.value })} placeholder={"Shipped the payment retries on Tuesday\nNext: the Paystack webhook migration\nBlocked on the staging database"} /></label>
      </section>

      <section className="hud">
        <p className="kicker mono">04 · Hearing</p>
        <label className="toggle"><input type="checkbox" checked={s.hearing.captions} onChange={(e) => update({ hearing: { ...s.hearing, captions: e.target.checked } })} /><span>Meet captions <em className="muted">fast, with names</em></span></label>
        <label className="toggle"><input type="checkbox" checked={s.hearing.audio} onChange={(e) => update({ hearing: { ...s.hearing, audio: e.target.checked } })} /><span>Tab audio with whisper <em className="muted">in your browser, nothing uploaded</em></span></label>
        {s.hearing.audio ? (
          <div className="seg">
            <button className={s.hearing.whisper === "base" ? "on" : ""} onClick={() => update({ hearing: { ...s.hearing, whisper: "base" } })}>Fast · 80 MB</button>
            <button className={s.hearing.whisper === "turbo" ? "on" : ""} onClick={() => update({ hearing: { ...s.hearing, whisper: "turbo" } })}>Accurate · GPU · 600 MB</button>
          </div>
        ) : null}
        {!s.hearing.captions && !s.hearing.audio ? <p className="warn small">Turn on at least one, or Peguin can't hear the call.</p> : null}
      </section>

      <button className="go" disabled={!ready || (!s.hearing.captions && !s.hearing.audio)} onClick={() => onDone(true)}><span>{ready ? "Done" : "Add your name and AI to continue"}</span></button>
      <button className="ghost small reset" onClick={() => { update({ ...DEFAULTS, name: s.name, notes: s.notes, models: s.models, provider: s.provider }); }}>Reset hearing and modes</button>
    </main>
  );
}

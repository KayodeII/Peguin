// Settings > Voice: the standard voice, or the owner's own (opt-in). Record a
// sample live (with the consent sentence), download the model, teach it how
// words sound, tune pace and expressiveness, try it, switch it on. Every value
// is the owner's; nothing about how they sound is built in. All on this Mac.
import { useCallback, useEffect, useRef, useState } from "react";
import type { Settings } from "../main/settings";
import { message, Toggle } from "./ui";

type VoiceStatus = {
  mode: Settings["voice"]["mode"];
  modelReady: boolean;
  sample: { recordedAt: string; seconds: number } | null;
  modelBytes: number;
  download: { progress: number; error?: string } | null;
  consent: string;
  /** The start of the owner's latest update, to read when recording (null if none yet). */
  script: string | null;
};

const RATE = 24000;
const MAX_S = 20;
const MIN_S = 8;

const gb = (bytes: number) => `${(bytes / 1e9).toFixed(1)} GB`;

/** Plays WAV bytes with Web Audio (an <audio> element with a blob: URL is blocked by the window's CSP). */
async function playWav(data: Uint8Array) {
  const ctx = new AudioContext();
  const bytes = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
  const src = ctx.createBufferSource();
  src.buffer = await ctx.decodeAudioData(bytes);
  src.connect(ctx.destination);
  src.onended = () => void ctx.close();
  src.start();
}

export function VoiceSettings({ settings, draft, setDraft, save }: {
  settings: Settings;
  draft: Settings;
  setDraft: (s: Settings) => void;
  save: (s: Settings) => Promise<Settings>;
}) {
  const [status, setStatus] = useState<VoiceStatus | null>(null);
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const refresh = useCallback(() => { void window.penguin.voiceStatus().then(setStatus); }, []);
  useEffect(() => {
    refresh();
    return window.penguin.onEvent((raw) => {
      const e = raw as { kind: string; progress?: number; error?: string };
      if (e.kind !== "voice") return;
      setStatus((s) => s && { ...s, download: e.progress === 1 && !e.error ? null : { progress: e.progress ?? 0, error: e.error }, modelReady: e.progress === 1 && !e.error ? true : s.modelReady });
    });
  }, [refresh]);

  if (!status) return null;
  const ready = status.modelReady && !!status.sample;
  const run = (label: string, fn: () => Promise<unknown>) => {
    setBusy(label); setError("");
    fn().catch((e) => setError(message(e))).finally(() => { setBusy(""); refresh(); });
  };
  const setMode = (mine: boolean) => run("mode", () => save({ ...settings, voice: { ...settings.voice, mode: mine ? "mine" : "standard" } }));

  return (
    <>
      <div className="row-card">
        <div className="row-main">
          <strong>Speak in your own voice</strong>
          <p>{settings.voice.mode === "mine"
            ? "On. Peguin still says it's your AI assistant, and adds that it's speaking in your voice."
            : ready ? "Ready to switch on." : "Record a sample and download the voice model to switch this on."}</p>
        </div>
        <Toggle on={settings.voice.mode === "mine"} onChange={(v) => (ready || !v) && setMode(v)} label="Speak in your own voice" />
      </div>

      <div className="row-card">
        <div className="row-main">
          <strong>Your voice sample</strong>
          <p>{status.sample
            ? `${status.sample.seconds} seconds, recorded ${new Date(status.sample.recordedAt).toLocaleDateString()}. Encrypted on this Mac.`
            : "About 20 seconds, read aloud. You can only record your own voice here, not upload a file."}</p>
        </div>
        {status.sample && <button className="btn link" disabled={!!busy} onClick={() => run("delete", () => window.penguin.voiceDelete())}>Delete</button>}
        <button className="btn ghost" disabled={!!busy} onClick={() => setRecording(true)}>{status.sample ? "Record again" : "Record"}</button>
      </div>

      <div className="row-card">
        <div className="row-main">
          <strong>Voice model</strong>
          {status.download && !status.download.error ? (
            <>
              <p>Downloading {Math.round(status.download.progress * 100)}% of {gb(status.modelBytes)}</p>
              <div className="progress"><i style={{ width: `${Math.round(status.download.progress * 100)}%` }} /></div>
            </>
          ) : (
            <p>{status.modelReady ? "Downloaded. It runs on this Mac; nothing is sent anywhere." : `${gb(status.modelBytes)}, downloaded once. It runs on this Mac.`}</p>
          )}
          {status.download?.error && <p className="warn">{status.download.error}</p>}
        </div>
        {status.modelReady
          ? <button className="btn link" disabled={!!busy} onClick={() => run("remove", () => window.penguin.voiceDeleteModel())}>Remove</button>
          : <button className="btn ghost" disabled={!!busy || (!!status.download && !status.download.error)} onClick={() => run("download", () => window.penguin.voiceDownload())}>Download</button>}
      </div>

      <Pronunciations draft={draft} setDraft={setDraft} canHear={ready && !busy} hear={(w) => run(`word:${w}`, async () => playWav(await window.penguin.voiceSayWord(w)))} busy={busy} />

      <div className="field-grid">
        <label>Pause between sentences <span className="value">{draft.voice.pause.toFixed(2)} s</span>
          <input type="range" min={0.1} max={1} step={0.02} value={draft.voice.pause}
            onChange={(e) => setDraft({ ...draft, voice: { ...draft.voice, pause: Number(e.target.value) } })} />
          <span className="range-ends"><span>Quick</span><span>Unhurried</span></span>
        </label>
        <label>Expressiveness <span className="value">{draft.voice.expressiveness.toFixed(2)}</span>
          <input type="range" min={0.3} max={0.9} step={0.05} value={draft.voice.expressiveness}
            onChange={(e) => setDraft({ ...draft, voice: { ...draft.voice, expressiveness: Number(e.target.value) } })} />
          <span className="range-ends"><span>Steady</span><span>Lively</span></span>
        </label>
      </div>
      <label>Checks before each meeting
        <select value={draft.voice.attempts} onChange={(e) => setDraft({ ...draft, voice: { ...draft.voice, attempts: Number(e.target.value) } })}>
          <option value={1}>Don't check (fastest)</option>
          {[2, 3, 4, 5].map((n) => <option key={n} value={n}>Redo a sentence up to {n - 1} {n === 2 ? "time" : "times"} if a word comes out wrong</option>)}
        </select>
      </label>

      <div className="voice-actions">
        <button className="btn ghost" disabled={!ready || !!busy} onClick={() => run("preview", async () => playWav(await window.penguin.voicePreview()))}>
          {busy === "preview" ? "Generating" : "Hear a sample"}
        </button>
        {JSON.stringify(draft.voice) !== JSON.stringify(settings.voice) && <span className="hint">Save changes to hear them.</span>}
      </div>
      {error && <div className="notice error">{error}</div>}

      {recording && <Recorder consent={status.consent} script={status.script} onClose={() => setRecording(false)} onSaved={() => { setRecording(false); refresh(); }} />}
    </>
  );
}

/* ---------------------------------------------------------------- pronunciations */

function Pronunciations({ draft, setDraft, canHear, hear, busy }: {
  draft: Settings; setDraft: (s: Settings) => void; canHear: boolean; hear: (word: string) => void; busy: string;
}) {
  const list = draft.voice.pronunciations;
  const first = draft.displayName.trim().split(/\s+/)[0] ?? "";
  const set = (next: Settings["voice"]["pronunciations"]) => setDraft({ ...draft, voice: { ...draft.voice, pronunciations: next } });
  const update = (i: number, p: Partial<{ word: string; sayAs: string }>) => set(list.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const saved = (i: number) => !!list[i]?.word.trim() && !!list[i]?.sayAs.trim();
  return (
    <div className="pron">
      <div className="pron-head">
        <strong>Pronunciations</strong>
        <p>Teach it names and words it says wrong: yours, your team's, your product's. Spell each the way it sounds.</p>
      </div>
      {list.map((p, i) => (
        <div key={i} className="pron-row">
          <input value={p.word} maxLength={40} placeholder={i === 0 && first ? first : "Word"} aria-label="Word" onChange={(e) => update(i, { word: e.target.value })} />
          <span className="pron-arrow">sounds like</span>
          <input value={p.sayAs} maxLength={60} placeholder="How it sounds" aria-label="How it sounds" onChange={(e) => update(i, { sayAs: e.target.value })} />
          <button className="btn link" disabled={!canHear || !saved(i)} title="Save changes first to hear a new spelling" onClick={() => hear(p.word)}>
            {busy === `word:${p.word}` ? "Generating" : "Hear it"}
          </button>
          <button className="btn link" aria-label={`Remove ${p.word || "word"}`} onClick={() => set(list.filter((_, j) => j !== i))}>Remove</button>
        </div>
      ))}
      {list.length < 40 && (
        <button className="btn ghost" onClick={() => set([...list, { word: list.length === 0 ? first : "", sayAs: "" }])}>Add a word</button>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- recording */

type Take = { samples: Float32Array; seconds: number };

function Recorder({ consent, script, onClose, onSaved }: { consent: string; script: string | null; onClose: () => void; onSaved: () => void }) {
  const [phase, setPhase] = useState<"ready" | "countdown" | "recording" | "review">("ready");
  const [count, setCount] = useState(3);
  const [elapsed, setElapsed] = useState(0);
  const [levelPct, setLevelPct] = useState(0);
  const [take, setTake] = useState<Take | null>(null);
  const [error, setError] = useState("");
  const rec = useRef<{ stop: () => Take } | null>(null);

  useEffect(() => () => { rec.current?.stop(); }, []);

  const finish = useCallback(() => {
    if (!rec.current) return;
    const t = rec.current.stop();
    rec.current = null;
    setTake(t); setPhase("review");
  }, []);

  async function start() {
    setError("");
    try {
      if (!(await window.penguin.voiceMic())) throw new Error("Peguin can't use the microphone. Allow it in System Settings, Privacy & Security, Microphone.");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: false, noiseSuppression: true, autoGainControl: false } });
      setPhase("countdown");
      for (let n = 3; n > 0; n--) { setCount(n); await new Promise((r) => setTimeout(r, 1000)); }
      const ctx = new AudioContext({ sampleRate: RATE });
      const source = ctx.createMediaStreamSource(stream);
      const proc = ctx.createScriptProcessor(4096, 1, 1);
      const chunks: Float32Array[] = [];
      const began = performance.now();
      proc.onaudioprocess = (e) => {
        const ch = e.inputBuffer.getChannelData(0);
        chunks.push(new Float32Array(ch));
        let sum = 0;
        for (const v of ch) sum += v * v;
        setLevelPct(Math.min(100, Math.sqrt(sum / ch.length) * 400));
        const s = (performance.now() - began) / 1000;
        setElapsed(s);
        if (s >= MAX_S) finish();
      };
      source.connect(proc); proc.connect(ctx.destination);
      rec.current = {
        stop: () => {
          proc.disconnect(); source.disconnect();
          stream.getTracks().forEach((t) => t.stop());
          void ctx.close();
          const total = chunks.reduce((n, c) => n + c.length, 0);
          const samples = new Float32Array(total);
          let at = 0;
          for (const c of chunks) { samples.set(c, at); at += c.length; }
          return { samples, seconds: total / RATE };
        },
      };
      setPhase("recording");
    } catch (e) { setError(message(e)); setPhase("ready"); }
  }

  function listen() {
    if (!take) return;
    const ctx = new AudioContext({ sampleRate: RATE });
    const buf = ctx.createBuffer(1, take.samples.length, RATE);
    buf.copyToChannel(take.samples as Float32Array<ArrayBuffer>, 0);
    const src = ctx.createBufferSource();
    src.buffer = buf; src.connect(ctx.destination); src.onended = () => void ctx.close();
    src.start();
  }

  async function use() {
    if (!take) return;
    setError("");
    try { await window.penguin.voiceSave(take.samples.buffer as ArrayBuffer); onSaved(); }
    catch (e) { setError(message(e)); }
  }

  return (
    <div className="modal-backdrop">
      <div className="modal voice-modal" role="dialog" aria-labelledby="rec-title">
        <h2 id="rec-title">Record your voice</h2>
        <p className="modal-sub">Start with the sentence below, then keep talking at your normal standup pace. A quiet room helps.</p>
        <blockquote className="script">
          <p className="consent">{consent}</p>
          {script
            ? <p>{script}</p>
            : <p className="free">Then talk for about 15 seconds about what you worked on yesterday and what's next, the way you would in standup.</p>}
        </blockquote>

        {phase === "ready" && <button className="btn primary wide" onClick={() => void start()}>Start recording</button>}
        {phase === "countdown" && <p className="rec-count">Starting in {count}</p>}
        {phase === "recording" && (
          <>
            <div className="rec-row">
              <span className="rec-dot" />
              <span>{Math.floor(elapsed)}s of {MAX_S}s</span>
              <div className="meter"><i style={{ width: `${levelPct}%` }} /></div>
            </div>
            <button className="btn primary wide" disabled={elapsed < MIN_S} onClick={finish}>{elapsed < MIN_S ? `Keep going (${Math.ceil(MIN_S - elapsed)}s)` : "Stop"}</button>
          </>
        )}
        {phase === "review" && take && (
          <>
            <p className="hint center">{take.seconds.toFixed(0)} seconds recorded.</p>
            <div className="voice-actions center">
              <button className="btn ghost" onClick={listen}>Listen back</button>
              <button className="btn ghost" onClick={() => { setTake(null); setElapsed(0); setPhase("ready"); }}>Record again</button>
              <button className="btn primary" onClick={() => void use()}>Use this recording</button>
            </div>
          </>
        )}
        {error && <div className="notice error">{error}</div>}
        <button className="btn link wide" onClick={onClose}>Cancel</button>
        <p className="hint center">Saved encrypted on this Mac. Delete it any time in Settings.</p>
      </div>
    </div>
  );
}

// Settings > Voice: the standard voice, or the owner's own (opt-in). Three
// steps: record a sample live (with the consent sentence), download the model,
// try it, then switch it on. Everything stays on this Mac.
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
};

const RATE = 24000;
const MAX_S = 20;
const MIN_S = 8;
const PASSAGE = [
  "Yesterday I finished the billing page and reviewed two pull requests.",
  "Today I'm on the onboarding emails. No blockers, and I'll share a demo on Friday.",
];

const gb = (bytes: number) => `${(bytes / 1e9).toFixed(1)} GB`;

function playWav(data: Uint8Array) {
  const url = URL.createObjectURL(new Blob([data as BlobPart], { type: "audio/wav" }));
  const audio = new Audio(url);
  audio.onended = () => URL.revokeObjectURL(url);
  return audio.play();
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

      <label>How your first name sounds
        <input value={draft.voice.namePronounced} maxLength={40} placeholder="Spell it the way it sounds, like Moo-jeeb"
          onChange={(e) => setDraft({ ...draft, voice: { ...draft.voice, namePronounced: e.target.value } })} />
      </label>
      <div className="voice-actions">
        <button className="btn ghost" disabled={!ready || !!busy} onClick={() => run("preview", async () => playWav(await window.penguin.voicePreview()))}>
          {busy === "preview" ? "Generating" : "Hear a sample"}
        </button>
        {draft.voice.namePronounced !== settings.voice.namePronounced && <span className="hint">Save changes to hear the new pronunciation.</span>}
      </div>
      {error && <div className="notice error">{error}</div>}

      {recording && <Recorder consent={status.consent} onClose={() => setRecording(false)} onSaved={() => { setRecording(false); refresh(); }} />}
    </>
  );
}

/* ---------------------------------------------------------------- recording */

type Take = { samples: Float32Array; seconds: number };

function Recorder({ consent, onClose, onSaved }: { consent: string; onClose: () => void; onSaved: () => void }) {
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
        <p className="modal-sub">Read this aloud at your normal standup pace, with natural pauses. A quiet room helps.</p>
        <blockquote className="script">
          <p className="consent">{consent}</p>
          {PASSAGE.map((p) => <p key={p}>{p}</p>)}
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

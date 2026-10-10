// Settings: which of the owner's own AIs Peguin uses, their xAI key, and the
// standard voice (the Mac's, or a Grok voice with that key).
import { useEffect, useState } from "react";
import type { Settings } from "../main/settings";
import { message } from "./ui";
import { playWav } from "./voice";

type Xai = { connected: boolean; models: string[] };

const AI_HINTS: Record<Settings["ai"], string> = {
  claude: "Your own Claude Code sign-in on this Mac (install Claude Code and sign in). Peguin doesn't pay for or see it.",
  codex: "Your own ChatGPT sign-in through the Codex CLI (install it and run codex login). Slower: about ten seconds a copilot suggestion.",
  grok: "Your own xAI API key. xAI bills your account for what Peguin asks.",
};

/** The owner's xAI key: connected, or a field to paste one. */
function XaiKey({ xai, setXai }: { xai: Xai; setXai: (x: Xai) => void }) {
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const run = (fn: () => Promise<Xai>) => { setBusy(true); setError(""); fn().then(setXai).catch((e) => setError(message(e))).finally(() => setBusy(false)); };
  return (
    <div className="row-card column">
      <div className="row-head">
        <div className="row-main">
          <strong>xAI</strong>
          <p>{xai.connected ? "Connected with your API key, kept encrypted in the Keychain on this Mac and only sent to xAI." : "Paste an API key from console.x.ai. It's kept encrypted on this Mac."}</p>
        </div>
        {xai.connected && <button className="btn link" disabled={busy} onClick={() => run(() => window.penguin.xaiDisconnect())}>Disconnect</button>}
      </div>
      {!xai.connected && (
        <form className="inline-form" onSubmit={(e) => { e.preventDefault(); const k = key; setKey(""); run(() => window.penguin.xaiConnect(k)); }}>
          <input value={key} type="password" placeholder="xAI API key" autoComplete="off" onChange={(e) => setKey(e.target.value)} />
          <button className="btn ghost" disabled={!key.trim() || busy}>{busy ? "Checking" : "Connect"}</button>
        </form>
      )}
      {error && <div className="notice error">{error}</div>}
    </div>
  );
}

export function useXai(): [Xai, (x: Xai) => void] {
  const [xai, setXai] = useState<Xai>({ connected: false, models: [] });
  useEffect(() => { void window.penguin.xaiStatus().then(setXai); }, []);
  return [xai, setXai];
}

export function AiSettings({ s, setS, xai, setXai }: { s: Settings; setS: (s: Settings) => void; xai: Xai; setXai: (x: Xai) => void }) {
  return (
    <>
      <label>Your AI
        <select value={s.ai} onChange={(e) => setS({ ...s, ai: e.target.value as Settings["ai"] })}>
          <option value="claude">Claude (your Claude Code sign-in)</option>
          <option value="codex">Codex (your ChatGPT sign-in)</option>
          <option value="grok">Grok (your xAI key)</option>
        </select>
      </label>
      <p className="hint">Writes your update, answers follow-ups, suggests copilot answers and summarises recaps. {AI_HINTS[s.ai]}</p>
      {s.ai === "grok" && <XaiKey xai={xai} setXai={setXai} />}
      {s.ai === "grok" && xai.connected && (
        <label>Grok model
          <select value={s.grokModel && xai.models.includes(s.grokModel) ? s.grokModel : xai.models[0]} onChange={(e) => setS({ ...s, grokModel: e.target.value })}>
            {xai.models.map((m) => <option key={m}>{m}</option>)}
          </select>
        </label>
      )}
    </>
  );
}

export function StandardVoice({ s, setS, saved, xai, setXai }: { s: Settings; setS: (s: Settings) => void; saved: Settings; xai: Xai; setXai: (x: Xai) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const grok = s.voice.standard === "grok";
  const dirty = s.voice.standard !== saved.voice.standard || s.voice.grokVoice !== saved.voice.grokVoice;
  const hear = () => { setBusy(true); setError(""); window.penguin.voiceStandardSample().then(playWav).catch((e: unknown) => setError(message(e))).finally(() => setBusy(false)); };
  return (
    <>
      <div className="row-card column">
        <div className="row-main">
          <strong>Standard voice</strong>
          <p>{grok
            ? "Grok: a natural xAI voice. Every line Peguin says is sent to xAI with your key. If xAI fails mid-meeting, Peguin switches to the Mac voice."
            : "The Mac's built-in voice: private, nothing is sent anywhere."} Used whenever Peguin isn't speaking in your own voice.</p>
        </div>
        <div className="segmented" role="radiogroup" aria-label="Standard voice">
          {([["mac", "Mac voice"], ["grok", "Grok voice"]] as const).map(([id, label]) => (
            <button key={id} role="radio" aria-checked={s.voice.standard === id} className={s.voice.standard === id ? "on" : ""}
              onClick={() => setS({ ...s, voice: { ...s.voice, standard: id } })}>{label}</button>
          ))}
        </div>
        {grok && xai.connected && (
          <div className="field-grid">
            <label>xAI voice
              <input value={s.voice.grokVoice} onChange={(e) => setS({ ...s, voice: { ...s.voice, grokVoice: e.target.value } })} placeholder="eve" />
            </label>
            <div className="label">&nbsp;
              <button className="btn ghost" disabled={busy || dirty} onClick={hear}>{busy ? "Generating" : "Hear it"}</button>
            </div>
          </div>
        )}
        {grok && xai.connected && dirty && <p className="hint">Save changes to hear them.</p>}
        {error && <div className="notice error">{error}</div>}
      </div>
      {grok && !xai.connected && <XaiKey xai={xai} setXai={setXai} />}
    </>
  );
}

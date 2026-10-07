import { useEffect, useRef, useState } from "react";
import type { DraftState, LiveState } from "./App";
import type { Draft } from "../main/brain";
import { botName } from "../main/meeting/platform";
import type { Settings } from "../main/settings";
import { Avatar, dayTime, Icon, message, Toggle, Typing } from "./ui";

const SOURCE_INFO = {
  git: { name: "Git commits", desc: "Your commits across the repos on this computer. Found automatically." },
  github: { name: "GitHub", desc: "PRs you opened, merged or reviewed, through the GitHub CLI's login." },
  claude_code: { name: "Claude Code sessions", desc: "What you asked Claude Code to work on. Only your prompts, read on this computer, never tool output or code." },
} as const;
type SourceKey = keyof typeof SOURCE_INFO;
const DAYS = ["S", "M", "T", "W", "T", "F", "S"];

function ChannelHeader({ name, topic, children }: { name: string; topic?: string; children?: React.ReactNode }) {
  return (
    <header className="channel-head">
      <Icon name="hash" size={22} /><h1>{name}</h1>
      {topic && <><span className="divider" /><p>{topic}</p></>}
      <div className="head-actions">{children}</div>
    </header>
  );
}

/* ---------------------------------------------------------------- Today */

export function TodayView({ settings, draft, prepare, goSources }: { settings: Settings; draft: DraftState; prepare: () => void; goSources: () => void }) {
  const d = draft.draft;
  const name = botName(settings.displayName, "google_meet");
  return (
    <>
      <ChannelHeader name="today" topic="What Penguin will say when it's your turn">
        <button className="btn ghost" disabled={draft.preparing} onClick={prepare}><Icon name="refresh" size={16} />{d ? "Refresh" : "Prepare"}</button>
      </ChannelHeader>
      <div className="scroll">
        {!d && !draft.preparing && (
          <div className="empty">
            <div className="empty-art">🐧</div>
            <h2>No update yet</h2>
            <p>Penguin reads your work since the last standup and writes a 30–45 second update. You don't type anything.</p>
            <button className="btn primary" onClick={prepare}>Prepare today's update</button>
          </div>
        )}
        {d && (
          <article className="message">
            <Avatar name={name} bot />
            <div className="msg-body">
              <div className="msg-head"><strong>{name}</strong><span className="tag">AI</span><time>Prepared {dayTime(d.generatedAt)}</time></div>
              <p className="msg-text">{d.script}</p>
              <div className="embed">
                <div className="embed-title">What Penguin knows · answers questions from these only</div>
                <ul>{d.facts.map((f, i) => <li key={i}>{f}</li>)}</ul>
              </div>
              <div className="chips">
                {d.reports.map((r) => (
                  <button key={r.id} className={`chip ${r.ok ? "" : "warn"}`} onClick={goSources} title={r.hint ?? r.summary}>
                    {SOURCE_INFO[r.id as SourceKey]?.name ?? r.id}: {r.summary}
                  </button>
                ))}
                <span className="chip plain">Since {dayTime(d.since)}</span>
              </div>
            </div>
          </article>
        )}
        {draft.preparing && <Typing text="Penguin is reading your work and writing the update…" />}
        {draft.error && <div className="notice error">Couldn't prepare the update: {draft.error}</div>}
      </div>
    </>
  );
}

/* ---------------------------------------------------------------- Live */

const ACTION: Record<string, string> = { give_update: "gave your update", answer: "is answering", acknowledge: "said it's listening" };
const STATUS: Record<string, string> = { joining: "Joining…", waiting: "Waiting to be let in", in_call: "In the call", ended: "Not in a meeting", failed: "Couldn't join" };

export function LiveView({ settings, live, join, leave }: { settings: Settings; live: LiveState; join: (u: string) => void; leave: () => void }) {
  const [url, setUrl] = useState(settings.standup.url);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth" }); }, [live.events.length]);
  const active = live.status === "joining" || live.status === "waiting" || live.status === "in_call";
  const name = botName(settings.displayName, "google_meet");
  return (
    <>
      <ChannelHeader name="live-meeting" topic={STATUS[live.status] + (live.detail ? ` · ${live.detail}` : "")}>
        <span className={`status-dot ${live.status}`} />
      </ChannelHeader>
      <div className="scroll">
        {live.events.length === 0 && (
          <div className="empty">
            <div className="empty-art">🎧</div>
            <h2>Nothing live right now</h2>
            <p>When Penguin is in a meeting, you'll see what it hears and says here. It joins muted with the camera off and only unmutes to speak.</p>
          </div>
        )}
        {live.events.map((e, i) => {
          if (e.kind === "heard") return (
            <div key={i} className="line">
              <Avatar name="Meeting" /><div><div className="msg-head"><strong>Meeting</strong></div><p className="msg-text">{e.text}</p>
                {ACTION[e.action] && <p className="system">→ Penguin {ACTION[e.action]}</p>}</div>
            </div>
          );
          if (e.kind === "log" && /^(Answer|Speaking)/.test(e.text)) return (
            <div key={i} className="line"><Avatar name={name} bot /><div><div className="msg-head"><strong>{name}</strong><span className="tag">AI</span></div><p className="msg-text">{e.text.replace(/^(Answer|Speaking): /, "")}</p></div></div>
          );
          if (e.kind === "status" && e.detail) return <p key={i} className="system center">{e.detail}</p>;
          return null;
        })}
        <div ref={end} />
      </div>
      <form className="composer" onSubmit={(e) => { e.preventDefault(); if (!active && url.trim()) join(url.trim()); }}>
        <input value={url} disabled={active} placeholder="Paste a Google Meet, Zoom or Teams link to send Penguin" onChange={(e) => setUrl(e.target.value)} />
        {active
          ? <button type="button" className="btn danger" onClick={leave}>Leave</button>
          : <button type="submit" className="btn primary" disabled={!url.trim()}><Icon name="send" size={16} />Send Penguin</button>}
      </form>
    </>
  );
}

/* ---------------------------------------------------------------- Sources */

export function SourcesView({ settings, draft, save, prepare }: { settings: Settings; draft: Draft | null; save: (s: Settings) => Promise<Settings>; prepare: () => void }) {
  const report = (id: SourceKey) => draft?.reports.find((r) => r.id === id);
  const setSource = (id: SourceKey, on: boolean) => void save({ ...settings, sources: { ...settings.sources, [id]: on } });
  return (
    <>
      <ChannelHeader name="sources" topic="Where Penguin learns what you worked on">
        <button className="btn ghost" onClick={prepare}><Icon name="refresh" size={16} />Re-check</button>
      </ChannelHeader>
      <div className="scroll narrow">
        {(Object.keys(SOURCE_INFO) as SourceKey[]).map((id) => {
          const r = report(id);
          return (
            <div key={id} className="row-card">
              <div className="row-main">
                <strong>{SOURCE_INFO[id].name}</strong>
                <p>{SOURCE_INFO[id].desc}</p>
                {settings.sources[id] && r && <p className={r.ok ? "ok" : "warn"}>{r.ok ? "✓ " : "! "}{r.summary}{r.hint ? ` · ${r.hint}` : ""}</p>}
              </div>
              <Toggle on={settings.sources[id]} onChange={(v) => setSource(id, v)} label={SOURCE_INFO[id].name} />
            </div>
          );
        })}
        <h3 className="section-label">Coming with your Penguin account</h3>
        {["Google / Outlook Calendar: finds your standups and double-bookings", "Linear", "Jira", "GitHub without the CLI"].map((t) => (
          <div key={t} className="row-card muted"><div className="row-main"><strong>{t.split(":")[0]}</strong>{t.includes(":") && <p>{t.split(": ")[1]}</p>}</div><span className="tag">Soon</span></div>
        ))}
      </div>
    </>
  );
}

/* ---------------------------------------------------------------- Settings */

export function SettingsView({ settings, save, preview }: { settings: Settings; save: (s: Settings) => Promise<Settings>; preview: (n: string) => string }) {
  const [s, setS] = useState(settings);
  const [aliases, setAliases] = useState(settings.aliases.join(", "));
  const [error, setError] = useState("");
  useEffect(() => { setS(settings); setAliases(settings.aliases.join(", ")); }, [settings]);
  const next = { ...s, aliases: [...new Set(aliases.split(",").map((a) => a.trim()).filter(Boolean))].slice(0, 10) };
  const dirty = JSON.stringify(next) !== JSON.stringify(settings);
  const timezones = Intl.supportedValuesOf("timeZone");
  const st = s.standup;
  const setStandup = (p: Partial<Settings["standup"]>) => setS({ ...s, standup: { ...st, ...p } });

  return (
    <>
      <ChannelHeader name="settings" />
      <div className="scroll narrow">
        <h3 className="section-label">My profile</h3>
        <div className="field-grid">
          <label>Name<input value={s.displayName} maxLength={40} onChange={(e) => setS({ ...s, displayName: e.target.value })} /></label>
          <label>Also called<input value={aliases} placeholder="Mujib, MJ" onChange={(e) => setAliases(e.target.value)} /></label>
        </div>
        <p className="hint">Joins as <strong>{preview(s.displayName)}</strong>. The AI label is always added.</p>

        <h3 className="section-label">Your standup</h3>
        <label>Meeting link<input value={st.url} placeholder="https://meet.google.com/abc-defg-hij" onChange={(e) => setStandup({ url: e.target.value })} /></label>
        <div className="field-grid">
          <label>Starts at<input type="time" value={st.time} onChange={(e) => setStandup({ time: e.target.value })} /></label>
          <div className="label">Days
            <div className="days">{DAYS.map((d, i) => (
              <button key={i} type="button" className={st.days.includes(i) ? "on" : ""} aria-pressed={st.days.includes(i)}
                onClick={() => setStandup({ days: st.days.includes(i) ? st.days.filter((x) => x !== i) : [...st.days, i].sort() })}>{d}</button>
            ))}</div>
          </div>
        </div>
        <div className="row-card">
          <div className="row-main"><strong>Join for me automatically</strong><p>Penguin prepares 15 minutes before and joins just before it starts.</p></div>
          <Toggle on={st.auto} onChange={(v) => setStandup({ auto: v })} label="Join automatically" />
        </div>

        <h3 className="section-label">Voice</h3>
        <div className="row-card"><div className="row-main"><strong>Default voice</strong><p>Your own voice is coming later: opt-in, recorded in the app, and Penguin still says it's an AI.</p></div><span className="tag">Active</span></div>

        <h3 className="section-label">Advanced</h3>
        <label>Timezone<select value={s.timezone} onChange={(e) => setS({ ...s, timezone: e.target.value })}>{timezones.map((t) => <option key={t}>{t}</option>)}</select></label>
        <div className="row-card">
          <div className="row-main"><strong>Show the meeting window</strong><p>Watch what Penguin does in the call.</p></div>
          <Toggle on={!s.runHidden} onChange={(v) => setS({ ...s, runHidden: !v })} label="Show the meeting window" />
        </div>
        {error && <div className="notice error">{error}</div>}
      </div>
      {dirty && (
        <div className="savebar">
          <span>Careful, you have unsaved changes!</span>
          <button className="btn link" onClick={() => { setS(settings); setAliases(settings.aliases.join(", ")); }}>Reset</button>
          <button className="btn success" onClick={() => { setError(""); save(next).catch((e) => setError(message(e))); }}>Save changes</button>
        </div>
      )}
    </>
  );
}

/* ---------------------------------------------------------------- Onboarding */

export function Onboarding({ settings, save, done }: { settings: Settings; save: (s: Settings) => Promise<Settings>; done: () => void }) {
  const [name, setName] = useState(settings.displayName);
  const [url, setUrl] = useState(settings.standup.url);
  const [at, setAt] = useState(settings.standup.time);
  const [sources, setSources] = useState(settings.sources);
  const [error, setError] = useState("");
  const finish = async () => {
    setError("");
    try {
      await save({ ...settings, displayName: name, sources, onboarded: true, standup: { ...settings.standup, url, time: at, auto: !!url } });
      done();
    } catch (e) { setError(message(e)); }
  };
  return (
    <div className="modal-backdrop">
      <div className="modal" role="dialog" aria-labelledby="welcome">
        <div className="modal-art">🐧</div>
        <h2 id="welcome">Welcome to Penguin</h2>
        <p className="modal-sub">It covers your standup when you're double-booked: it reads your work, writes your update, joins the call and says it, as your AI assistant.</p>
        <label>Your name<input value={name} maxLength={40} onChange={(e) => setName(e.target.value)} /></label>
        <p className="hint">Joins as <strong>{botName(name, "google_meet")}</strong></p>
        <div className="field-grid">
          <label><span>Standup link <span className="opt">· optional</span></span><input value={url} placeholder="Meet, Zoom or Teams link" onChange={(e) => setUrl(e.target.value)} /></label>
          <label>Starts at<input type="time" value={at} onChange={(e) => setAt(e.target.value)} /></label>
        </div>
        <p className="section-label small">Let Penguin read</p>
        {(Object.keys(SOURCE_INFO) as SourceKey[]).map((id) => (
          <div key={id} className="row-card compact">
            <div className="row-main"><strong>{SOURCE_INFO[id].name}</strong><p>{SOURCE_INFO[id].desc}</p></div>
            <Toggle on={sources[id]} onChange={(v) => setSources({ ...sources, [id]: v })} label={SOURCE_INFO[id].name} />
          </div>
        ))}
        <p className="hint">Your work summary is written by Claude. Nothing is shared with your team except what Penguin says in the call.</p>
        {error && <div className="notice error">{error}</div>}
        <button className="btn primary wide" disabled={!name.trim()} onClick={() => void finish()}>Get started</button>
      </div>
    </div>
  );
}

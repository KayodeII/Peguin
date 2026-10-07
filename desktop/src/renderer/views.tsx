import { useEffect, useRef, useState } from "react";
import type { DraftState, LiveState } from "./App";
import type { Account } from "../main/account";
import type { Draft } from "../main/brain";
import { botName } from "../main/meeting/platform";
import type { Settings } from "../main/settings";
import { Avatar, dayTime, Icon, Logo, message, Toggle, Typing } from "./ui";

const SOURCE_INFO = {
  git: { name: "Git commits", desc: "Commits in repos on this computer." },
  github: { name: "GitHub", desc: "PRs and reviews, via the gh CLI." },
  claude_code: { name: "Claude Code", desc: "Your prompts only. Never code or output." },
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
      <ChannelHeader name="today" topic="Your next update">
        <button className="btn ghost" disabled={draft.preparing} onClick={prepare}><Icon name="refresh" size={16} />{d ? "Refresh" : "Prepare"}</button>
      </ChannelHeader>
      <div className="scroll">
        {!d && !draft.preparing && (
          <div className="empty">
            <Logo size={56} />
            <h2>No update yet</h2>
            <p>Built from your work since the last standup.</p>
            <button className="btn primary" onClick={prepare}>Prepare update</button>
          </div>
        )}
        {d && (
          <article className="message">
            <Avatar name={name} bot />
            <div className="msg-body">
              <div className="msg-head"><strong>{name}</strong><span className="tag">AI</span><time>Prepared {dayTime(d.generatedAt)}</time></div>
              <p className="msg-text">{d.script}</p>
              <div className="embed">
                <div className="embed-title">Facts used for questions</div>
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
        {draft.preparing && <Typing text="Peguin is writing" />}
        {draft.error && <div className="notice error">{draft.error}</div>}
      </div>
    </>
  );
}

/* ---------------------------------------------------------------- Live */

const ACTION: Record<string, string> = { give_update: "gave the update", answer: "answered", acknowledge: "acknowledged" };
const STATUS: Record<string, string> = { joining: "Joining", waiting: "In the lobby", in_call: "In the call", ended: "Idle", failed: "Couldn't join" };

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
            <h2>Not in a meeting</h2>
            <p>The transcript shows up here.</p>
          </div>
        )}
        {live.events.map((e, i) => {
          if (e.kind === "heard") return (
            <div key={i} className="line">
              <Avatar name="Meeting" /><div><div className="msg-head"><strong>Meeting</strong></div><p className="msg-text">{e.text}</p>
                {ACTION[e.action] && <p className="system">→ Peguin {ACTION[e.action]}</p>}</div>
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
        <input value={url} disabled={active} placeholder="Meeting link" onChange={(e) => setUrl(e.target.value)} />
        {active
          ? <button type="button" className="btn danger" onClick={leave}>Leave</button>
          : <button type="submit" className="btn primary" disabled={!url.trim()}><Icon name="send" size={16} />Join</button>}
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
      <ChannelHeader name="sources">
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
        <h3 className="section-label">Coming soon</h3>
        {["Calendar", "Linear", "Jira"].map((t) => (
          <div key={t} className="row-card muted"><div className="row-main"><strong>{t}</strong></div><span className="tag">Soon</span></div>
        ))}
      </div>
    </>
  );
}

/* ---------------------------------------------------------------- Settings */

export function SettingsView({ settings, save, preview, account }: { settings: Settings; save: (s: Settings) => Promise<Settings>; preview: (n: string) => string; account: Account | null }) {
  const [s, setS] = useState(settings);
  const [aliases, setAliases] = useState(settings.aliases.join(", "));
  const [error, setError] = useState("");
  // Appearance saves instantly; keep other unsaved edits when it does.
  useEffect(() => { setS((prev) => ({ ...prev, appearance: settings.appearance })); }, [settings.appearance]);
  const setAppearance = (a: Partial<Settings["appearance"]>) => void save({ ...settings, appearance: { ...settings.appearance, ...a } });
  const next = { ...s, aliases: [...new Set(aliases.split(",").map((a) => a.trim()).filter(Boolean))].slice(0, 10) };
  const dirty = JSON.stringify(next) !== JSON.stringify(settings);
  const timezones = Intl.supportedValuesOf("timeZone");
  const st = s.standup;
  const setStandup = (p: Partial<Settings["standup"]>) => setS({ ...s, standup: { ...st, ...p } });

  return (
    <>
      <ChannelHeader name="settings" />
      <div className="scroll narrow">
        <h3 className="section-label">Account</h3>
        <AccountCard account={account} />

        <h3 className="section-label">My profile</h3>
        <div className="field-grid">
          <label>Name<input value={s.displayName} maxLength={40} onChange={(e) => setS({ ...s, displayName: e.target.value })} /></label>
          <label>Also called<input value={aliases} placeholder="Mujib, MJ" onChange={(e) => setAliases(e.target.value)} /></label>
        </div>
        <p className="hint">Joins as <strong>{preview(s.displayName)}</strong></p>

        <h3 className="section-label">Your standup</h3>
        <label>Link<input value={st.url} placeholder="https://meet.google.com/abc-defg-hij" onChange={(e) => setStandup({ url: e.target.value })} /></label>
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
          <div className="row-main"><strong>Auto-join</strong><p>Prepares 15 minutes before, joins at the start.</p></div>
          <Toggle on={st.auto} onChange={(v) => setStandup({ auto: v })} label="Join automatically" />
        </div>

        <h3 className="section-label">Appearance</h3>
        <div className="themes" role="radiogroup" aria-label="Theme">
          {THEMES.map((t) => (
            <button key={t.id} role="radio" aria-checked={settings.appearance.theme === t.id} className={`theme-opt ${settings.appearance.theme === t.id ? "on" : ""}`} onClick={() => setAppearance({ theme: t.id })}>
              <div className={`swatch ${t.id === "system" ? "system" : ""}`} style={t.vars}><i /><i />{t.id === "system" && <i style={{ background: "#191919" }} />}</div>
              <span>{t.label}</span>
            </button>
          ))}
        </div>
        <div className="accents" role="radiogroup" aria-label="Accent colour">
          {ACCENTS.map((a) => (
            <button key={a.id} role="radio" aria-checked={settings.appearance.accent === a.id} aria-label={a.id} title={a.id}
              className={`accent-dot ${settings.appearance.accent === a.id ? "on" : ""}`} style={{ background: a.color }} onClick={() => setAppearance({ accent: a.id })} />
          ))}
        </div>

        <h3 className="section-label">Voice</h3>
        <div className="row-card"><div className="row-main"><strong>Default voice</strong><p>Your own voice: coming soon.</p></div><span className="tag">Active</span></div>

        <h3 className="section-label">Advanced</h3>
        <label>Timezone<select value={s.timezone} onChange={(e) => setS({ ...s, timezone: e.target.value })}>{timezones.map((t) => <option key={t}>{t}</option>)}</select></label>
        <div className="row-card">
          <div className="row-main"><strong>Show meeting window</strong></div>
          <Toggle on={!s.runHidden} onChange={(v) => setS({ ...s, runHidden: !v })} label="Show the meeting window" />
        </div>
        {error && <div className="notice error">{error}</div>}
      </div>
      {dirty && (
        <div className="savebar">
          <span>Unsaved changes</span>
          <button className="btn link" onClick={() => { setS(settings); setAliases(settings.aliases.join(", ")); }}>Reset</button>
          <button className="btn success" onClick={() => { setError(""); save(next).then((saved) => { setS(saved); setAliases(saved.aliases.join(", ")); }).catch((e) => setError(message(e))); }}>Save changes</button>
        </div>
      )}
    </>
  );
}

const THEMES: { id: Settings["appearance"]["theme"]; label: string; vars: Record<string, string> }[] = [
  { id: "system", label: "System", vars: { "--sw-side": "#f7f7f5", "--sw-main": "#ffffff", "--sw-ink": "#37352f" } },
  { id: "light", label: "Light", vars: { "--sw-side": "#f7f7f5", "--sw-main": "#ffffff", "--sw-ink": "#37352f" } },
  { id: "dark", label: "Dark", vars: { "--sw-side": "#202020", "--sw-main": "#191919", "--sw-ink": "#d4d4d4" } },
  { id: "midnight", label: "Midnight", vars: { "--sw-side": "#2b2d31", "--sw-main": "#313338", "--sw-ink": "#dbdee1" } },
];
const ACCENTS: { id: Settings["appearance"]["accent"]; color: string }[] = [
  { id: "blue", color: "#2383e2" }, { id: "purple", color: "#9065b0" }, { id: "green", color: "#448361" }, { id: "orange", color: "#d9730d" }, { id: "pink", color: "#c14c8a" },
];

const PLAN: Record<string, string> = { active: "Active", trialing: "Free trial", past_due: "Payment failed", canceled: "Canceled" };

function AccountCard({ account }: { account: Account | null }) {
  const [waiting, setWaiting] = useState(false);
  useEffect(() => { if (account) setWaiting(false); }, [account]);
  if (!account) return (
    <div className="row-card">
      <div className="row-main"><strong>Not signed in</strong><p>{waiting ? "Finish signing in in your browser." : "Sign in to use your plan's Claude for updates and answers."}</p></div>
      <button className="btn primary" onClick={() => { setWaiting(true); void window.penguin.signIn(); }}>Sign in</button>
    </div>
  );
  const plan = account.status ? PLAN[account.status] ?? account.status : "No plan";
  return (
    <div className="row-card">
      <Avatar name={account.email} />
      <div className="row-main"><strong>{account.email}</strong><p className={account.entitled ? "ok" : "warn"}>{plan}{account.entitled ? "" : " · start a plan on the website"}</p></div>
      <button className="btn ghost" onClick={() => void window.penguin.signOut()}>Sign out</button>
    </div>
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
        <div className="modal-art"><Logo size={56} /></div>
        <h2 id="welcome">Welcome to Peguin</h2>
        <p className="modal-sub">Your standup, covered.</p>
        <label>Name<input value={name} maxLength={40} onChange={(e) => setName(e.target.value)} /></label>
        <p className="hint">Joins as <strong>{botName(name, "google_meet")}</strong></p>
        <div className="field-grid">
          <label><span>Standup link <span className="opt">optional</span></span><input value={url} placeholder="Meet, Zoom or Teams" onChange={(e) => setUrl(e.target.value)} /></label>
          <label>Starts at<input type="time" value={at} onChange={(e) => setAt(e.target.value)} /></label>
        </div>
        <p className="section-label small">Sources</p>
        {(Object.keys(SOURCE_INFO) as SourceKey[]).map((id) => (
          <div key={id} className="row-card compact">
            <div className="row-main"><strong>{SOURCE_INFO[id].name}</strong><p>{SOURCE_INFO[id].desc}</p></div>
            <Toggle on={sources[id]} onChange={(v) => setSources({ ...sources, [id]: v })} label={SOURCE_INFO[id].name} />
          </div>
        ))}
                {error && <div className="notice error">{error}</div>}
        <button className="btn primary wide" disabled={!name.trim()} onClick={() => void finish()}>Get started</button>
      </div>
    </div>
  );
}

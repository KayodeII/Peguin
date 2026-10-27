// First run: one step at a time, each saying what Peguin does and why it needs
// what it asks for, before anything is asked (the way Tailscale's setup reads).
// Nothing is saved until the last step; permissions are only explained here,
// since macOS asks for each one the first time a feature needs it.
import { useEffect, useState } from "react";
import type { Account } from "../main/account";
import { botName } from "../main/meeting/platform";
import type { Settings } from "../main/settings";
import { BrandIcon, Icon, Logo, message, Toggle } from "./ui";

type Model = { progress: number; error?: string } | null;
type Found = { claude: boolean; codex: boolean } | null;

const STEPS = ["welcome", "you", "work", "ai", "standup", "permissions", "account", "done"] as const;
type Step = (typeof STEPS)[number];

/** The AI coding tools whose prompts count as sessions; one switch here, one each in Sources. */
const SESSIONS = ["claude_code", "codex", "cursor", "gemini", "copilot", "continue", "deepseek"] as const;

const SOURCES = {
  git: { icon: "git", name: "Git commits", desc: "Commits you made in repos on this Mac. Found without any login." },
  github: { icon: "github", name: "GitHub", desc: "PRs you opened, merged or reviewed, through the GitHub CLI. Not signed in? Connect it in Sources." },
  sessions: { icon: "claude_code", name: "AI coding sessions", desc: "The prompts you gave Claude Code, Codex, Cursor, Gemini and other coding AIs, so work in progress counts. Never code or their output." },
} as const;

const AIS: { id: Settings["ai"]; name: string; desc: string; detect?: "claude" | "codex"; get: string }[] = [
  { id: "claude", name: "Claude", desc: "Your Claude Code sign-in. Fastest answers.", detect: "claude", get: "Install Claude Code from claude.com/code and sign in." },
  { id: "codex", name: "Codex", desc: "Your ChatGPT sign-in through the Codex CLI. About ten seconds an answer.", detect: "codex", get: "Install the Codex CLI and run codex login." },
  { id: "grok", name: "Grok", desc: "Your own xAI API key. You'll paste it in Settings, AI.", get: "Get a key at console.x.ai." },
];

const PERMISSIONS = [
  { icon: "mic", name: "Microphone and camera", when: "When you first use Join as me", why: "So you're heard and seen in your own call." },
  { icon: "screen", name: "Screen recording", when: "When you first share your screen", why: "macOS needs it to share a screen in a call." },
  { icon: "access", name: "Accessibility", when: "Only for voice control or On this Mac", why: "To click buttons you name, or read window titles." },
  { icon: "calendar", name: "Calendars", when: "Only if you connect your Mac's Calendar", why: "To find your standups, read on this Mac." },
];

function Feature({ icon, title, children }: { icon: string | React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="ob-feature">
      <span className="ob-feature-icon">{typeof icon === "string" ? <Icon name={icon} size={20} /> : icon}</span>
      <div><strong>{title}</strong><p>{children}</p></div>
    </div>
  );
}

export function Onboarding({ settings, save, done, model, account }: {
  settings: Settings; save: (s: Settings) => Promise<Settings>; done: () => void; model: Model; account: Account | null;
}) {
  const [step, setStep] = useState<Step>("welcome");
  const [name, setName] = useState(settings.displayName);
  const [aliases, setAliases] = useState(settings.aliases.join(", "));
  const [sources, setSources] = useState(settings.sources);
  const [ai, setAi] = useState(settings.ai);
  const [found, setFound] = useState<Found>(null);
  const [url, setUrl] = useState(settings.standup.url);
  const [at, setAt] = useState(settings.standup.time);
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState("");

  const i = STEPS.indexOf(step);
  const go = (d: 1 | -1) => { setError(""); setStep(STEPS[Math.min(STEPS.length - 1, Math.max(0, i + d))]!); };

  // Check for Claude Code and Codex once, and start on whichever is installed.
  useEffect(() => {
    void window.penguin.aiDetect().then((f) => {
      setFound(f);
      if (settings.ai === "claude" && !f.claude && f.codex) setAi("codex");
    }).catch(() => setFound({ claude: false, codex: false }));
  }, [settings.ai]);

  useEffect(() => { if (account) setSigningIn(false); }, [account]);

  const finish = async () => {
    setError("");
    try {
      const names = [...new Set(aliases.split(",").map((a) => a.trim()).filter(Boolean))].slice(0, 10);
      await save({ ...settings, displayName: name.trim(), aliases: names, sources, ai, onboarded: true, standup: { ...settings.standup, url: url.trim(), time: at, auto: !!url.trim() } });
      done();
    } catch (e) { setError(message(e)); }
  };

  const canContinue = step !== "you" || !!name.trim();
  const first = name.trim().split(/\s+/)[0] || "you";

  return (
    <div className="ob" role="dialog" aria-modal aria-labelledby="ob-title">
      <div className="ob-card">
        <div className="ob-body">
          {step === "welcome" && (
            <>
              <div className="ob-art"><Logo size={72} /></div>
              <h2 id="ob-title">Welcome to Peguin</h2>
              <p className="ob-sub">Peguin covers your daily standup when you can't make it, and helps you through the meetings you join yourself.</p>
              <Feature icon="recaps" title="It writes your update">Before the meeting, from what you actually did: commits, PRs and the work you gave your AI.</Feature>
              <Feature icon="shield" title="It speaks for you, openly as an AI">It joins as “{botName(name || "Your name", "google_meet")}”, says it's an AI, and waits until someone calls on you. It answers only from your update, and passes anything else to you.</Feature>
              <Feature icon="send" title="It hands you a recap">What was asked, what it couldn't answer, and what you should follow up on.</Feature>
              <p className="ob-note">Setup takes about a minute. You can change everything later in Settings.</p>
            </>
          )}

          {step === "you" && (
            <>
              <div className="ob-art"><span className="ob-icon"><Icon name="mic" size={30} /></span></div>
              <h2 id="ob-title">What do people call you?</h2>
              <p className="ob-sub">Peguin listens for your name to know when it's your turn to give an update. Until then it stays quiet.</p>
              <label>Your name<input autoFocus value={name} maxLength={40} placeholder="Ada Obi" onChange={(e) => setName(e.target.value)} /></label>
              <p className="hint">In meetings Peguin is called <strong>{botName(name || "Your name", "google_meet")}</strong>. The “(AI)” is always there.</p>
              <label><span>Nicknames <span className="opt">optional</span></span><input value={aliases} placeholder="Ada, A.O." onChange={(e) => setAliases(e.target.value)} /></label>
              <p className="hint">Other names your team uses for you, separated by commas.</p>
            </>
          )}

          {step === "work" && (
            <>
              <div className="ob-art"><span className="ob-icon"><Icon name="sources" size={30} /></span></div>
              <h2 id="ob-title">Where your update comes from</h2>
              <p className="ob-sub">Peguin reads the titles and statuses of your recent work since the previous workday. It never reads your code, and nothing is uploaded to Peguin.</p>
              {(Object.keys(SOURCES) as (keyof typeof SOURCES)[]).map((id) => {
                const on = id === "sessions" ? SESSIONS.some((k) => sources[k]) : sources[id];
                const set = (v: boolean) => setSources(id === "sessions" ? { ...sources, ...Object.fromEntries(SESSIONS.map((k) => [k, v])) } : { ...sources, [id]: v });
                return (
                  <div key={id} className="row-card compact">
                    <BrandIcon id={SOURCES[id].icon} size={28} />
                    <div className="row-main"><strong>{SOURCES[id].name}</strong><p>{SOURCES[id].desc}</p></div>
                    <Toggle on={on} onChange={set} label={SOURCES[id].name} />
                  </div>
                );
              })}
              <p className="hint">Later, in Sources: connect Linear or Jira, pick which coding AIs count, or turn on On this Mac (the apps you spent time in).</p>
            </>
          )}

          {step === "ai" && (
            <>
              <div className="ob-art"><span className="ob-icon"><Icon name="sparkle" size={30} /></span></div>
              <h2 id="ob-title">Pick your AI</h2>
              <p className="ob-sub">Peguin uses an AI you already have to write your update, answer follow-ups and summarise recaps. It runs under your own account: Peguin doesn't pay for it or see it.</p>
              <div className="ob-choices" role="radiogroup">
                {AIS.map((a) => {
                  const installed = a.detect ? found?.[a.detect] : undefined;
                  return (
                    <button key={a.id} role="radio" aria-checked={ai === a.id} className={`ob-choice ${ai === a.id ? "on" : ""}`} onClick={() => setAi(a.id)}>
                      <span className="ob-radio" />
                      <span className="ob-choice-main">
                        <strong>{a.name}</strong>
                        <span>{a.desc}</span>
                        {a.detect && found && (installed
                          ? <span className="ok"><Icon name="check" size={14} /> Found on this Mac</span>
                          : <span className="muted">Not found. {a.get}</span>)}
                        {a.detect && !found && <span className="muted">Looking on this Mac…</span>}
                      </span>
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {step === "standup" && (
            <>
              <div className="ob-art"><span className="ob-icon"><Icon name="calendar" size={30} /></span></div>
              <h2 id="ob-title">When is your standup?</h2>
              <p className="ob-sub">Peguin prepares your update fifteen minutes before and joins a minute before, on weekdays. Google Meet and Zoom work today.</p>
              <label><span>Meeting link <span className="opt">optional</span></span><input value={url} placeholder="https://meet.google.com/…" onChange={(e) => setUrl(e.target.value)} /></label>
              <label>Starts at<input type="time" value={at} onChange={(e) => setAt(e.target.value)} /></label>
              <p className="hint">{url.trim() ? `Peguin will join for ${first} automatically. You can turn that off in Settings.` : "No link? Skip this. You can connect your calendar in Settings, or send Peguin to any meeting from Today."}</p>
            </>
          )}

          {step === "permissions" && (
            <>
              <div className="ob-art"><span className="ob-icon"><Icon name="shield" size={30} /></span></div>
              <h2 id="ob-title">What macOS will ask you</h2>
              <p className="ob-sub">Peguin doesn't ask for anything now. macOS asks the first time you use a feature that needs it; click Allow when it does.</p>
              {PERMISSIONS.map((p) => (
                <div key={p.name} className="ob-feature">
                  <span className="ob-feature-icon"><Icon name={p.icon} size={20} /></span>
                  <div><strong>{p.name}</strong><p><em>{p.when}.</em> {p.why}</p></div>
                </div>
              ))}
              <div className="ob-model">
                <strong>Speech recognition, on this Mac</strong>
                <p>Meeting audio is turned into text here and never leaves your Mac. It needs a one-time 550 MB download.</p>
                {model?.error
                  ? <p className="warn">The download stopped: {model.error}. Peguin will try again next time it opens.</p>
                  : model
                    ? <div className="ob-progress" aria-label="Download progress"><span style={{ width: `${Math.round(model.progress * 100)}%` }} /><em>{Math.round(model.progress * 100)}%</em></div>
                    : <p className="ok"><Icon name="check" size={14} /> Ready</p>}
              </div>
            </>
          )}

          {step === "account" && (
            <>
              <div className="ob-art"><span className="ob-icon"><Logo size={40} /></span></div>
              <h2 id="ob-title">Sign in to start your trial</h2>
              <p className="ob-sub">A Peguin account turns on your plan: fourteen days of Pro, with follow-up answers, recaps, your own voice and Join as me. Without one, Peguin covers three standups a week.</p>
              {account
                ? <p className="ob-signed"><Icon name="check" size={16} /> Signed in as <strong>{account.email}</strong></p>
                : (
                  <>
                    <button className="btn primary wide" disabled={signingIn} onClick={() => { setSigningIn(true); setError(""); window.penguin.signIn().catch((e: unknown) => { setSigningIn(false); setError(message(e)); }); }}>
                      {signingIn ? "Finish signing in in your browser…" : "Sign in with your browser"}
                    </button>
                    <p className="hint center">Opens peguin.co. Your email is all the account holds; your work stays on this Mac.</p>
                  </>
                )}
            </>
          )}

          {step === "done" && (
            <>
              <div className="ob-art"><Logo size={72} /></div>
              <h2 id="ob-title">You're all set{name.trim() ? `, ${first}` : ""}</h2>
              <p className="ob-sub">When you open Peguin it writes your first update. Read it on Today before your standup and edit anything that's off.</p>
              <Feature icon={<Logo size={24} />} title="Peguin lives in your menu bar">Close this window and it keeps running. Click the penguin at the top of your screen to open it, prepare an update or leave a meeting.</Feature>
              <Feature icon="live" title="Hand over any time">Running late? Send Peguin. Made it after all? Hand over to me, and it leaves the call to you.</Feature>
            </>
          )}

          {error && <div className="notice error">{error}</div>}
        </div>

        <footer className="ob-foot">
          <div className="ob-dots" aria-label={`Step ${i + 1} of ${STEPS.length}`}>
            {STEPS.map((s, n) => <span key={s} className={n === i ? "on" : n < i ? "past" : ""} />)}
          </div>
          <div className="ob-actions">
            {i > 0 && step !== "done" && <button className="btn link" onClick={() => go(-1)}>Back</button>}
            {(step === "standup" && !url.trim()) || (step === "account" && !account)
              ? <button className="btn ghost" onClick={() => go(1)}>Skip for now</button>
              : null}
            {step === "welcome" && <button className="btn primary" onClick={() => go(1)}>Get started</button>}
            {step !== "welcome" && step !== "done" && !(step === "account" && !account) && !(step === "standup" && !url.trim()) && (
              <button className="btn primary" disabled={!canContinue} onClick={() => go(1)}>Continue</button>
            )}
            {step === "done" && <button className="btn primary" onClick={() => void finish()}>Open Peguin</button>}
          </div>
        </footer>
      </div>
    </div>
  );
}

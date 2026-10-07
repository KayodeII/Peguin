import { useEffect, useMemo, useState } from "react";
import { botName } from "../main/meeting/platform";
import type { MeetingEvent, MeetingStatus } from "../main/meeting/runner";
import type { Settings } from "../main/settings";

const CONNECTIONS = [
  { id: "calendar", name: "Google or Outlook Calendar", why: "Finds your standups and tells Penguin when you're double-booked." },
  { id: "github", name: "GitHub", why: "PRs and commits since your last standup." },
  { id: "linear", name: "Linear", why: "Issues you moved or closed." },
  { id: "jira", name: "Jira", why: "Tickets you moved or closed." },
];

const STATUS_TEXT: Record<MeetingStatus, string> = {
  joining: "Joining", waiting: "In the waiting room", in_call: "In the call", ended: "Not in a meeting", failed: "Couldn't join",
};

const ACTION_TEXT: Record<string, string> = {
  give_update: "gave your update", answer: "deferred the question to you", acknowledge: "said it's listening", none: "",
};

export function App() {
  const [saved, setSaved] = useState<Settings | null>(null);
  const [draft, setDraft] = useState<Settings | null>(null);
  const [aliasText, setAliasText] = useState("");
  const [error, setError] = useState("");
  const [url, setUrl] = useState("");
  const [status, setStatus] = useState<{ status: MeetingStatus; detail?: string }>({ status: "ended" });
  const [events, setEvents] = useState<MeetingEvent[]>([]);
  const timezones = useMemo(() => Intl.supportedValuesOf("timeZone"), []);

  useEffect(() => {
    void window.penguin.getSettings().then((s: Settings) => { setSaved(s); setDraft(s); setAliasText(s.aliases.join(", ")); });
    return window.penguin.onMeetingEvent((raw) => {
      const e = raw as MeetingEvent;
      if (e.kind === "status") setStatus({ status: e.status, detail: e.detail });
      setEvents((prev) => [...prev.slice(-80), e]);
    });
  }, []);

  if (!draft || !saved) return <main className="loading">Loading…</main>;

  const dirty = JSON.stringify({ ...draft, aliases: parseAliases(aliasText) }) !== JSON.stringify(saved);
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setDraft({ ...draft, [k]: v });
  const live = status.status === "joining" || status.status === "waiting" || status.status === "in_call";

  async function save() {
    setError("");
    try {
      const s: Settings = await window.penguin.saveSettings({ ...draft, aliases: parseAliases(aliasText) });
      setSaved(s); setDraft(s); setAliasText(s.aliases.join(", "));
    } catch (e) { setError(message(e)); }
  }

  async function join() {
    setError(""); setEvents([]);
    try { if (dirty) await save(); await window.penguin.join(url.trim()); }
    catch (e) { setError(message(e)); }
  }

  return (
    <main>
      <header>
        <div className="brand"><span className="logo" aria-hidden>🐧</span><h1>Penguin</h1></div>
        <p className="muted">Covers your standup when you're double-booked. It always says it's an AI.</p>
      </header>

      {error && <div className="error" role="alert">{error}</div>}

      <section>
        <h2>Profile</h2>
        <label>Your name
          <input value={draft.displayName} maxLength={40} placeholder="Mujeeb Adebowale"
            onChange={(e) => set("displayName", e.target.value)} />
        </label>
        <p className="hint">
          Penguin joins as <strong>{botName(draft.displayName, "google_meet")}</strong>
          {" "}(on Teams: <strong>{botName(draft.displayName, "teams")}</strong>). The AI label is always added.
        </p>
        <label>Other ways people say or spell it
          <input value={aliasText} placeholder="Mujib, MJ" onChange={(e) => setAliasText(e.target.value)} />
        </label>
        <p className="hint">Comma-separated. Helps Penguin notice when it's your turn.</p>
        <label>Timezone
          <select value={draft.timezone} onChange={(e) => set("timezone", e.target.value)}>
            {timezones.map((tz) => <option key={tz}>{tz}</option>)}
          </select>
        </label>
      </section>

      <section>
        <h2>Your update</h2>
        <label>What Penguin says when it's your turn
          <textarea rows={4} maxLength={1000} value={draft.standingNotes}
            placeholder="Yesterday I finished the Zoom join flow. Today I'm on onboarding. No blockers."
            onChange={(e) => set("standingNotes", e.target.value)} />
        </label>
        <p className="hint">
          Penguin says only what you write here and never adds facts. Questions get "I'll get you to follow up".
          Connecting your tools below will draft this for you.
        </p>
      </section>

      <section>
        <h2>Connections</h2>
        <ul className="connections">
          {CONNECTIONS.map((c) => (
            <li key={c.id}>
              <div><strong>{c.name}</strong><p className="hint">{c.why}</p></div>
              <button disabled title="Needs your Penguin account, coming next">Connect</button>
            </li>
          ))}
        </ul>
        <p className="hint">Connecting needs a Penguin account (coming next). Penguin never asks for your Zoom, Meet or Teams login: it joins as a guest.</p>
      </section>

      <section>
        <h2>Voice</h2>
        <label className="radio"><input type="radio" checked readOnly /> Default voice</label>
        <label className="radio disabled"><input type="radio" disabled /> Your own voice <span className="tag">Later</span></label>
        <p className="hint">Opt-in. You'll record a short script in the app; Penguin still says it's an AI in every meeting.</p>
        <label className="radio"><input type="checkbox" checked={!draft.runHidden}
          onChange={(e) => set("runHidden", !e.target.checked)} /> Show the meeting window (to watch what Penguin does)</label>
      </section>

      <div className="savebar">
        <button className="primary" disabled={!dirty} onClick={() => void save()}>{dirty ? "Save changes" : "Saved"}</button>
      </div>

      <section>
        <h2>Send Penguin to a meeting</h2>
        <div className="row">
          <input value={url} placeholder="Paste a Google Meet, Zoom or Teams link" disabled={live}
            onChange={(e) => setUrl(e.target.value)} />
          {live
            ? <button onClick={() => void window.penguin.leave()}>Leave</button>
            : <button className="primary" disabled={!url.trim()} onClick={() => void join()}>Join</button>}
        </div>
        <p className={`status ${status.status}`}><span className="dot" />{STATUS_TEXT[status.status]}{status.detail ? ` · ${status.detail}` : ""}</p>
        {events.length > 0 && (
          <ol className="events">
            {events.filter((e) => e.kind !== "status").map((e, i) => (
              <li key={i} className={e.kind}>
                {e.kind === "heard"
                  ? <>Heard “{e.text}”{ACTION_TEXT[e.action] ? <strong> → {ACTION_TEXT[e.action]}</strong> : null}</>
                  : e.text}
              </li>
            ))}
          </ol>
        )}
      </section>
    </main>
  );
}

function parseAliases(text: string): string[] {
  return [...new Set(text.split(",").map((a) => a.trim()).filter(Boolean))].slice(0, 10);
}

/** Electron prefixes IPC errors with "Error invoking remote method '...': Error: ". */
function message(e: unknown): string {
  return String(e instanceof Error ? e.message : e).replace(/^Error invoking remote method '[^']+': (Error: )?/, "");
}

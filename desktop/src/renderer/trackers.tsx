// Sources > Tickets: Linear and Jira as apps. Connect opens their site to make
// a key; the key is sealed on this Mac. One-click OAuth (like calendars) is next.
import { useEffect, useState } from "react";
import type { Settings } from "../main/settings";
import type { SourceReport } from "../main/context/index";
import { BrandIcon, message, Toggle } from "./ui";

type Trackers = Awaited<ReturnType<typeof window.penguin.trackersStatus>>;
type Kind = "linear" | "jira";

const INFO: Record<Kind, { name: string; desc: string; linked: string }> = {
  linear: {
    name: "Linear",
    desc: "Issues assigned to you.",
    linked: "Connected. Titles and statuses only; the key stays on this Mac.",
  },
  jira: {
    name: "Jira",
    desc: "Issues assigned to you.",
    linked: "Connected. Titles and statuses only; the token stays on this Mac.",
  },
};

function TrackerApp({ kind, trackers, setTrackers, settings, save, report }: {
  kind: Kind; trackers: Trackers; setTrackers: (t: Trackers) => void;
  settings: Settings; save: (s: Settings) => Promise<Settings>; report?: SourceReport;
}) {
  const [form, setForm] = useState({ apiKey: "", site: "", email: "", token: "" });
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const connected = trackers[kind];
  const on = settings.sources[kind];
  const run = (fn: () => Promise<Trackers>) => { setBusy(true); setError(""); fn().then(setTrackers).catch((e) => setError(message(e))).finally(() => setBusy(false)); };
  const field = (k: keyof typeof form) => ({ value: form[k], onChange: (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value }) });
  const ready = kind === "linear" ? !!form.apiKey.trim() : !!(form.site.trim() && form.email.trim() && form.token.trim());
  const start = () => {
    setOpen(true);
    setError("");
    void window.penguin.trackersOpenKey(kind);
  };
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const input = form;
    setForm({ ...form, apiKey: "", token: "" });
    run(() => window.penguin.trackersConnect(kind, input).then((t) => { setOpen(false); return t; }));
  };

  return (
    <div className="source-app">
      <div className="row-head">
        <BrandIcon id={kind} />
        <div className="row-main">
          <strong>{INFO[kind].name}</strong>
          <p>{connected ? `${INFO[kind].linked} Signed in as ${connected.who}${"site" in connected ? ` · ${connected.site.replace(/^https:\/\//, "")}` : ""}.` : INFO[kind].desc}</p>
          {connected && on && report && <p className={report.ok ? "ok" : "warn"}>{report.ok ? "✓ " : "! "}{report.summary}{report.hint ? ` · ${report.hint}` : ""}</p>}
        </div>
        {connected ? (
          <>
            <button className="btn link" disabled={busy} onClick={() => run(() => window.penguin.trackersDisconnect(kind))}>Disconnect</button>
            <Toggle on={on} onChange={(v) => void save({ ...settings, sources: { ...settings.sources, [kind]: v } })} label={INFO[kind].name} />
          </>
        ) : (
          <button className="btn ghost" disabled={busy} onClick={start}>{open ? "Open again" : "Connect"}</button>
        )}
      </div>
      {!connected && open && (
        <form className={kind === "linear" ? "inline-form" : "stack-form"} onSubmit={submit}>
          {kind === "linear" ? (
            <input {...field("apiKey")} type="password" placeholder="Paste the key from Linear" autoComplete="off" autoFocus />
          ) : (
            <>
              <input {...field("site")} placeholder="Your site, like acme.atlassian.net" autoComplete="off" autoFocus />
              <input {...field("email")} type="email" placeholder="Email you sign in with" autoComplete="off" />
              <input {...field("token")} type="password" placeholder="Paste the API token" autoComplete="off" />
            </>
          )}
          <button className="btn primary" disabled={!ready || busy}>{busy ? "Checking" : "Link"}</button>
        </form>
      )}
      {!connected && open && (
        <p className="hint">{kind === "linear"
          ? "Linear opened in your browser. Create a personal API key (read is enough), then paste it here once."
          : "Atlassian opened in your browser. Create an API token, then paste your site, email and token here once."}</p>
      )}
      {error && <div className="notice error">{error}</div>}
    </div>
  );
}

export function TrackerSources(props: { settings: Settings; save: (s: Settings) => Promise<Settings>; reports: SourceReport[] }) {
  const [trackers, setTrackers] = useState<Trackers>({ linear: null, jira: null });
  useEffect(() => { void window.penguin.trackersStatus().then(setTrackers); }, []);
  return (
    <>
      {(["linear", "jira"] as const).map((kind) => (
        <TrackerApp key={kind} kind={kind} trackers={trackers} setTrackers={setTrackers} settings={props.settings} save={props.save} report={props.reports.find((r) => r.id === kind)} />
      ))}
    </>
  );
}

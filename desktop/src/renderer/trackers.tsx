// Sources > Linear and Jira: issues assigned to the owner, with their own API
// keys, kept encrypted on this Mac and only sent to Linear or their Jira site.
import { useEffect, useState } from "react";
import type { Settings } from "../main/settings";
import type { SourceReport } from "../main/context/index";
import { BrandIcon, message, Toggle } from "./ui";

type Trackers = Awaited<ReturnType<typeof window.penguin.trackersStatus>>;
type Kind = "linear" | "jira";

const INFO: Record<Kind, { name: string; desc: string }> = {
  linear: { name: "Linear", desc: "Issues assigned to you: titles and statuses, with your own API key." },
  jira: { name: "Jira", desc: "Issues assigned to you: titles and statuses, with your own API token." },
};

function TrackerSource({ kind, trackers, setTrackers, settings, save, report }: {
  kind: Kind; trackers: Trackers; setTrackers: (t: Trackers) => void;
  settings: Settings; save: (s: Settings) => Promise<Settings>; report?: SourceReport;
}) {
  const [form, setForm] = useState({ apiKey: "", site: "", email: "", token: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const connected = trackers[kind];
  const on = settings.sources[kind];
  const run = (fn: () => Promise<Trackers>) => { setBusy(true); setError(""); fn().then(setTrackers).catch((e) => setError(message(e))).finally(() => setBusy(false)); };
  const field = (k: keyof typeof form) => ({ value: form[k], onChange: (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [k]: e.target.value }) });
  const ready = kind === "linear" ? !!form.apiKey.trim() : !!(form.site.trim() && form.email.trim() && form.token.trim());
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const input = form;
    setForm({ ...form, apiKey: "", token: "" });
    run(() => window.penguin.trackersConnect(kind, input));
  };

  return (
    <div className="row-card column">
      <div className="row-head">
        <BrandIcon id={kind} />
        <div className="row-main">
          <strong>{INFO[kind].name}</strong>
          <p>{INFO[kind].desc}</p>
          {connected && <p>Connected as {connected.who}{"site" in connected ? ` on ${connected.site.replace(/^https:\/\//, "")}` : ""}. The key is encrypted on this Mac.</p>}
          {connected && on && report && <p className={report.ok ? "ok" : "warn"}>{report.ok ? "✓ " : "! "}{report.summary}{report.hint ? ` · ${report.hint}` : ""}</p>}
        </div>
        {connected && <button className="btn link" disabled={busy} onClick={() => run(() => window.penguin.trackersDisconnect(kind))}>Disconnect</button>}
        {connected && <Toggle on={on} onChange={(v) => void save({ ...settings, sources: { ...settings.sources, [kind]: v } })} label={INFO[kind].name} />}
      </div>
      {!connected && (
        <form className={kind === "linear" ? "inline-form" : "stack-form"} onSubmit={submit}>
          {kind === "linear" ? (
            <input {...field("apiKey")} type="password" placeholder="Linear personal API key" autoComplete="off" />
          ) : (
            <>
              <input {...field("site")} placeholder="Jira site, like acme.atlassian.net" autoComplete="off" />
              <input {...field("email")} type="email" placeholder="Email you sign in to Jira with" autoComplete="off" />
              <input {...field("token")} type="password" placeholder="Atlassian API token" autoComplete="off" />
            </>
          )}
          <button className="btn ghost" disabled={!ready || busy}>{busy ? "Checking" : "Connect"}</button>
        </form>
      )}
      {!connected && (
        <p className="hint">{kind === "linear"
          ? "In Linear: Settings, Security & access, Personal API keys. Read access is enough."
          : "Make a token at id.atlassian.com, Security, API tokens."}</p>
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
        <TrackerSource key={kind} kind={kind} trackers={trackers} setTrackers={setTrackers} settings={props.settings} save={props.save} report={props.reports.find((r) => r.id === kind)} />
      ))}
    </>
  );
}

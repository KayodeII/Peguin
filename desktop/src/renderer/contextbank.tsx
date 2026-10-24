// #context-bank: everything Peguin has gathered about the owner's work, so they
// can see exactly what it knows: activity from every source, today on this Mac,
// the facts it answers from, their voice and recaps.
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ContextBank } from "../main/contextBank";
import { BrandIcon, Icon, message } from "./ui";

const SOURCE: Record<string, string> = { git: "Git", github: "GitHub", claude_code: "Claude Code", mac: "On this Mac" };
const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
const day = (iso: string) => {
  const d = new Date(iso), t = new Date(); t.setHours(0, 0, 0, 0);
  const diff = Math.round((t.getTime() - new Date(d).setHours(0, 0, 0, 0)) / 86_400_000);
  return diff === 0 ? "Today" : diff === 1 ? "Yesterday" : d.toLocaleDateString([], { weekday: "long", day: "numeric", month: "short" });
};
const mins = (m: number) => (m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ""}`);

export function ContextBankView({ goSources, goSettings }: { goSources: () => void; goSettings: () => void }) {
  const [bank, setBank] = useState<ContextBank | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [only, setOnly] = useState<string>("all");
  const load = useCallback(() => {
    setBusy(true); setError("");
    window.penguin.contextBank().then(setBank, (e: unknown) => setError(message(e))).finally(() => setBusy(false));
  }, []);
  useEffect(load, [load]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const a of bank?.activity ?? []) c[a.source] = (c[a.source] ?? 0) + 1;
    return c;
  }, [bank]);
  const shown = (bank?.activity ?? []).filter((a) => only === "all" || a.source === only);
  const byDay = shown.reduce<[string, typeof shown][]>((out, a) => {
    const d = day(a.at), last = out[out.length - 1];
    if (last && last[0] === d) last[1].push(a); else out.push([d, [a]]);
    return out;
  }, []);

  return (
    <>
      <header className="channel-head">
        <Icon name="hash" size={22} /><h1>context-bank</h1>
        <span className="divider" /><p>What Peguin knows about your work</p>
        <div className="head-actions"><button className="btn ghost" disabled={busy} onClick={load}><Icon name="refresh" size={16} />{busy ? "Gathering" : "Refresh"}</button></div>
      </header>
      <div className="scroll narrow bank">
        {error && <div className="notice error">{error}</div>}
        {!bank && busy && <p className="hint">Gathering what Peguin knows…</p>}
        {bank && (
          <>
            <div className="bank-stats">
              <Stat n={bank.activity.length} label="things you worked on" sub={`since ${day(bank.since).toLowerCase()}`} />
              <Stat n={bank.today ? bank.today.length : "Off"} label="windows today" sub="on this Mac" onClick={bank.today ? undefined : goSources} />
              <Stat n={bank.facts.length} label="facts for questions" sub={bank.factsAt ? `prepared ${day(bank.factsAt).toLowerCase()}` : "prepare an update"} />
              <Stat n={bank.voice.sampleSeconds ? `${bank.voice.sampleSeconds}s` : "None"} label="of your voice" sub={bank.voice.clipsWaiting ? `${bank.voice.clipsWaiting} clips to review` : "sample"} onClick={goSettings} />
              <Stat n={bank.recaps} label="meeting recaps" sub="kept on this Mac" />
            </div>

            <h3 className="section-label">On this Mac today</h3>
            {bank.today === null ? (
              <div className="row-card"><BrandIcon id="mac" /><div className="row-main"><strong>The work log is off</strong><p>Turn on “On this Mac” in Sources and Peguin notes the app and window you're in every few minutes, so it knows where your day went.</p></div><button className="btn ghost" onClick={goSources}>Open Sources</button></div>
            ) : bank.today.length ? (
              <div className="bank-bars">
                {bank.today.map((st) => {
                  const max = bank.today![0]!.minutes;
                  return (
                    <div key={`${st.app}${st.title}`} className="bank-bar">
                      <span className="bar-label"><strong>{st.app}</strong>{st.title && <> · {st.title}</>}</span>
                      <span className="bar-track"><i style={{ width: `${Math.max(4, (st.minutes / max) * 100)}%` }} /></span>
                      <span className="bar-value">{mins(st.minutes)}</span>
                    </div>
                  );
                })}
              </div>
            ) : <p className="hint">Nothing noted yet today. Peguin skips the time you're away from the keyboard.</p>}

            <h3 className="section-label">Your work</h3>
            <div className="chips" role="radiogroup" aria-label="Show">
              {["all", ...Object.keys(counts)].map((id) => (
                <button key={id} role="radio" aria-checked={only === id} className={`chip ${only === id ? "on" : ""}`} onClick={() => setOnly(id)}>
                  {id === "all" ? `Everything ${bank.activity.length}` : `${SOURCE[id] ?? id} ${counts[id]}`}
                </button>
              ))}
            </div>
            {bank.reports.filter((r) => !r.ok).map((r) => <p key={r.id} className="warn">! {SOURCE[r.id] ?? r.id}: {r.summary}{r.hint ? ` · ${r.hint}` : ""}</p>)}
            {byDay.length ? byDay.map(([d, items]) => (
              <section key={d} className="bank-day">
                <h4>{d}</h4>
                <ul>
                  {items.map((a, i) => (
                    <li key={i}>
                      <BrandIcon id={a.source} size={22} />
                      <span className="bank-title">{a.title}</span>
                      {a.status && <span className="tag">{a.status}</span>}
                      <time>{time(a.at)}</time>
                    </li>
                  ))}
                </ul>
              </section>
            )) : <p className="hint">Nothing from your sources yet. Check Sources to see what's connected.</p>}

            <h3 className="section-label">Facts Peguin answers from</h3>
            {bank.facts.length
              ? <ul className="bank-facts">{bank.facts.map((f, i) => <li key={i}>{f}</li>)}</ul>
              : <p className="hint">None yet. They're written with your next update (Today, Prepare).</p>}
            <p className="hint bank-note">All of this stays on your Mac. When Peguin writes your update, the titles and times above go to the AI you chose in Settings, never your code or window contents.</p>
          </>
        )}
      </div>
    </>
  );
}

function Stat({ n, label, sub, onClick }: { n: number | string; label: string; sub: string; onClick?: () => void }) {
  const body = <><strong>{n}</strong><span>{label}</span><small>{sub}</small></>;
  return onClick ? <button className="bank-stat link" onClick={onClick}>{body}</button> : <div className="bank-stat">{body}</div>;
}

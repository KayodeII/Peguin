// Settings > Calendars: where Peguin looks for standups. Google Calendar,
// Outlook and Calendly connect with one click (the browser asks for
// permission); the Mac's Calendar covers any account added to macOS; a
// private calendar link is the fallback. The words that make a meeting a
// standup are the owner's. A live preview shows what Peguin would join.
import { useCallback, useEffect, useState } from "react";
import type { Settings } from "../main/settings";
import { BrandIcon, dayTime, message, Toggle } from "./ui";

type Provider = "google" | "microsoft" | "calendly";
type Status = {
  mac: { on: boolean; access: string };
  accounts: { id: string; provider: Provider; account: string }[];
  providers: Provider[];
  links: string[];
  calendlyToken: boolean;
};
type Upcoming = {
  standups: { id: string; title: string; start: number; url: string; platform: string; calendar: string }[];
  others: { title: string; start: number; calendar: string }[];
  errors: { source: string; message: string }[];
};

const PROVIDERS: { id: Provider; name: string; icon: string; blurb: string }[] = [
  { id: "google", name: "Google Calendar", icon: "google_calendar", blurb: "Meetings on your Google calendar. Read-only." },
  { id: "microsoft", name: "Outlook", icon: "outlook", blurb: "Outlook and Microsoft 365 calendars. Read-only." },
  { id: "calendly", name: "Calendly", icon: "calendly", blurb: "Meetings booked through your Calendly." },
];
const SOURCE: Record<string, string> = { mac: "Mac Calendar", ics: "Calendar link", google: "Google Calendar", microsoft: "Outlook", calendly: "Calendly" };

export function CalendarSettings({ settings, save }: { settings: Settings; save: (s: Settings) => Promise<Settings> }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [up, setUp] = useState<Upcoming | null>(null);
  const [link, setLink] = useState("");
  const [word, setWord] = useState("");
  const [busy, setBusy] = useState("");
  const [waiting, setWaiting] = useState<Provider | null>(null);
  const [error, setError] = useState("");

  const refresh = useCallback((fresh = false) => {
    void window.penguin.calendarStatus().then(setStatus);
    void window.penguin.calendarUpcoming(fresh).then(setUp).catch(() => setUp(null));
  }, []);
  useEffect(() => { refresh(); }, [refresh, settings.calendar]);
  // A connection finishes in the browser and comes back through peguin://.
  useEffect(() => window.penguin.onEvent((raw) => {
    const e = raw as { kind: string; error?: string };
    if (e.kind !== "calendar") return;
    setWaiting(null);
    setError(e.error ?? "");
    refresh(true);
  }), [refresh]);

  const run = (label: string, fn: () => Promise<unknown>) => {
    setBusy(label); setError("");
    fn().catch((e) => setError(message(e))).finally(() => { setBusy(""); refresh(true); });
  };
  const connect = (p: Provider) => {
    setError(""); setWaiting(p);
    window.penguin.calendarConnect(p).catch((e: unknown) => { setWaiting(null); setError(message(e)); });
  };
  const setCalendar = (c: Partial<Settings["calendar"]>) => run("save", () => save({ ...settings, calendar: { ...settings.calendar, ...c } }));
  const words = settings.calendar.words;
  const addWord = (w: string) => { const t = w.trim(); if (t && !words.some((x) => x.toLowerCase() === t.toLowerCase())) setCalendar({ words: [...words, t] }); };

  if (!status) return null;
  const access = status.mac.access;
  const anyConnected = status.mac.on || status.accounts.length > 0 || status.links.length > 0 || status.calendlyToken;
  const offered = PROVIDERS.filter((p) => status.providers.includes(p.id) || status.accounts.some((a) => a.provider === p.id));

  return (
    <div className="calendars">
      <div className="row-card">
        <div className="row-main">
          <strong>Find standups in my calendars</strong>
          <p>{settings.calendar.enabled ? "On. Peguin joins the next standup it finds; the time above is the fallback." : "Off. Peguin uses the link and time above."}</p>
        </div>
        <Toggle on={settings.calendar.enabled} onChange={(v) => setCalendar({ enabled: v })} label="Find standups in my calendars" />
      </div>

      {offered.map((p) => {
        const mine = status.accounts.filter((a) => a.provider === p.id);
        const canConnect = status.providers.includes(p.id);
        return (
          <div key={p.id} className="row-card column">
            <div className="row-head">
              <BrandIcon id={p.icon} size={28} />
              <div className="row-main">
                <strong>{p.name}</strong>
                <p>{waiting === p.id ? "Finish in your browser, then come back here." : mine.length ? "Connected." : p.blurb}</p>
              </div>
              {canConnect && (
                <button className={mine.length ? "btn link" : "btn ghost"} disabled={!!busy || (!!waiting && waiting !== p.id)} onClick={() => connect(p.id)}>
                  {waiting === p.id ? "Try again" : mine.length ? "Add another" : "Connect"}
                </button>
              )}
            </div>
            {mine.map((a) => (
              <div key={a.id} className="link-row">
                <span>{a.account}</span>
                <button className="btn link" disabled={!!busy} onClick={() => run(a.id, () => window.penguin.calendarDisconnect(a.id))}>Disconnect</button>
              </div>
            ))}
          </div>
        );
      })}

      <div className="row-card">
        <BrandIcon id="apple_calendar" size={28} />
        <div className="row-main">
          <strong>Mac Calendar</strong>
          <p>{status.mac.on && access === "authorized" ? "Connected. Reads every account added to this Mac."
            : access === "denied" || access === "restricted" ? "Not allowed. Turn on Peguin in System Settings, Privacy & Security, Calendars."
            : access === "unavailable" ? "The calendar reader is missing from this install."
            : "Every account added in System Settings, Internet Accounts, including iCloud."}</p>
        </div>
        {status.mac.on && access === "authorized"
          ? <button className="btn link" disabled={!!busy} onClick={() => run("mac", () => window.penguin.calendarMacDisconnect())}>Disconnect</button>
          : <button className="btn ghost" disabled={!!busy || access === "unavailable"} onClick={() => run("mac", () => window.penguin.calendarMacConnect())}>{busy === "mac" ? "Waiting for macOS" : "Connect"}</button>}
      </div>

      {status.calendlyToken && (
        <div className="row-card">
          <BrandIcon id="calendly" size={28} />
          <div className="row-main">
            <strong>Calendly (access token)</strong>
            <p>Connected with a token from before. It keeps working; you can connect Calendly above instead.</p>
          </div>
          <button className="btn link" disabled={!!busy} onClick={() => run("calendly-token", () => window.penguin.calendarRemoveCalendlyToken())}>Remove</button>
        </div>
      )}

      <details className="row-card column advanced" open={status.links.length > 0}>
        <summary>
          <BrandIcon id="calendar_link" size={28} />
          <div className="row-main">
            <strong>Calendar link</strong>
            <p>For any other calendar: paste its private iCal address.</p>
          </div>
        </summary>
        {status.links.map((l, i) => (
          <div key={i} className="link-row">
            <span className="mono">{l}</span>
            <button className="btn link" disabled={!!busy} onClick={() => run("link", () => window.penguin.calendarRemoveLink(i))}>Remove</button>
          </div>
        ))}
        <form className="inline-form" onSubmit={(e) => { e.preventDefault(); const l = link; setLink(""); run("link", () => window.penguin.calendarAddLink(l)); }}>
          <input value={link} type="url" placeholder="https://… or webcal://…" onChange={(e) => setLink(e.target.value)} />
          <button className="btn ghost" disabled={!link.trim() || !!busy}>Add</button>
        </form>
      </details>

      <div className="words">
        <strong>A meeting is a standup when its title has</strong>
        <div className="chips-row">
          {words.map((w) => (
            <span key={w} className="word-chip">{w}<button aria-label={`Remove ${w}`} onClick={() => setCalendar({ words: words.filter((x) => x !== w) })}>×</button></span>
          ))}
          <form onSubmit={(e) => { e.preventDefault(); addWord(word); setWord(""); }}>
            <input value={word} placeholder="Add a word" maxLength={40} onChange={(e) => setWord(e.target.value)} />
          </form>
        </div>
      </div>

      {anyConnected && up && (
        <div className="upcoming">
          <div className="upcoming-head">
            <strong>Coming up</strong>
            <button className="btn link" disabled={!!busy} onClick={() => refresh(true)}>Check again</button>
          </div>
          {up.standups.length === 0 && <p className="muted-line">No standups in the next 7 days with a Meet, Zoom or Teams link.</p>}
          {up.standups.slice(0, 4).map((x) => (
            <div key={x.id} className="up-row">
              <BrandIcon id={x.platform} size={22} />
              <div className="row-main"><strong>{x.title}</strong><p>{dayTime(new Date(x.start).toISOString())} · {x.calendar}</p></div>
            </div>
          ))}
          {up.others.length > 0 && (
            <>
              <p className="muted-line other-head">Other meetings with a link</p>
              {up.others.map((o, i) => (
                <div key={i} className="up-row muted">
                  <div className="row-main"><strong>{o.title || "Untitled"}</strong><p>{dayTime(new Date(o.start).toISOString())} · {o.calendar}</p></div>
                  {o.title && <button className="btn link" onClick={() => addWord(o.title)}>Count as standup</button>}
                </div>
              ))}
            </>
          )}
          {up.errors.map((e, i) => <div key={i} className="notice error">{SOURCE[e.source] ?? e.source}: {e.message}</div>)}
        </div>
      )}
      {error && <div className="notice error">{error}</div>}
    </div>
  );
}

// Settings > Calendars: where Peguin looks for standups. The Mac's Calendar
// (any account added to macOS), private calendar links (Google, Outlook,
// iCloud) and Calendly. The words that make a meeting a standup are the
// owner's. A live preview shows what Peguin would join.
import { useCallback, useEffect, useState } from "react";
import type { Settings } from "../main/settings";
import { BrandIcon, dayTime, message, Toggle } from "./ui";

type Status = { mac: { on: boolean; access: string }; links: string[]; calendly: boolean };
type Upcoming = {
  standups: { id: string; title: string; start: number; url: string; platform: string; calendar: string }[];
  others: { title: string; start: number; calendar: string }[];
  errors: { source: string; message: string }[];
};

const SOURCE: Record<string, string> = { mac: "Mac Calendar", ics: "Calendar link", calendly: "Calendly" };

export function CalendarSettings({ settings, save }: { settings: Settings; save: (s: Settings) => Promise<Settings> }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [up, setUp] = useState<Upcoming | null>(null);
  const [link, setLink] = useState("");
  const [token, setToken] = useState("");
  const [word, setWord] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const refresh = useCallback((fresh = false) => {
    void window.penguin.calendarStatus().then(setStatus);
    void window.penguin.calendarUpcoming(fresh).then(setUp).catch(() => setUp(null));
  }, []);
  useEffect(() => { refresh(); }, [refresh, settings.calendar]);

  const run = (label: string, fn: () => Promise<unknown>) => {
    setBusy(label); setError("");
    fn().catch((e) => setError(message(e))).finally(() => { setBusy(""); refresh(true); });
  };
  const setCalendar = (c: Partial<Settings["calendar"]>) => run("save", () => save({ ...settings, calendar: { ...settings.calendar, ...c } }));
  const words = settings.calendar.words;
  const addWord = (w: string) => { const t = w.trim(); if (t && !words.some((x) => x.toLowerCase() === t.toLowerCase())) setCalendar({ words: [...words, t] }); };

  if (!status) return null;
  const access = status.mac.access;
  const anyConnected = status.mac.on || status.links.length > 0 || status.calendly;

  return (
    <div className="calendars">
      <div className="row-card">
        <div className="row-main">
          <strong>Find standups in my calendars</strong>
          <p>{settings.calendar.enabled ? "On. Peguin joins the next standup it finds; the time above is the fallback." : "Off. Peguin uses the link and time above."}</p>
        </div>
        <Toggle on={settings.calendar.enabled} onChange={(v) => setCalendar({ enabled: v })} label="Find standups in my calendars" />
      </div>

      <div className="row-card">
        <BrandIcon id="apple_calendar" size={28} />
        <div className="row-main">
          <strong>Mac Calendar</strong>
          <p>{status.mac.on && access === "authorized" ? "Connected. Reads every account added to this Mac."
            : access === "denied" || access === "restricted" ? "Not allowed. Turn on Peguin in System Settings, Privacy & Security, Calendars."
            : access === "unavailable" ? "The calendar reader is missing from this install."
            : "Google, Outlook and iCloud accounts added in System Settings, Internet Accounts."}</p>
        </div>
        {status.mac.on && access === "authorized"
          ? <button className="btn link" disabled={!!busy} onClick={() => run("mac", () => window.penguin.calendarMacDisconnect())}>Disconnect</button>
          : <button className="btn ghost" disabled={!!busy || access === "unavailable"} onClick={() => run("mac", () => window.penguin.calendarMacConnect())}>{busy === "mac" ? "Waiting for macOS" : "Connect"}</button>}
      </div>

      <div className="row-card column">
        <div className="row-head">
          <BrandIcon id="google_calendar" size={28} />
          <div className="row-main">
            <strong>Calendar links</strong>
            <p>The private iCal address of a calendar that isn't on this Mac. Google: calendar settings, "Secret address in iCal format". Outlook: Settings, Calendar, Shared calendars, Publish. iCloud: share the calendar publicly.</p>
          </div>
        </div>
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
      </div>

      <div className="row-card column">
        <div className="row-head">
          <BrandIcon id="calendly" size={28} />
          <div className="row-main">
            <strong>Calendly</strong>
            <p>{status.calendly ? "Connected." : "Meetings booked through your Calendly. Make a personal access token in Calendly, Integrations, API and webhooks."}</p>
          </div>
          {status.calendly && <button className="btn link" disabled={!!busy} onClick={() => run("calendly", () => window.penguin.calendarSetCalendly(null))}>Disconnect</button>}
        </div>
        {!status.calendly && (
          <form className="inline-form" onSubmit={(e) => { e.preventDefault(); const t = token; setToken(""); run("calendly", () => window.penguin.calendarSetCalendly(t)); }}>
            <input value={token} type="password" placeholder="Personal access token" autoComplete="off" onChange={(e) => setToken(e.target.value)} />
            <button className="btn ghost" disabled={!token.trim() || !!busy}>Connect</button>
          </form>
        )}
      </div>

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

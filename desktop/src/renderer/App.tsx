import { useCallback, useEffect, useState } from "react";
import type { Account, Update } from "../main/account";
import type { Draft } from "../main/brain";
import type { AppEvent } from "../main/index";
import { botName } from "../main/meeting/platform";
import type { MeetingEvent, MeetingStatus } from "../main/meeting/runner";
import type { Settings } from "../main/settings";
import { Avatar, Icon, Logo, message } from "./ui";
import { LiveView, Onboarding, SettingsView, SourcesView, TodayView } from "./views";
import { RecapsView } from "./recaps";
import type { MeetingRecord } from "../main/meeting/record";

export type View = "today" | "live" | "recaps" | "sources" | "settings";
const NAV: { id: View; label: string; icon: string; channel: string }[] = [
  { id: "today", label: "Today", icon: "today", channel: "today" },
  { id: "live", label: "Live meeting", icon: "live", channel: "live-meeting" },
  { id: "recaps", label: "Recaps", icon: "recaps", channel: "recaps" },
  { id: "sources", label: "Sources", icon: "sources", channel: "sources" },
];
const VIEWS: View[] = ["today", "live", "recaps", "sources", "settings"];

export type DraftState = { draft: Draft | null; preparing: boolean; error?: string };
export type LiveState = { status: MeetingStatus; detail?: string; events: MeetingEvent[] };

export function App() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [view, setView] = useState<View>(() => (VIEWS.includes(location.hash.slice(1) as View) ? location.hash.slice(1) as View : "today"));
  const [meetings, setMeetings] = useState<MeetingRecord[]>([]);
  const reloadMeetings = useCallback(() => { void window.penguin.meetings().then(setMeetings); }, []);
  const openFollowUps = meetings.reduce((n, m) => n + (m.recap?.followUps.filter((f) => !f.done).length ?? 0), 0);
  const [draft, setDraft] = useState<DraftState>({ draft: null, preparing: false });
  const [live, setLive] = useState<LiveState>({ status: "ended", events: [] });
  const [next, setNext] = useState<{ label: string; title?: string } | null>(null);
  const [toast, setToast] = useState("");
  const [account, setAccount] = useState<Account | null>(null);
  const [model, setModel] = useState<{ progress: number; error?: string } | null>(null);
  const [update, setUpdate] = useState<Update | null>(null);
  const [updateState, setUpdateState] = useState<{ version: string; status: "downloading" | "ready" | "failed"; progress: number; error?: string } | null>(null);

  const refreshNext = useCallback(() => { void window.penguin.nextStandup().then(setNext); }, []);

  useEffect(() => {
    void window.penguin.getSettings().then(setSettings);
    void window.penguin.getDraft().then((d: DraftState) => setDraft(d));
    void window.penguin.getAccount().then(setAccount);
    void window.penguin.getUpdate().then(setUpdate);
    void window.penguin.updateState().then(setUpdateState);
    refreshNext();
    reloadMeetings();
    return window.penguin.onEvent((raw) => {
      const e = raw as AppEvent;
      if (e.kind === "recaps") reloadMeetings();
      if (e.kind === "show" && VIEWS.includes(e.view as View)) setView(e.view as View);
      if (e.kind === "draft") setDraft({ draft: e.draft, preparing: e.preparing, error: e.error });
      if (e.kind === "log") setToast(e.text);
      if (e.kind === "account") { setAccount(e.account); if (e.error) setToast(e.error); }
      if (e.kind === "update") setUpdate(e.update);
      if (e.kind === "update-state") setUpdateState(e.state);
      if (e.kind === "model") setModel(e.progress >= 1 && !e.error ? null : { progress: e.progress, error: e.error });
      if (e.kind === "meeting") {
        setLive((prev) => ({
          status: e.event.kind === "status" ? e.event.status : prev.status,
          detail: e.event.kind === "status" ? e.event.detail : prev.detail,
          events: [...prev.events.slice(-150), e.event],
        }));
        if (e.event.kind === "status" && e.event.status === "joining") setView("live");
      }
    });
  }, [refreshNext, reloadMeetings]);

  // Calendars change on their own (and are connected outside the save flow), so check now and then.
  useEffect(() => { const t = setInterval(refreshNext, 3 * 60_000); return () => clearInterval(t); }, [refreshNext]);
  useEffect(() => { if (view === "settings") return; refreshNext(); }, [view, refreshNext]);

  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(""), 4000); return () => clearTimeout(t); }, [toast]);

  // Theme: "system" follows the OS between Notion light and dark.
  const theme = settings?.appearance.theme ?? "system";
  const accent = settings?.appearance.accent ?? "blue";
  useEffect(() => {
    const media = matchMedia("(prefers-color-scheme: dark)");
    const apply = () => { document.documentElement.dataset.theme = theme === "system" ? (media.matches ? "dark" : "light") : theme; };
    apply();
    document.documentElement.dataset.accent = accent;
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [theme, accent]);

  if (!settings) return <div className="boot"><Logo size={48} /></div>;

  const save = async (s: Settings) => {
    const saved: Settings = await window.penguin.saveSettings(s);
    setSettings(saved); refreshNext();
    return saved;
  };
  const prepare = () => window.penguin.prepareDraft().catch((e: unknown) => setToast(message(e)));
  const inCall = live.status === "in_call" || live.status === "joining" || live.status === "waiting";
  const statusLine = inCall ? (live.status === "in_call" ? "In your standup" : "Joining a meeting")
    : draft.preparing ? "Writing your update" : next ? next.label : "No standup set";

  return (
    <div className="app">
      <nav className="rail" aria-label="Sections">
        <button className={`home ${view === "today" ? "active" : ""}`} onClick={() => setView("today")} title="Peguin" aria-label="Today"><Logo /></button>
        <div className="rail-sep" />
        {NAV.filter((n) => n.id !== "today").map((n) => (
          <button key={n.id} className={`rail-btn ${view === n.id ? "active" : ""}`} onClick={() => setView(n.id)} title={n.label} aria-label={n.label}>
            <Icon name={n.icon} />
            {n.id === "live" && inCall && <span className="badge" />}
            {n.id === "recaps" && openFollowUps > 0 && <span className="badge count-badge">{openFollowUps}</span>}
          </button>
        ))}
      </nav>

      <aside className="sidebar">
        <header className="sidebar-head">Peguin</header>
        <div className="sidebar-body">
          <p className="side-label">Workspace</p>
          {NAV.map((n) => (
            <button key={n.id} className={`channel ${view === n.id ? "active" : ""}`} onClick={() => setView(n.id)}>
              <Icon name="hash" size={18} />{n.channel}
              {n.id === "recaps" && openFollowUps > 0 && <span className="count">{openFollowUps}</span>}
              {n.id === "live" && inCall && <span className="live-pill">LIVE</span>}
            </button>
          ))}
          {update && (
            <>
              <p className="side-label">Update</p>
              <div className="side-card">
                {updateState?.version === update.version && updateState.status === "ready" ? <>
                  <strong>Peguin {update.version} is ready</strong>
                  <button className="btn primary small" onClick={() => window.penguin.installUpdate().catch((e: unknown) => setToast(message(e)))}>Restart to update</button>
                  <span>Or it installs next time you quit.</span>
                </> : updateState?.version === update.version && updateState.status === "downloading" ? <>
                  <strong>Getting Peguin {update.version}</strong>
                  <div className="progress"><i style={{ width: `${Math.round(updateState.progress * 100)}%` }} /></div>
                </> : <>
                  <strong>Peguin {update.version} is out</strong>
                  {updateState?.status === "failed" && <span className="warn">{updateState.error}</span>}
                  <button className="link" onClick={() => void window.penguin.openUpdate()}>Download the update</button>
                </>}
              </div>
            </>
          )}
          {model && (
            <>
              <p className="side-label">Speech recognition</p>
              <div className="side-card">
                {model.error ? <span className="warn">{model.error}</span> : <>
                  <strong>Downloading {Math.round(model.progress * 100)}%</strong>
                  <div className="progress"><i style={{ width: `${Math.round(model.progress * 100)}%` }} /></div>
                  <span>One time, about 150 MB</span>
                </>}
              </div>
            </>
          )}
          <p className="side-label">Next standup</p>
          <div className="side-card">
            {next
              ? <><strong>{next.label}</strong>{next.title && <span className="side-title">{next.title}</span>}<span>{settings.standup.auto ? "Auto-join on" : "Auto-join off"}</span></>
              : settings.standup.url || settings.calendar.enabled
                ? <><strong>Not scheduled</strong><span>{settings.calendar.enabled ? "No standup found in your calendars" : "Check your standup days"}</span></>
                : <><strong>None set</strong><button className="link" onClick={() => setView("settings")}>Add standup</button></>}
          </div>
        </div>
        <footer className="userbar">
          <Avatar name={settings.displayName} />
          <div className="who"><strong>{settings.displayName || "Your name"}</strong><span className={inCall ? "online" : ""}>{statusLine}</span></div>
          <button className={`icon-btn ${view === "settings" ? "on" : ""}`} onClick={() => setView("settings")} title="Settings" aria-label="Settings"><Icon name="settings" size={18} /></button>
        </footer>
      </aside>

      <main className="content">
        {view === "today" && <TodayView settings={settings} draft={draft} prepare={prepare} goSources={() => setView("sources")} />}
        {view === "live" && <LiveView settings={settings} live={live} join={(u) => window.penguin.join(u).catch((e: unknown) => setToast(message(e)))} leave={() => void window.penguin.leave()}
          copilot={(u) => window.penguin.copilotStart(u).catch((e: unknown) => setToast(message(e)))} />}
        {view === "sources" && <SourcesView settings={settings} draft={draft.draft} save={save} prepare={prepare} />}
        {view === "recaps" && <RecapsView meetings={meetings} reload={reloadMeetings} keepDays={settings.recap.keepDays} />}
        {view === "settings" && <SettingsView settings={settings} save={save} preview={(n) => botName(n, "google_meet")} account={account} />}
      </main>

      {!settings.onboarded && <Onboarding settings={settings} save={save} done={() => { void prepare(); setView("today"); }} />}
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}

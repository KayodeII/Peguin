import { useCallback, useEffect, useState } from "react";
import type { Account } from "../main/account";
import type { Draft } from "../main/brain";
import type { AppEvent } from "../main/index";
import { botName } from "../main/meeting/platform";
import type { MeetingEvent, MeetingStatus } from "../main/meeting/runner";
import type { Settings } from "../main/settings";
import { Avatar, Icon, Logo, message } from "./ui";
import { LiveView, Onboarding, SettingsView, SourcesView, TodayView } from "./views";

export type View = "today" | "live" | "sources" | "settings";
const NAV: { id: View; label: string; icon: string }[] = [
  { id: "today", label: "Today", icon: "today" },
  { id: "live", label: "Live meeting", icon: "live" },
  { id: "sources", label: "Sources", icon: "sources" },
];

export type DraftState = { draft: Draft | null; preparing: boolean; error?: string };
export type LiveState = { status: MeetingStatus; detail?: string; events: MeetingEvent[] };

export function App() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [view, setView] = useState<View>(() => (["today", "live", "sources", "settings"].includes(location.hash.slice(1)) ? location.hash.slice(1) as View : "today"));
  const [draft, setDraft] = useState<DraftState>({ draft: null, preparing: false });
  const [live, setLive] = useState<LiveState>({ status: "ended", events: [] });
  const [next, setNext] = useState<{ label: string } | null>(null);
  const [toast, setToast] = useState("");
  const [account, setAccount] = useState<Account | null>(null);

  const refreshNext = useCallback(() => { void window.penguin.nextStandup().then(setNext); }, []);

  useEffect(() => {
    void window.penguin.getSettings().then(setSettings);
    void window.penguin.getDraft().then((d: DraftState) => setDraft(d));
    void window.penguin.getAccount().then(setAccount);
    refreshNext();
    return window.penguin.onEvent((raw) => {
      const e = raw as AppEvent;
      if (e.kind === "draft") setDraft({ draft: e.draft, preparing: e.preparing, error: e.error });
      if (e.kind === "log") setToast(e.text);
      if (e.kind === "account") { setAccount(e.account); if (e.error) setToast(e.error); }
      if (e.kind === "meeting") {
        setLive((prev) => ({
          status: e.event.kind === "status" ? e.event.status : prev.status,
          detail: e.event.kind === "status" ? e.event.detail : prev.detail,
          events: [...prev.events.slice(-150), e.event],
        }));
        if (e.event.kind === "status" && e.event.status === "joining") setView("live");
      }
    });
  }, [refreshNext]);

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
        <button className={`home ${view === "today" ? "active" : ""}`} onClick={() => setView("today")} title="Penguin" aria-label="Today"><Logo /></button>
        <div className="rail-sep" />
        {NAV.filter((n) => n.id !== "today").map((n) => (
          <button key={n.id} className={`rail-btn ${view === n.id ? "active" : ""}`} onClick={() => setView(n.id)} title={n.label} aria-label={n.label}>
            <Icon name={n.icon} />
            {n.id === "live" && inCall && <span className="badge" />}
          </button>
        ))}
      </nav>

      <aside className="sidebar">
        <header className="sidebar-head">Penguin</header>
        <div className="sidebar-body">
          <p className="side-label">Workspace</p>
          {NAV.map((n) => (
            <button key={n.id} className={`channel ${view === n.id ? "active" : ""}`} onClick={() => setView(n.id)}>
              <Icon name="hash" size={18} />{n.id === "today" ? "today" : n.id === "live" ? "live-meeting" : "sources"}
              {n.id === "live" && inCall && <span className="live-pill">LIVE</span>}
            </button>
          ))}
          <p className="side-label">Next standup</p>
          <div className="side-card">
            {settings.standup.url
              ? <><strong>{next?.label ?? "Not scheduled"}</strong><span>{settings.standup.auto ? "Auto-join on" : "Auto-join off"}</span></>
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
        {view === "live" && <LiveView settings={settings} live={live} join={(u) => window.penguin.join(u).catch((e: unknown) => setToast(message(e)))} leave={() => void window.penguin.leave()} />}
        {view === "sources" && <SourcesView settings={settings} draft={draft.draft} save={save} prepare={prepare} />}
        {view === "settings" && <SettingsView settings={settings} save={save} preview={(n) => botName(n, "google_meet")} account={account} />}
      </main>

      {!settings.onboarded && <Onboarding settings={settings} save={save} done={() => { void prepare(); setView("today"); }} />}
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}

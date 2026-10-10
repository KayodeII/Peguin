// The private copilot's panel: beside the owner's own meeting, visible only on
// their screen. The newest question and a suggested answer sit at the top;
// earlier ones and the running transcript below.
import { useEffect, useRef, useState } from "react";
import type { Settings } from "../main/settings";
import { COPILOT_LABELS } from "../../../src/core/brain/prompts";
import { Logo } from "./ui";

type Card = {
  id: number; question: string; at: number; answer?: string; error?: string;
  online?: "checking" | { answer: string; source?: string } | { error: string };
};
type Event =
  | { type: "status"; status: "joining" | "listening" | "ended"; detail?: string }
  | { type: "heard"; text: string; at: number }
  | { type: "card"; card: Card };

const time = (t: number) => new Date(t).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

export function CopilotPanel() {
  const [status, setStatus] = useState<{ status: string; detail?: string }>({ status: "joining", detail: "Opening your meeting…" });
  const [cards, setCards] = useState<Card[]>([]);
  const [heard, setHeard] = useState<{ text: string; at: number }[]>([]);
  const [tab, setTab] = useState<"notes" | "transcript">("notes");
  const end = useRef<HTMLDivElement>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [hidden, setHidden] = useState(false);
  // Work/Interview and Check online save straight away; the copilot reads them at each question.
  const setCopilot = (c: Partial<Settings["copilot"]>) => {
    if (!settings) return;
    const next = { ...settings, copilot: { ...settings.copilot, ...c } };
    setSettings(next);
    void window.penguin.saveSettings(next).then(setSettings);
  };
  const hide = (h: boolean) => { setHidden(h); void window.penguin.copilotCollapse(h); };

  // Same look as the main window.
  useEffect(() => {
    void window.penguin.getSettings().then((s: Settings) => {
      setSettings(s);
      const t = s.appearance.theme;
      document.documentElement.dataset.theme = t === "system" ? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light") : t;
      document.documentElement.dataset.accent = s.appearance.accent;
    });
  }, []);

  useEffect(() => {
    const off = window.penguin.onEvent((raw) => {
      const e = raw as { kind: string; event: Event };
      if (e.kind !== "copilot") return;
      const ev = e.event;
      if (ev.type === "status") setStatus(ev);
      if (ev.type === "heard") setHeard((h) => [...h.slice(-199), ev]);
      if (ev.type === "card") setCards((cs) => (cs.some((c) => c.id === ev.card.id) ? cs.map((c) => (c.id === ev.card.id ? ev.card : c)) : [...cs, ev.card]));
    });
    // Catch up on anything that happened before this page subscribed.
    void window.penguin.copilotState().then((st: { status: Event | null; heard: { text: string; at: number }[]; cards: Card[] } | null) => {
      if (!st) return;
      if (st.status && st.status.type === "status") setStatus(st.status);
      setHeard((h) => (h.length ? h : st.heard));
      setCards((cs) => (cs.length ? cs : st.cards));
    });
    return off;
  }, []);
  useEffect(() => { if (tab === "transcript") end.current?.scrollIntoView({ block: "end" }); }, [heard, tab]);

  const [now, ...earlier] = [...cards].reverse();
  if (hidden) {
    return (
      <div className="copilot">
        <aside className="cp-panel collapsed">
          <button className="cp-show" onClick={() => hide(false)} title="Show the copilot">
            <Logo size={22} />
            <span>Show</span>
            {cards.length > 0 && <i>{cards.length}</i>}
          </button>
        </aside>
      </div>
    );
  }
  return (
    <div className="copilot">
      <aside className="cp-panel">
        <header className="cp-head">
          <Logo size={22} />
          <div><strong>Peguin copilot</strong><span>Not sent to the call</span></div>
          <i className={`cp-dot ${status.status}`} title={status.status} />
          <button className="btn ghost cp-leave" onClick={() => hide(true)} title="Hide this panel; the meeting takes the space">Hide</button>
          <button className="btn ghost cp-leave" onClick={() => void window.penguin.copilotStop()} title="Leave the meeting and close this window">Leave</button>
        </header>
        {settings && (
          <div className="cp-controls">
            <div className="segmented small" role="radiogroup" aria-label="Kind of meeting">
              {([["work", "Work"], ["interview", "Interview"]] as const).map(([id, label]) => (
                <button key={id} role="radio" aria-checked={settings.copilot.mode === id} className={settings.copilot.mode === id ? "on" : ""} onClick={() => setCopilot({ mode: id })}>{label}</button>
              ))}
            </div>
            <label className="cp-web" title="After the quick answer, look general questions up on the web (about 15 seconds) and replace it">
              <input type="checkbox" checked={settings.copilot.web} onChange={(e) => setCopilot({ web: e.target.checked })} />
              Check online
            </label>
          </div>
        )}
        {status.detail && <p className="cp-status">{status.detail}</p>}
        <div className="cp-tabs" role="tablist">
          <button role="tab" aria-selected={tab === "notes"} className={tab === "notes" ? "on" : ""} onClick={() => setTab("notes")}>Notes{cards.length ? ` · ${cards.length}` : ""}</button>
          <button role="tab" aria-selected={tab === "transcript"} className={tab === "transcript" ? "on" : ""} onClick={() => setTab("transcript")}>Transcript</button>
        </div>
        <div className="cp-body">
          {tab === "notes" ? (
            <>
              {!now && <p className="cp-empty">When someone asks you something, a suggested answer from your notes shows up here. Peguin never answers for you in this mode.</p>}
              {now && <CardView card={now} fresh />}
              {earlier.map((c) => <CardView key={c.id} card={c} />)}
            </>
          ) : (
            <>
              {!heard.length && <p className="cp-empty">What others say appears here. Your own microphone isn't transcribed.</p>}
              {heard.map((h, i) => <p key={i} className="cp-line"><span>{time(h.at)}</span>{h.text}</p>)}
              <div ref={end} />
            </>
          )}
        </div>
      </aside>
    </div>
  );
}

const LABELS = (Object.entries(COPILOT_LABELS) as [keyof typeof COPILOT_LABELS, string][]).map(([kind, text]) => ({ kind, text }));

function CardView({ card, fresh }: { card: Card; fresh?: boolean }) {
  const thinking = !card.answer && !card.error;
  const label = card.answer ? LABELS.find((l) => card.answer!.startsWith(l.text)) : undefined;
  const outOfNotes = label?.kind === "unknown";
  return (
    <article className={`cp-card ${fresh ? "fresh" : ""} ${outOfNotes ? "unknown" : ""}`}>
      <p className="cp-q"><span>{time(card.at)}</span>“{card.question}”</p>
      {thinking && <p className="cp-a thinking">Thinking<i>.</i><i>.</i><i>.</i></p>}
      {card.online && typeof card.online === "object" && "answer" in card.online ? (
        <p className="cp-a"><span className="cp-label online">Checked online{card.online.source ? ` · ${card.online.source}` : ""}</span>{card.online.answer}</p>
      ) : card.answer && <p className="cp-a">{label && <span className={`cp-label ${label.kind}`}>{label.text.replace(/[:.]$/, "")}</span>}{label ? card.answer.slice(label.text.length).trim() : card.answer}</p>}
      {card.online === "checking" && <p className="cp-online">Checking online<i>.</i><i>.</i><i>.</i></p>}
      {card.online && typeof card.online === "object" && "error" in card.online && <p className="cp-online">Couldn't check online: {card.online.error}</p>}
      {card.error && <p className="cp-a error">{card.error}</p>}
    </article>
  );
}

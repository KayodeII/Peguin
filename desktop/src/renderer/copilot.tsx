// The private copilot's panel: beside the owner's own meeting, visible only on
// their screen. The newest question and a suggested answer sit at the top;
// earlier ones and the running transcript below.
import { useEffect, useRef, useState } from "react";
import type { Settings } from "../main/settings";
import { Logo } from "./ui";

type Card = { id: number; question: string; at: number; answer?: string; error?: string };
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

  // Same look as the main window.
  useEffect(() => {
    void window.penguin.getSettings().then((s: Settings) => {
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
  return (
    <div className="copilot">
      <aside className="cp-panel">
        <header className="cp-head">
          <Logo size={22} />
          <div><strong>Peguin copilot</strong><span>Only you can see this</span></div>
          <i className={`cp-dot ${status.status}`} title={status.status} />
          <button className="btn ghost cp-leave" onClick={() => void window.penguin.copilotStop()} title="Leave the meeting and close this window">Leave</button>
        </header>
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

function CardView({ card, fresh }: { card: Card; fresh?: boolean }) {
  const thinking = !card.answer && !card.error;
  const outOfNotes = card.answer?.startsWith("Not in your notes");
  return (
    <article className={`cp-card ${fresh ? "fresh" : ""} ${outOfNotes ? "unknown" : ""}`}>
      <p className="cp-q"><span>{time(card.at)}</span>“{card.question}”</p>
      {thinking && <p className="cp-a thinking">Thinking<i>.</i><i>.</i><i>.</i></p>}
      {card.answer && <p className="cp-a">{card.answer}</p>}
      {card.error && <p className="cp-a error">{card.error}</p>}
    </article>
  );
}

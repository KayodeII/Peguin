// "Join as me" in glass cards: the private copilot in the owner's own meeting.
// Every card shows something the app does today, including the AI notice
// everyone in the call sees; nothing here is hidden from the other people.
import { useEffect, useState } from "react";
import { Logo } from "../ui";

function Timer() {
  const [s, setS] = useState(10);
  useEffect(() => { const t = setInterval(() => setS((v) => (v + 1) % 3600), 1000); return () => clearInterval(t); }, []);
  return <div className="gl-timer">{String(Math.floor(s / 60)).padStart(2, "0")}:{String(s % 60).padStart(2, "0")}</div>;
}

const LINES = [
  { who: "Sarah", text: "Payments look stable since Tuesday." },
  { who: "Tomi", text: "Ada, when does the billing export ship?", ask: true },
];

function Bars({ n = 44 }: { n?: number }) {
  return (
    <div className="gl-bars" aria-hidden>
      {Array.from({ length: n }, (_, i) => <i key={i} style={{ animationDelay: `${(i % 11) * 0.09}s`, height: i < 12 ? "100%" : "28%" }} />)}
    </div>
  );
}

export function Copilot() {
  return (
    <div className="gl-wrap">
      <div className="section-head">
        <p className="eyebrow" data-reveal>Join as me · Pro</p>
        <h2 data-reveal>Your quiet partner in every meeting you join</h2>
        <p className="section-lead" data-reveal>Take the call in Peguin's window. It keeps up with the conversation, has an answer ready when you're asked, and hands you a recap after. Everyone is told an AI assistant is there.</p>
      </div>

      <div className="gl-grid two">
        <article className="gl-card brand" data-reveal>
          <h3>Peguin <span className="gl-chip light"><span className="gl-mini-bars" aria-hidden><i /><i /><i /></span>listens</span> in on the room</h3>
          <p>It follows the conversation as it happens, never your own mic, so it knows the moment a question lands on you.</p>
          <div className="gl-captions">
            <div className="gl-cap-head"><span className="gl-rec"><span />Live</span><Timer /></div>
            {LINES.map((l) => (
              <p key={l.text} className={l.ask ? "ask" : ""}><b>{l.who}</b>{l.text}{l.ask && <em>Question for you</em>}</p>
            ))}
            <Bars n={36} />
          </div>
        </article>

        <article className="gl-card" data-reveal>
          <h3>When you're on the spot, Peguin <span className="gl-chip">✦ whispers</span> the answer</h3>
          <p>A short line appears that only you can see, drawn from your own notes and marked with where it came from.</p>
          <div className="gl-panel dark">
            <div className="gl-panel-top"><Logo size={18} /><span>Peguin</span><span className="gl-only">Only you</span><span className="gl-hide">Hide</span></div>
            <p className="gl-asked">Tomi asked: when does the billing export ship?</p>
            <p className="gl-a"><span className="gl-src-tag">From your notes</span>It merged on Monday and goes out with Friday's release.</p>
            <div className="gl-labels"><span>From your notes</span><span>General knowledge</span><span>Not in your notes</span></div>
          </div>
        </article>
      </div>

      <div className="gl-grid three">
        <article className="gl-card soft" data-reveal>
          <div className="gl-pair">
            <div className="gl-win">
              <span className="gl-win-bar"><i /><i /><i />1 · Meeting chat</span>
              <div className="gl-chat"><b>Ada · to everyone</b><p>Heads-up: I'm using Peguin, an AI assistant, in this call.</p></div>
            </div>
            <span className="gl-first" aria-hidden>→</span>
            <div className="gl-win">
              <span className="gl-win-bar"><i /><i /><i />2 · Your screen</span>
              <div className="gl-note"><b>✦ Suggestion</b><p>Say the retry fix is merged; the rollout is Friday.</p></div>
            </div>
          </div>
          <h3>Private to you, honest with everyone</h3>
          <p>Peguin tells the room first, in the chat. Only then do your notes stay out of screen shares.</p>
        </article>

        <article className="gl-card soft" data-reveal>
          <div className="gl-panel">
            <p className="gl-small">Weekly sync · today</p>
            <div className="gl-tabs"><span className="on">Follow-ups</span><span>Summary</span><span>Transcript</span></div>
            <ul className="gl-list">
              <li>Follow up on: “When does the billing export ship?”</li>
              <li>Send Tomi the retry numbers</li>
              <li>Check the staging alert</li>
            </ul>
          </div>
          <h3>A recap the moment you hang up</h3>
          <p>What was asked of you, what was decided, and what to follow up on. Never your own voice, and kept encrypted on your Mac.</p>
        </article>

        <article className="gl-card soft" data-reveal>
          <div className="gl-panel">
            <div className="gl-seg"><span className="on">Work</span><span>Interview</span></div>
            <p className="gl-a"><b>General knowledge:</b> An index makes lookups faster at the cost of slower writes.</p>
            <p className="gl-src">✓ Checked online · postgresql.org</p>
          </div>
          <h3>Ready for standups and interviews</h3>
          <p>Switch between work and interview answers, and have general questions double-checked on the web.</p>
        </article>
      </div>
    </div>
  );
}

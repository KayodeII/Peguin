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
        <h2 data-reveal>When you're in the meeting yourself, Peguin helps quietly</h2>
        <p className="section-lead" data-reveal>Open the call in Peguin's window. It hears the other people, suggests what you could say, and gives you a recap. Everyone is told you're using an AI assistant.</p>
      </div>

      <div className="gl-grid two">
        <article className="gl-card blue" data-reveal>
          <h3>It <span className="gl-chip light"><span className="gl-mini-bars" aria-hidden><i /><i /><i /></span>hears</span> the room, not you</h3>
          <p>Peguin follows what the other people say, never your microphone, and notices when a question is meant for you.</p>
          <div className="gl-captions">
            <div className="gl-cap-head"><span className="gl-rec"><span />Live</span><Timer /></div>
            {LINES.map((l) => (
              <p key={l.text} className={l.ask ? "ask" : ""}><b>{l.who}</b>{l.text}{l.ask && <em>Question for you</em>}</p>
            ))}
            <Bars n={36} />
          </div>
        </article>

        <article className="gl-card" data-reveal>
          <h3>Then it <span className="gl-chip">✦ whispers</span> an answer</h3>
          <p>A short line that only you can see, labelled with where it came from. Your own work comes only from your notes.</p>
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
          <h3>Your notes are yours. The notice is everyone's.</h3>
          <p>Peguin posts the AI notice in the chat first. Only then do your notes stay out of screen shares.</p>
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
          <h3>A recap when it ends</h3>
          <p>What was asked of you, what was decided, and the questions your notes didn't cover. Never your own voice. Encrypted on your Mac.</p>
        </article>

        <article className="gl-card soft" data-reveal>
          <div className="gl-panel">
            <div className="gl-seg"><span className="on">Work</span><span>Interview</span></div>
            <p className="gl-a"><b>General knowledge:</b> An index makes lookups faster at the cost of slower writes.</p>
            <p className="gl-src">✓ Checked online · postgresql.org</p>
          </div>
          <h3>Work or interview, checked online</h3>
          <p>Answers suited to a team meeting or a job interview, and general answers can be checked on the web.</p>
        </article>
      </div>
    </div>
  );
}

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
          <h3>Peguin <span className="gl-chip light"><span className="gl-mini-bars" aria-hidden><i /><i /><i /></span>listens</span> to the others</h3>
          <p>It hears the people in the call, never your microphone, and picks out the questions that are meant for you.</p>
          <Timer />
          <p className="gl-rec"><span />Listening</p>
          <Bars />
        </article>

        <article className="gl-card" data-reveal>
          <h3>When you're asked, it <span className="gl-chip">✦ suggests</span> what to say</h3>
          <p>A short answer that only you can see, labelled with where it came from. Your own work comes only from your notes.</p>
          <div className="gl-pillbar"><span className="gl-pill-logo"><Logo size={20} /></span><span className="gl-pill-btn">⌄ Hide</span><span className="gl-pill-btn">Pop out</span></div>
          <div className="gl-panel dark">
            <p className="gl-q">“When does the billing export ship?”</p>
            <p className="gl-a"><b>From your notes:</b> It merged on Monday and goes out with Friday's release.</p>
            <div className="gl-labels"><span>From your notes</span><span>General knowledge</span><span>Not in your notes</span></div>
          </div>
        </article>
      </div>

      <div className="gl-grid three">
        <article className="gl-card soft" data-reveal>
          <div className="gl-split">
            <div className="gl-side mine">
              <span className="gl-tag">Visible to you</span>
              <div className="gl-note"><b>✦ Suggestion</b><p>Say the retry fix is merged; the rollout is Friday.</p></div>
            </div>
            <div className="gl-side theirs">
              <span className="gl-tag">What everyone sees</span>
              <div className="gl-chat"><b>Meeting chat</b><p>Heads-up: I'm using Peguin, an AI assistant, in this call.</p></div>
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

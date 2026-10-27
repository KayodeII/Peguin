// "Join as me" under a polar night: the owner's own call in a glass window,
// Peguin's private notes floating over it, and the AI notice everyone sees in
// the chat. Every part shows something the app does today.
import { useEffect, useState } from "react";
import { Logo } from "../ui";

const PEOPLE = [{ i: "T", name: "Tomi", talking: true }, { i: "S", name: "Sarah" }, { i: "A", name: "Ada (you)" }];

const STEPS = [
  { tone: "mint", title: "It hears the others", body: "Never your microphone. It picks out the questions that are meant for you." },
  { tone: "tomato", title: "It suggests, only to you", body: "A short answer labelled with where it came from. Your own work comes only from your notes." },
  { tone: "butter", title: "It recaps when you hang up", body: "What was asked of you, what was decided, and what your notes didn't cover." },
];

function useClock(start = 754) {
  const [s, setS] = useState(start);
  useEffect(() => { const t = setInterval(() => setS((v) => v + 1), 1000); return () => clearInterval(t); }, []);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export function Copilot() {
  const clock = useClock();
  return (
    <div className="pn">
      <div className="pn-sky" aria-hidden><i /><i /><i /></div>
      <div className="pn-inner">
        <div className="pn-head">
          <p className="pn-eyebrow" data-reveal>Join as me · Pro</p>
          <h2 data-reveal>In your own meetings, a second brain that only you can read</h2>
          <p className="pn-lead" data-reveal>Open the call in Peguin's window and talk as you always do. Peguin listens to the room, whispers an answer when you're asked, and tells everyone it's there.</p>
        </div>

        <div className="pn-stage">
          <div className="pn-scene" data-reveal>
            <div className="pn-call">
              <div className="pn-bar"><span className="pn-dots"><i /><i /><i /></span>Weekly sync<span className="pn-clock">{clock}</span></div>
              <div className="pn-tiles">
                {PEOPLE.map((p) => (
                  <div key={p.name} className={`pn-tile ${p.talking ? "talking" : ""}`}>
                    <span className="pn-face">{p.i}</span><span className="pn-name">{p.name}</span>
                  </div>
                ))}
              </div>
              <p className="pn-caption"><b>Tomi:</b> Ada, when does the billing export ship?</p>
              <div className="pn-chat">
                <span className="pn-chat-who">Ada · to everyone</span>
                Heads-up: I'm using Peguin, an AI assistant, in this call.
              </div>
            </div>
            <aside className="pn-notes">
              <div className="pn-notes-top"><Logo size={18} /><span>Only you see this</span><span className="pn-live" /></div>
              <p className="pn-label">From your notes</p>
              <p className="pn-answer">It merged on Monday. It goes out with Friday's release.</p>
              <div className="pn-chips"><span>Hide</span><span>Pop out</span><span>Check online</span></div>
            </aside>
          </div>

          <ol className="pn-steps">
            {STEPS.map((s, n) => (
              <li key={s.title} className={`pn-step ${s.tone}`} data-reveal>
                <span className="pn-num">{n + 1}</span>
                <div><h3>{s.title}</h3><p>{s.body}</p></div>
              </li>
            ))}
            <li className="pn-step note" data-reveal>
              <span className="pn-num">✓</span>
              <div><h3>Notice first, then private</h3><p>The AI notice goes in the chat before your notes leave screen shares. Work or interview mode, and web checks for general questions.</p></div>
            </li>
          </ol>
        </div>
      </div>
    </div>
  );
}

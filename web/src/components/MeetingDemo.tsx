import { useEffect, useState } from "react";
import { Icon, Logo } from "../ui";

type Line = { who: string; text: string; ai?: boolean };

// A standup, played back. Peguin stays muted until it's called, then speaks.
const SCRIPT: Line[] = [
  { who: "Sarah", text: "Morning all. David, kick us off?" },
  { who: "David", text: "Shipped the onboarding emails yesterday, on the billing page today." },
  { who: "Sarah", text: "Nice. Ada, you're up." },
  { who: "Ada (AI)", ai: true, text: "Hi everyone, I'm Peguin, Ada's AI assistant. Ada is in another meeting, so I'm covering the update. Yesterday Ada merged the payment webhook retries and fixed the flaky invoice test. Today they're migrating the users table to the new auth schema. No blockers." },
  { who: "Sarah", text: "Is the auth migration landing this week?" },
  { who: "Ada (AI)", ai: true, text: "It's in progress, but there's no date in Ada's work yet. I'll get Ada to follow up on the timeline." },
];

const PEOPLE = [
  { name: "Sarah", initials: "S", color: "#cb912f" },
  { name: "David", initials: "D", color: "#448361" },
];

export function MeetingDemo() {
  const reduce = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
  const [step, setStep] = useState(reduce ? SCRIPT.length : 1);
  const [chars, setChars] = useState(reduce ? Infinity : 0);

  const current = SCRIPT[step - 1];
  useEffect(() => {
    if (reduce) return;
    const line = SCRIPT[step - 1];
    if (!line) { const t = setTimeout(() => { setStep(1); setChars(0); }, 2600); return () => clearTimeout(t); }
    if (chars < line.text.length) {
      const t = setTimeout(() => setChars((c) => c + (line.ai ? 2 : 3)), line.ai ? 22 : 14);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => { setStep((s) => s + 1); setChars(0); }, line.ai ? 1600 : 900);
    return () => clearTimeout(t);
  }, [step, chars, reduce]);

  const speaking = current?.ai && chars < (current?.text.length ?? 0);
  const talker = current && !current.ai && chars < current.text.length ? current.who : null;

  return (
    <div className="demo" aria-label="Example: Peguin giving an update in a standup">
      <div className="demo-bar"><i /><i /><i /><span>Daily standup</span><span className="demo-live">● Live</span></div>
      <div className="demo-body">
        <div className="tiles">
          {PEOPLE.map((p) => (
            <div key={p.name} className={`tile ${talker === p.name ? "talking" : ""}`}>
              <span className="face" style={{ background: p.color }}>{p.initials}</span>
              <span className="tile-name">{p.name}</span>
            </div>
          ))}
          <div className={`tile ai ${speaking ? "talking" : ""}`}>
            <span className="face ai-face"><Logo size={34} /></span>
            <span className="tile-name">Ada (AI) <span className="mic">{speaking ? <Icon name="mic" size={13} /> : <Icon name="micOff" size={13} />}</span></span>
          </div>
        </div>
        <ol className="transcript">
          {SCRIPT.slice(0, step).map((l, i) => (
            <li key={i} className={l.ai ? "ai" : ""}>
              <strong>{l.who}</strong>
              <span>{i === step - 1 ? l.text.slice(0, chars) : l.text}{i === step - 1 && chars < l.text.length && <span className="caret" />}</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

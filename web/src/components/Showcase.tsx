import { useEffect, useState } from "react";
import { PHOTOS } from "../photos";
import { Brand, CountUp, Icon, Img, Logo, reducedMotion } from "../ui";

/* ------------------------------------------------------------ bold numbers */

/** Product facts, not vanity metrics. */
export function Stats() {
  return (
    <section className="stats">
      <div className="stats-inner">
        <div data-reveal><strong><CountUp to={40} suffix="s" /></strong><span>to say what you shipped, grouped and plain</span></div>
        <div data-reveal><strong><CountUp to={15} suffix=" min" /></strong><span>back every time a standup lands on a clash</span></div>
        <div data-reveal><strong><CountUp to={0} /></strong><span>lines of your code leave your Mac</span></div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------ alternating feature rows */

function CommitCard() {
  const items = [
    { s: "github", t: "Merged #482 Retry payment webhooks" },
    { s: "git", t: "fix(invoices): flaky test" },
    { s: "claude_code", t: "\"migrate users table to new auth schema\"" },
  ];
  return (
    <div className="ui-card commits">
      <div className="ui-head"><Logo size={16} />Reading since yesterday 09:30</div>
      <ul>{items.map((i, n) => <li key={n} style={{ animationDelay: `${n * 0.25}s` }}><Brand id={i.s} size={18} /><span>{i.t}</span></li>)}</ul>
      <div className="ui-foot"><Icon name="sparkle" size={14} />Writing your update</div>
    </div>
  );
}

function CalledCard() {
  return (
    <div className="ui-card called">
      <div className="bubble-them"><strong>Sarah</strong>Ada, you're up.</div>
      <div className="bubble-ai">
        <span className="wave">{Array.from({ length: 18 }, (_, i) => <i key={i} style={{ animationDelay: `${(i % 9) * 0.08}s` }} />)}</span>
        <span className="unmuted"><Icon name="mic" size={13} />Unmuted for 38s</span>
      </div>
    </div>
  );
}

function AnswerCard() {
  return (
    <div className="ui-card answer">
      <div className="bubble-them"><strong>David</strong>Is the auth migration landing this week?</div>
      <div className="bubble-ai text"><strong>Ada (AI)</strong>It's in progress. There's no date yet, so I'll get Ada to follow up.</div>
      <div className="fact-chip"><Icon name="shield" size={13} />Answered from prepared facts only</div>
    </div>
  );
}

const ROWS = [
  {
    photo: PHOTOS.write, card: <CommitCard />, kicker: "Writes it for you",
    title: <>Your day, <em>already summarised.</em></>,
    body: "Peguin reads your commits, pull requests and the Claude Code sessions behind them, then writes a 40-second update in plain words. It knows a half-finished migration isn't done yet.",
    points: ["Groups related work", "Drops chores and noise", "Never reads hashes or URLs aloud"],
  },
  {
    photo: PHOTOS.speak, card: <CalledCard />, kicker: "Speaks only when called",
    title: <>Quiet until <em>it's your turn.</em></>,
    body: "It joins as \"Your name (AI)\", muted with the camera off. When someone says your name, even misheard or as a nickname you set, it unmutes, gives the update, and goes quiet again.",
    points: ["Understands sound-alike names", "Ignores \"thanks, Ada\"", "Answers every time you're called"],
  },
  {
    photo: PHOTOS.facts, card: <AnswerCard />, kicker: "Answers from facts",
    title: <>Follow-ups, <em>handled honestly.</em></>,
    body: "Questions get answers from the facts Peguin prepared, nothing else. When the answer isn't there, it says you'll follow up. It never guesses a date or invents a status.",
    points: ["Facts-only answers", "Defers what it doesn't know", "Always introduces itself as AI"],
  },
];

export function FeatureRows() {
  return (
    <div className="rows">
      {ROWS.map((r, i) => (
        <article key={r.kicker} className={`row ${i % 2 ? "flip" : ""}`}>
          <div className="row-art" data-reveal>
            <Img photo={r.photo} className="row-photo" />
            {r.card}
          </div>
          <div className="row-copy" data-reveal>
            <span className="kicker">{r.kicker}</span>
            <h3 className="row-title">{r.title}</h3>
            <p>{r.body}</p>
            <ul className="checks">{r.points.map((p) => <li key={p}><Icon name="check" size={16} />{p}</li>)}</ul>
          </div>
        </article>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------ bento */

export function Bento() {
  return (
    <div className="bento">
      <div className="tile-b big terracotta" data-reveal>
        <Icon name="calendar" size={26} />
        <h3>Shows up on schedule</h3>
        <p>Set your standup once. Peguin prepares 15 minutes before and joins as it starts, every weekday you pick.</p>
        <div className="week">{["M", "T", "W", "T", "F"].map((d, i) => <span key={i} className={i < 4 ? "on" : ""}>{d}</span>)}<span className="time">09:30</span></div>
      </div>
      <div className="tile-b" data-reveal>
        <Icon name="shield" size={24} />
        <h3>Always says it's an AI</h3>
        <p>"Hi everyone, I'm Peguin, Ada's AI assistant." In every meeting. Not a setting.</p>
      </div>
      <div className="tile-b butter" data-reveal>
        <Icon name="ear" size={24} />
        <h3>Knows your name</h3>
        <p>Catches sound-alikes and nicknames, like "Mujib" for "Mujeeb". Ignores being talked about.</p>
      </div>
      <div className="tile-b sage" data-reveal>
        <Icon name="laptop" size={24} />
        <h3>Runs on your Mac</h3>
        <p>Joining, listening and speech recognition happen on your computer.</p>
      </div>
      <div className="tile-b" data-reveal>
        <Icon name="micOff" size={24} />
        <h3>Never in the way</h3>
        <p>Muted, camera off, hidden window. It unmutes only to speak.</p>
      </div>
      <div className="tile-b wide" data-reveal>
        <Icon name="code" size={26} />
        <h3>Made for how you work now</h3>
        <p className="wide-p">If your day happens in Claude Code, Peguin reads those sessions too, and treats unfinished work as in progress, not done.</p>
        <div className="mini-brands"><Brand id="git" size={24} /><Brand id="github" size={24} /><Brand id="claude_code" size={24} /><Brand id="linear" size={24} /><Brand id="jira" size={24} /></div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ personas (tabbed, auto-advancing) */

const PERSONAS = [
  { id: "eng", label: "Engineers", icon: "code", photo: PHOTOS.engineers, title: <>Stay in flow, <em>still show up.</em></>, body: "Deep in a bug when standup starts? Peguin gives the update from your commits and PRs while you keep going.", note: "Your update, said for you while you stay heads-down." },
  { id: "mgr", label: "Engineering managers", icon: "users", photo: PHOTOS.managers, title: <>Two meetings, <em>one of you.</em></>, body: "Your 1:1 runs over into the team standup. Peguin covers your update and takes the questions it can answer.", note: "No more choosing between your report and your team." },
  { id: "fnd", label: "Founders", icon: "sparkle", photo: PHOTOS.founders, title: <>On a customer call, <em>still in standup.</em></>, body: "Customer call at 9:30? Your team still hears what you shipped yesterday, in your words, from your work.", note: "Your team keeps context even when you're out selling." },
  { id: "rem", label: "Remote teams", icon: "globe", photo: PHOTOS.remote, title: <>Any time zone, <em>every standup.</em></>, body: "Standup lands at an awkward hour for you? Peguin attends from your Mac, so the team still gets your update.", note: "Your update gets there, whatever the hour where you are." },
];

export function Personas() {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (paused || reducedMotion()) return;
    const t = setTimeout(() => setActive((a) => (a + 1) % PERSONAS.length), 6000);
    return () => clearTimeout(t);
  }, [active, paused]);
  const p = PERSONAS[active]!;
  return (
    <div className="personas" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      <div className="tabs" role="tablist" aria-label="Who it's for">
        {PERSONAS.map((x, i) => (
          <button key={x.id} role="tab" aria-selected={i === active} className={i === active ? "on" : ""} onClick={() => { setActive(i); setPaused(true); }}>
            <Icon name={x.icon} size={16} />{x.label}
            {i === active && !paused && <span className="tab-progress" key={active} />}
          </button>
        ))}
      </div>
      <div className="persona" role="tabpanel" key={p.id}>
        <Img photo={p.photo} className="persona-photo" />
        <div className="persona-copy">
          <h3 className="row-title">{p.title}</h3>
          <p>{p.body}</p>
          <p className="callout"><Icon name="check" size={16} />{p.note}</p>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ how it works */

const STEPS = [
  { icon: "plug", title: "Connect once", body: "Install the Mac app, choose what Peguin may read, and paste your standup link." },
  { icon: "clock", title: "It prepares", body: "Fifteen minutes before the call, Peguin reads what you did and writes your update." },
  { icon: "mic", title: "It shows up", body: "It joins as \"Your name (AI)\", waits for your turn, speaks, and takes questions." },
];

export function Timeline() {
  return (
    <ol className="timeline">
      {STEPS.map((s, i) => (
        <li key={s.title} data-reveal style={{ transitionDelay: `${i * 120}ms` }}>
          <span className="t-num">{i + 1}</span>
          <span className="t-icon"><Icon name={s.icon} size={22} /></span>
          <h3>{s.title}</h3>
          <p>{s.body}</p>
        </li>
      ))}
    </ol>
  );
}

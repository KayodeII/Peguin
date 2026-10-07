import { useEffect, useState, type ReactNode } from "react";
import { PHOTOS, type Photo } from "../photos";
import { Brand, Icon, Img, Logo, reducedMotion, useParallax } from "../ui";

/* ------------------------------------------------------------ feature rows */

function CommitCard() {
  const items = [
    { s: "github", t: "Merged #482 Retry payment webhooks" },
    { s: "git", t: "fix(invoices): flaky test" },
    { s: "claude_code", t: "Migrate users table to new auth schema" },
  ];
  return (
    <div className="ui-card commits">
      <div className="ui-head"><Logo size={16} />Since yesterday, 09:30</div>
      <ul>{items.map((i, n) => <li key={n} style={{ animationDelay: `${n * 0.18}s` }}><Brand id={i.s} size={18} /><span>{i.t}</span></li>)}</ul>
    </div>
  );
}

function CalledCard() {
  return (
    <div className="ui-card called">
      <div className="said"><strong>Sarah</strong>Ada, you're up.</div>
      <div className="speaking-line">
        <span className="wave">{Array.from({ length: 22 }, (_, i) => <i key={i} style={{ animationDelay: `${(i * 41) % 600}ms` }} />)}</span>
        <span className="pill live"><Icon name="mic" size={13} />Unmuted</span>
      </div>
    </div>
  );
}

function AnswerCard() {
  return (
    <div className="ui-card answer">
      <div className="said"><strong>David</strong>Is the auth migration landing this week?</div>
      <div className="said ai"><strong>Ada (AI)</strong>It's in progress. There's no date yet, so I'll get Ada to follow up.</div>
    </div>
  );
}

function Row({ photo, card, title, children, flip }: { photo: Photo; card: ReactNode; title: string; children: ReactNode; flip?: boolean }) {
  const img = useParallax<HTMLDivElement>(30);
  return (
    <article className={`row ${flip ? "flip" : ""}`}>
      <div className="row-art" data-reveal>
        <div className="row-photo-wrap"><div ref={img} className="row-photo-inner"><Img photo={photo} className="row-photo" /></div></div>
        {card}
      </div>
      <div className="row-copy" data-reveal>
        <h3 className="row-title">{title}</h3>
        {children}
      </div>
    </article>
  );
}

export function FeatureRows() {
  return (
    <div className="rows">
      <Row photo={PHOTOS.write} card={<CommitCard />} title="It writes the update from your actual work">
        <p>Peguin reads your commits, pull requests and the Claude Code sessions behind them, then writes about 40 seconds of plain English. Chores and typo fixes get dropped. Half-finished work is described as in progress, because it is.</p>
      </Row>
      <Row flip photo={PHOTOS.speak} card={<CalledCard />} title="It stays muted until someone says your name">
        <p>It joins as "Ada (AI)" with the camera off. When someone hands over to you, even if speech recognition hears "Mujib" for "Mujeeb", it unmutes and gives the update. "Thanks, Ada" doesn't count as being called.</p>
      </Row>
      <Row photo={PHOTOS.facts} card={<AnswerCard />} title="It answers from facts, or says you'll follow up">
        <p>Follow-up questions get answers from what Peguin prepared and nothing else. If the answer isn't there, it says so and leaves it to you. It won't guess a date or make up a status to sound helpful.</p>
      </Row>
    </div>
  );
}

/* ------------------------------------------------------------ tiles: each shows a real piece of the product */

export function Tiles() {
  return (
    <div className="tiles-grid">
      <div className="tile-ui wide blue" data-reveal>
        <div>
          <h3>Set your standup once</h3>
          <p>Pick the days and time. Peguin prepares 15 minutes before and joins when it starts.</p>
        </div>
        <div className="sched">
          <div className="sched-days">{["M", "T", "W", "T", "F", "S", "S"].map((d, i) => <span key={i} className={i < 5 ? "on" : ""}>{d}</span>)}</div>
          <div className="sched-row"><span>Starts</span><strong>09:30</strong></div>
          <div className="sched-row"><span>Join for me</span><span className="switch on" /></div>
        </div>
      </div>

      <div className="tile-ui yellow" data-reveal>
        <h3>Hears your name, even misheard</h3>
        <div className="heard">
          <p><span><mark>Mujib</mark>, you're up.</span><span className="tag ok">called</span></p>
          <p><span>Thanks, <mark className="soft">Mujeeb</mark>.</span><span className="tag">ignored</span></p>
        </div>
      </div>

      <div className="tile-ui green" data-reveal>
        <h3>Says it's an AI, first, every time</h3>
        <div className="bubble-quote">"Hi everyone, I'm Peguin, Ada's AI assistant. Ada is in another meeting, so I'm covering the update."</div>
      </div>

      <div className="tile-ui purple" data-reveal>
        <h3>Stays on your Mac</h3>
        <div className="local">
          <span><Icon name="laptop" size={18} />Joining, listening, speech recognition</span>
          <span className="arrow-out">Only titles and statuses go to Claude to write the update</span>
        </div>
      </div>

      <div className="tile-ui" data-reveal>
        <div>
          <h3>Reads where your work happens</h3>
          <p>Commits, pull requests, and the Claude Code sessions where a lot of work starts now. Linear and Jira are next.</p>
        </div>
        <div className="source-stack">
          {["git", "github", "claude_code", "linear", "jira"].map((id) => <Brand key={id} id={id} size={36} />)}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ who it's for */

const PERSONAS = [
  { id: "eng", label: "Engineers", photo: PHOTOS.engineers, title: "Deep in a bug when standup starts", body: "Keep going. Peguin gives the update from your commits and pull requests, and your team hears what you did yesterday." },
  { id: "mgr", label: "Engineering managers", photo: PHOTOS.managers, title: "Your 1:1 runs into the team standup", body: "Stay with your report. Peguin covers your update and answers what it can, and the rest waits for you." },
  { id: "fnd", label: "Founders", photo: PHOTOS.founders, title: "A customer call at 9:30", body: "Take the call. Your team still hears what shipped, from the work itself, not from a note you wrote at midnight." },
  { id: "rem", label: "Remote teams", photo: PHOTOS.remote, title: "Standup lands at an awkward hour", body: "If your Mac is on, Peguin can attend. Your teammates get your update whatever the time is where you are." },
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
            {x.label}
            {i === active && !paused && <span className="tab-progress" key={active} />}
          </button>
        ))}
      </div>
      <div className="persona" role="tabpanel" key={p.id}>
        <Img photo={p.photo} className="persona-photo" />
        <div className="persona-copy">
          <h3>{p.title}</h3>
          <p>{p.body}</p>
        </div>
      </div>
    </div>
  );
}

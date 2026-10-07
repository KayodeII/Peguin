import { PHOTOS } from "../photos";
import { Brand, Icon, Img, Link, Logo } from "../ui";
import { TRIAL_DAYS } from "./Sections";

/** Split hero: the pitch on the left; on the right, the owner in their other meeting while Peguin covers the standup. */
export function Hero() {
  return (
    <section className="hero">
      <div className="hero-copy" data-reveal>
        <span className="eyebrow"><span className="dot" />For engineers who are always double-booked</span>
        <h1>Skip the standup, <em>keep the update.</em></h1>
        <p className="lead">
          Peguin writes your update from what you actually shipped, joins the call muted, and says it when someone calls
          your name. As your AI assistant, never as you.
        </p>
        <div className="cta">
          <Link to="/signin?next=/account" className="btn big">Start {TRIAL_DAYS}-day free trial</Link>
          <Link to="/#demo" className="btn big ghost">Watch it work</Link>
        </div>
        <ul className="hero-points">
          <li><Icon name="check" size={16} />No card needed</li>
          <li><Icon name="check" size={16} />Google Meet and Zoom</li>
          <li><Icon name="check" size={16} />Your code stays on your Mac</li>
        </ul>
      </div>

      <div className="hero-art" data-reveal>
        <div className="blob blob-a" aria-hidden />
        <div className="blob blob-b" aria-hidden />
        <figure className="hero-photo"><Img photo={PHOTOS.hero} eager /></figure>

        <div className="float float-call" aria-hidden>
          <span className="float-avatar s">S</span>
          <div><strong>Sarah</strong><span>"Ada, you're up."</span></div>
        </div>
        <div className="float float-speak" aria-hidden>
          <span className="float-logo"><Logo size={26} /></span>
          <div>
            <strong>Ada (AI) is speaking</strong>
            <span className="wave">{Array.from({ length: 14 }, (_, i) => <i key={i} style={{ animationDelay: `${(i % 7) * 0.09}s` }} />)}</span>
          </div>
        </div>
        <div className="float float-status" aria-hidden>
          <Icon name="micOff" size={14} />Muted · camera off until called
        </div>
        <div className="float float-meet" aria-hidden><Brand id="google_meet" size={22} /></div>
      </div>
    </section>
  );
}

const MARQUEE: { id: string; text: string }[] = [
  { id: "google_meet", text: "Joins Google Meet" },
  { id: "zoom", text: "Joins Zoom" },
  { id: "git", text: "Reads your commits" },
  { id: "github", text: "Reads your pull requests" },
  { id: "claude_code", text: "Reads your Claude Code sessions" },
  { id: "linear", text: "Linear, soon" },
  { id: "jira", text: "Jira, soon" },
];

/** Infinite, pausable strip of integrations (duplicated once for a seamless loop). */
export function Marquee() {
  const row = MARQUEE.map((m) => <li key={m.id}><Brand id={m.id} size={26} /><span>{m.text}</span></li>);
  return (
    <section className="marquee" aria-label="Works with">
      <ul className="marquee-track">{row}{MARQUEE.map((m) => <li key={`${m.id}-2`} aria-hidden><Brand id={m.id} size={26} /><span>{m.text}</span></li>)}</ul>
    </section>
  );
}

import { BeforeAfter } from "../components/BeforeAfter";
import { MeetingDemo } from "../components/MeetingDemo";
import { Faq, PricingCard, TRIAL_DAYS } from "../components/Sections";
import { Brand, Icon, Link, Title } from "../ui";

const FEATURES = [
  { icon: "doc", title: "Writes it for you", body: "Reads your commits, pull requests and Claude Code sessions since the last standup and turns them into a clear 40-second update. You don't type a word." },
  { icon: "ear", title: "Speaks only when called", body: "Joins muted with the camera off. When someone says your name, it unmutes, gives the update, and goes quiet again." },
  { icon: "shield", title: "Answers from facts", body: "Follow-up questions get answers from what it prepared. If it doesn't know, it says you'll follow up. It never makes things up." },
];

const STEPS = [
  { icon: "plug", title: "Connect once", body: "Install the Mac app, pick what Peguin may read, and paste your standup link." },
  { icon: "clock", title: "It prepares", body: "Fifteen minutes before the call, Peguin reads what you did and writes your update." },
  { icon: "mic", title: "It shows up", body: "It joins as \"Your name (AI)\", waits for your turn, speaks, and takes questions." },
];

const PRIVACY = [
  { icon: "laptop", title: "Runs on your Mac", body: "Joining, listening and speech recognition happen on your computer." },
  { icon: "tag", title: "Titles, never code", body: "Only commit messages, PR titles and statuses are used to write the update." },
  { icon: "key", title: "Locked down", body: "Your sign-in is kept in the macOS Keychain. Each source can be switched off." },
  { icon: "shield", title: "Always says it's an AI", body: "It introduces itself as your assistant in every meeting. That's not a setting." },
];

export function Home() {
  return (
    <>
      <section className="hero">
        <Title as="h1" em="keep the update.">Skip the standup,</Title>
        <p className="lead">
          Double-booked? Peguin writes your update from what you actually shipped, joins the call muted, and says it when
          someone calls your name, as your AI assistant.
        </p>
        <div className="cta">
          <Link to="/signin?next=/account" className="btn big">Start {TRIAL_DAYS}-day free trial</Link>
          <Link to="/#how" className="btn big ghost">See how it works</Link>
        </div>
        <p className="fine">No card needed · macOS · Google Meet and Zoom</p>
      </section>

      <section className="demo-wrap"><MeetingDemo /></section>

      <section className="strip" aria-label="Works with">
        <div><span className="strip-label">Joins</span><Brand id="google_meet" label /><Brand id="zoom" label /></div>
        <div><span className="strip-label">Reads</span><Brand id="git" label /><Brand id="github" label /><Brand id="claude_code" label /></div>
        <div className="soon"><span className="strip-label">Soon</span><Brand id="linear" label /><Brand id="jira" label /></div>
      </section>

      <section className="section" id="features">
        <Title em="40 seconds of signal.">From a day of commits to</Title>
        <p className="section-lead">Peguin keeps what your team needs to hear and drops the rest.</p>
        <BeforeAfter />
        <div className="features">
          {FEATURES.map((f) => (
            <div key={f.title} className="feature">
              <span className="feature-icon"><Icon name={f.icon} /></span>
              <h3>{f.title}</h3>
              <p>{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="section" id="how">
        <Title em="then forget about it.">Set it up once,</Title>
        <ol className="steps">
          {STEPS.map((s, i) => (
            <li key={s.title}>
              <span className="step-num">{i + 1}</span>
              <span className="feature-icon"><Icon name={s.icon} /></span>
              <h3>{s.title}</h3>
              <p>{s.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="section band" id="privacy">
        <Title em="stays yours.">Your work</Title>
        <p className="section-lead">Peguin is built to cover for you, not to collect your data.</p>
        <div className="privacy">
          {PRIVACY.map((p) => (
            <div key={p.title}>
              <Icon name={p.icon} />
              <h3>{p.title}</h3>
              <p>{p.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="section narrow-section" id="pricing">
        <Title em="everything in it.">One plan,</Title>
        <PricingCard />
      </section>

      <section className="section narrow-section" id="faq">
        <Title em="asked.">Questions,</Title>
        <Faq />
      </section>

      <section className="final">
        <Title em="Send Peguin.">Double-booked?</Title>
        <p className="lead">Your update gets said. You stay in the other meeting.</p>
        <Link to="/signin?next=/account" className="btn big">Start {TRIAL_DAYS}-day free trial</Link>
      </section>
    </>
  );
}

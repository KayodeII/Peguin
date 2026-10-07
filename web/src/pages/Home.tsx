import { BeforeAfter } from "../components/BeforeAfter";
import { Hero, Marquee } from "../components/Hero";
import { MeetingDemo } from "../components/MeetingDemo";
import { Faq, PricingCard, TRIAL_DAYS } from "../components/Sections";
import { Bento, FeatureRows, Personas, Stats, Timeline } from "../components/Showcase";
import { PHOTOS } from "../photos";
import { Icon, Img, Link } from "../ui";

const PRIVACY = [
  { icon: "laptop", title: "Runs on your Mac", body: "Joining, listening and speech recognition happen on your computer." },
  { icon: "tag", title: "Titles, never code", body: "Only commit messages, PR titles and statuses are used to write the update." },
  { icon: "key", title: "Locked down", body: "Your sign-in lives in the macOS Keychain. Every source can be switched off." },
  { icon: "shield", title: "Honest by design", body: "It always introduces itself as your AI assistant. That's not a setting." },
];

export function Home() {
  return (
    <>
      <Hero />
      <Marquee />

      <section className="section dark" id="demo">
        <div className="section-head" data-reveal>
          <span className="kicker light">See it in a real standup</span>
          <h2>Watch it <em>cover for you.</em></h2>
          <p className="section-lead">Muted until it hears your name. Then a clear update, and an honest answer to the follow-up.</p>
        </div>
        <div className="demo-wrap" data-reveal><MeetingDemo /></div>
      </section>

      <Stats />

      <section className="section" id="features">
        <div className="section-head" data-reveal>
          <span className="kicker">From raw work to a real update</span>
          <h2>A day of commits, <em>40 seconds of signal.</em></h2>
          <p className="section-lead">Peguin keeps what your team needs to hear and drops the rest.</p>
        </div>
        <div data-reveal><BeforeAfter /></div>
      </section>

      <section className="section">
        <FeatureRows />
      </section>

      <section className="section cream-deep">
        <div className="section-head" data-reveal>
          <span className="kicker">The details that matter</span>
          <h2>Small things, <em>done properly.</em></h2>
        </div>
        <Bento />
      </section>

      <section className="section" id="who">
        <div className="section-head" data-reveal>
          <span className="kicker">Who it's for</span>
          <h2>Built for <em>busy calendars.</em></h2>
        </div>
        <div data-reveal><Personas /></div>
      </section>

      <section className="section" id="how">
        <div className="section-head" data-reveal>
          <span className="kicker">How it works</span>
          <h2>Set it up once, <em>then forget about it.</em></h2>
        </div>
        <Timeline />
      </section>

      <section className="section sage-band" id="privacy">
        <div className="split">
          <div className="split-photo" data-reveal><Img photo={PHOTOS.privacy} /></div>
          <div data-reveal>
            <span className="kicker light">Privacy</span>
            <h2 className="left">Your work <em>stays yours.</em></h2>
            <p className="section-lead left">Peguin is built to cover for you, not to collect your data.</p>
            <div className="privacy">
              {PRIVACY.map((p) => (
                <div key={p.title}><Icon name={p.icon} /><h3>{p.title}</h3><p>{p.body}</p></div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="section" id="pricing">
        <div className="section-head" data-reveal>
          <span className="kicker">Pricing</span>
          <h2>One plan, <em>everything in it.</em></h2>
          <p className="section-lead">{TRIAL_DAYS} days free. No card until you decide to stay.</p>
        </div>
        <div data-reveal><PricingCard /></div>
      </section>

      <section className="section narrow-section" id="faq">
        <div className="section-head" data-reveal>
          <span className="kicker">FAQ</span>
          <h2>Questions, <em>answered.</em></h2>
        </div>
        <Faq />
      </section>

      <section className="final">
        <div className="final-inner">
          <div className="final-copy" data-reveal>
            <h2 className="left">Double-booked? <em>Send Peguin.</em></h2>
            <p>Your update gets said. You stay in the other meeting.</p>
            <div className="cta left">
              <Link to="/signin?next=/account" className="btn big light">Start {TRIAL_DAYS}-day free trial</Link>
              <Link to="/pricing" className="btn big outline-light">See pricing <Icon name="arrow" size={16} /></Link>
            </div>
          </div>
          <div className="final-photo" data-reveal><Img photo={PHOTOS.final} /></div>
        </div>
      </section>
    </>
  );
}

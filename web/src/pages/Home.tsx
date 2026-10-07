import { VoiceRings, Waveforms } from "../components/Backgrounds";
import { Hero, Marquee } from "../components/Hero";
import { MeetingDemo } from "../components/MeetingDemo";
import { Morning } from "../components/Morning";
import { Faq, PricingCard, TRIAL_DAYS } from "../components/Sections";
import { FeatureRows, Personas, Tiles } from "../components/Showcase";
import { Transform } from "../components/Transform";
import { PHOTOS } from "../photos";
import { Icon, Img, Link, Rise } from "../ui";

const KEPT = [
  { icon: "laptop", title: "On your Mac", body: "Joining the call, listening and speech recognition run on your computer." },
  { icon: "tag", title: "Titles, not code", body: "Commit messages, PR titles and statuses are all it uses to write the update." },
  { icon: "key", title: "In your Keychain", body: "Your sign-in is stored by macOS. You can switch off any source." },
];

export function Home() {
  return (
    <>
      <Hero />
      <Marquee />

      <section className="band dark" id="demo">
        <Waveforms />
        <div className="band-inner">
          <div className="section-head">
            <Rise text="Here's a standup it covered" />
            <p className="section-lead" data-reveal>Ada was on a customer call. The team still got her update, and a straight answer to the question that came after.</p>
          </div>
          <div className="demo-wrap" data-reveal><MeetingDemo /></div>
        </div>
      </section>

      <section id="features"><Transform /></section>

      <section className="section"><FeatureRows /></section>

      <section className="section" id="how"><Morning /></section>

      <section className="band soft">
        <div className="band-inner">
          <div className="section-head"><Rise text="The parts that took the longest to get right" /></div>
          <Tiles />
        </div>
      </section>

      <section className="section" id="who">
        <div className="section-head"><Rise text="Who it's for" /></div>
        <div data-reveal><Personas /></div>
      </section>

      <section className="section" id="privacy">
        <div className="split">
          <div className="split-photo" data-reveal><Img photo={PHOTOS.privacy} /></div>
          <div>
            <Rise text="What stays on your Mac" className="left" />
            <p className="section-lead left" data-reveal>Peguin covers for you. It doesn't need your code to do that, so it never takes it.</p>
            <ul className="kept">
              {KEPT.map((k) => (
                <li key={k.title} data-reveal><Icon name={k.icon} size={22} /><div><h3>{k.title}</h3><p>{k.body}</p></div></li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="section" id="pricing">
        <div className="section-head">
          <Rise text="One plan" />
          <p className="section-lead" data-reveal>{TRIAL_DAYS} days free, without a card. Then one monthly price.</p>
        </div>
        <div data-reveal><PricingCard /></div>
      </section>

      <section className="section narrow-section" id="faq">
        <div className="section-head"><Rise text="Questions" /></div>
        <Faq />
      </section>

      <section className="final">
        <VoiceRings />
        <div className="final-inner">
          <Rise text="Next time standup clashes with something, send Peguin." />
          <p data-reveal>It takes about two minutes to set up, and the first {TRIAL_DAYS} days are free.</p>
          <div className="cta center" data-reveal>
            <Link to="/signin?next=/account" className="btn big light">Try it free</Link>
            <Link to="/pricing" className="btn big outline-light">See pricing <Icon name="arrow" size={16} /></Link>
          </div>
        </div>
      </section>
    </>
  );
}

import { AppShowcase } from "../components/AppDemo";
import { Waveforms } from "../components/Backgrounds";
import { Hero, Marquee } from "../components/Hero";
import { MeetingDemo } from "../components/MeetingDemo";
import { Morning } from "../components/Morning";
import { ExpandingPhoto, PeopleRail } from "../components/Scenes";
import { Faq, PricingTable, TRIAL_DAYS } from "../components/Sections";
import { FeatureRows, Tiles } from "../components/Showcase";
import { Transform } from "../components/Transform";
import { PHOTOS } from "../photos";
import { Icon, Img, Link, Rise, useBackgroundFlow } from "../ui";

// The page background glides through these as you scroll (see useBackgroundFlow).
const BG = {
  white: "#ffffff", sky: "#e9f2fd", butter: "#fff6d8", mint: "#e7f5ec", lilac: "#f1ecfc", peach: "#ffefe8", ice: "#eef6fb",
};

const KEPT = [
  { icon: "laptop", title: "On your Mac", body: "Joining the call, listening and speech recognition run on your computer." },
  { icon: "tag", title: "Titles, not code", body: "Commit messages, PR titles and statuses are all it uses to write the update." },
  { icon: "key", title: "In your Keychain", body: "Your sign-in is stored by macOS. You can switch off any source." },
];

export function Home() {
  useBackgroundFlow("home");
  return (
    <>
      <div data-bg={BG.white}>
        <Hero />
        <Marquee />
      </div>

      <section className="flow-section" id="demo" data-bg={BG.sky}>
        <Waveforms />
        <div className="flow-inner">
          <div className="section-head">
            <Rise text="Here's a standup it covered" />
            <p className="section-lead" data-reveal>Ada was on a customer call. The team still got her update, and a straight answer to the question that came after.</p>
          </div>
          <div className="demo-wrap" data-reveal><MeetingDemo /></div>
        </div>
      </section>

      <section id="features" data-bg={BG.butter}><Transform /></section>

      <AppShowcase />

      <section className="section" data-bg={BG.white}><FeatureRows /></section>

      <section data-bg={BG.mint}>
        <ExpandingPhoto photo={PHOTOS.final} lines={["You're in the other meeting.", "Your team still hears what you shipped.", "Nobody waits on you to unmute."]} />
      </section>

      <section className="section" id="how" data-bg={BG.mint}><Morning /></section>

      <section className="flow-section" data-bg={BG.lilac}>
        <div className="flow-inner">
          <div className="section-head"><Rise text="The parts that took the longest to get right" /></div>
          <Tiles />
        </div>
      </section>

      <section id="who" data-bg={BG.peach}><PeopleRail /></section>

      <section className="section" id="privacy" data-bg={BG.white}>
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

      <section className="flow-section" id="pricing" data-bg={BG.ice}>
        <div className="flow-inner">
          <div className="section-head">
            <Rise text="Plans" />
            <p className="section-lead" data-reveal>Start free. New accounts get Pro for {TRIAL_DAYS} days, no card needed.</p>
          </div>
          <div data-reveal><PricingTable /></div>
        </div>
      </section>

      <section className="section narrow-section" id="faq" data-bg={BG.white}>
        <div className="section-head"><Rise text="Questions" /></div>
        <Faq />
      </section>

    </>
  );
}

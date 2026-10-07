import { useEffect, useRef, useState } from "react";
import { PHOTOS } from "../photos";
import { Brand, Icon, Img, Link, Logo, reducedMotion, Rise } from "../ui";
import { SoundField } from "./Backgrounds";
import { TRIAL_DAYS } from "./Sections";

const SOURCES = [
  { id: "github", text: "Merged #482: retry payment webhooks" },
  { id: "git", text: "fix(invoices): flaky test" },
  { id: "claude_code", text: "Migrate users table to new auth schema" },
];
const UPDATE = "Yesterday Ada merged the payment webhook retries and fixed the flaky invoice test. Today they're moving the users table to the new auth schema. No blockers.";

// Intro timeline, in ms from first paint.
const T = { sources: 500, write: 2300, called: 6200, speak: 6900, loop: 14000 };

/** The opening scene: commits arrive, the update writes itself, then the meeting calls on Ada. */
function Stage() {
  const still = reducedMotion();
  const [t, setT] = useState(still ? T.speak + 1 : 0);
  const stage = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (still) return;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => { setT((now - start) % T.loop); raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [still]);

  // Layers drift with the cursor for a little depth.
  useEffect(() => {
    const el = stage.current;
    if (!el || still) return;
    const move = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      el.style.setProperty("--mx", ((e.clientX - r.left) / r.width - 0.5).toFixed(3));
      el.style.setProperty("--my", ((e.clientY - r.top) / r.height - 0.5).toFixed(3));
    };
    const reset = () => { el.style.setProperty("--mx", "0"); el.style.setProperty("--my", "0"); };
    addEventListener("pointermove", move);
    document.addEventListener("pointerleave", reset);
    return () => { removeEventListener("pointermove", move); document.removeEventListener("pointerleave", reset); };
  }, [still]);

  const shown = SOURCES.filter((_, i) => t > T.sources + i * 420).length;
  const chars = t < T.write ? 0 : Math.min(UPDATE.length, Math.floor((t - T.write) / 22));
  const called = t > T.called;
  const speaking = t > T.speak;

  return (
    <div className="stage" ref={stage}>
      <figure className="stage-photo layer-1"><Img photo={PHOTOS.hero} eager /></figure>

      <div className={`doc layer-2 ${speaking ? "speaking" : ""}`}>
        <div className="doc-head">
          <Logo size={20} />
          <span className="doc-title">Ada's update</span>
          <span className={`doc-state ${speaking ? "live" : ""}`}>
            {speaking ? <><Icon name="mic" size={13} />Speaking</> : chars > 0 ? "Writing" : "Reading your work"}
          </span>
        </div>
        <ul className="doc-sources">
          {SOURCES.map((s, i) => (
            <li key={s.id} className={i < shown ? "in" : ""}><Brand id={s.id} size={18} /><span>{s.text}</span></li>
          ))}
        </ul>
        <p className="doc-text">
          {UPDATE.slice(0, chars)}
          {chars > 0 && chars < UPDATE.length && <span className="caret" />}
        </p>
        <div className={`doc-wave ${speaking ? "on" : ""}`} aria-hidden>
          {Array.from({ length: 28 }, (_, i) => <i key={i} style={{ animationDelay: `${(i * 37) % 600}ms` }} />)}
        </div>
      </div>

      <div className={`toast layer-3 ${called ? "in" : ""}`} aria-hidden>
        <span className="toast-face">S</span>
        <div><strong>Sarah</strong><span>Ada, you're up.</span></div>
        <Brand id="google_meet" size={20} />
      </div>
    </div>
  );
}

export function Hero() {
  return (
    <section className="hero">
      <SoundField />
      <div className="hero-inner">
        <div className="hero-copy">
          <Rise as="h1" text="Peguin gives your standup update when you can't be there." />
          <p className="lead fade-up" style={{ animationDelay: "500ms" }}>
            It reads what you shipped since yesterday, joins the call muted, and speaks when someone says your name.
            The room always knows it's an AI.
          </p>
          <div className="cta fade-up" style={{ animationDelay: "700ms" }}>
            <Link to="/signin?next=/account" className="btn big">Try it free for {TRIAL_DAYS} days</Link>
            <Link to="/#demo" className="btn big ghost">See a standup it covered</Link>
          </div>
          <p className="hero-note fade-up" style={{ animationDelay: "900ms" }}>Mac app. Works with Google Meet and Zoom. No card for the trial.</p>
        </div>
        <Stage />
      </div>
    </section>
  );
}

const MARQUEE = [
  { id: "google_meet", text: "Google Meet" },
  { id: "zoom", text: "Zoom" },
  { id: "git", text: "Git" },
  { id: "github", text: "GitHub" },
  { id: "claude_code", text: "Claude Code" },
  { id: "linear", text: "Linear (soon)" },
  { id: "jira", text: "Jira (soon)" },
];

/** Infinite strip of what Peguin works with; pauses on hover. */
export function Marquee() {
  const item = (m: (typeof MARQUEE)[number], dup?: boolean) => (
    <li key={`${m.id}${dup ? "-2" : ""}`} aria-hidden={dup}><Brand id={m.id} size={24} /><span>{m.text}</span></li>
  );
  return (
    <section className="marquee" aria-label="Works with">
      <ul className="marquee-track">{MARQUEE.map((m) => item(m))}{MARQUEE.map((m) => item(m, true))}</ul>
    </section>
  );
}

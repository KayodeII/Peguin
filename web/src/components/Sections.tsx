import { useEffect, useState } from "react";
import { formatPrice, getPlan, type Plan } from "../api";
import { Icon, Link, Logo } from "../ui";

export const TRIAL_DAYS = 14; // matches TRIAL_DAYS in cloud/wrangler.jsonc

/** The live Paystack plan: undefined while loading, null if it couldn't be loaded. */
export function usePlan(): Plan | null | undefined {
  const [plan, setPlan] = useState<Plan | null | undefined>(undefined);
  useEffect(() => { void getPlan().then(setPlan); }, []);
  return plan;
}

const INCLUDED = [
  "Updates written from git, GitHub and Claude Code",
  "Joins Google Meet and Zoom on your schedule",
  "Answers follow-ups from facts, defers the rest",
  "Runs on your Mac, and your code stays there",
];

export function PricingCard() {
  const plan = usePlan();
  const [amount, period] = plan ? formatPrice(plan).split("/") : [];
  return (
    <div className="plan">
      <div className="plan-head">
        <span className="plan-name">Peguin</span>
        <span className="pill">{TRIAL_DAYS} days free</span>
      </div>
      <div className="price">
        {plan ? <><strong>{amount}</strong><span>/{period}</span></>
          : plan === null ? <span className="price-fallback">{TRIAL_DAYS} days free, then one monthly plan</span>
          : <strong className="price-loading">&nbsp;</strong>}
      </div>
      <p className="muted">Everything Peguin does. Cancel whenever you like.</p>
      <ul className="checks">{INCLUDED.map((t) => <li key={t}><Icon name="check" size={16} />{t}</li>)}</ul>
      <Link to="/signin?next=/account" className="btn wide">Start free trial</Link>
    </div>
  );
}

const FAQ: { q: string; a: string }[] = [
  { q: "Does Peguin pretend to be me?", a: "No. It joins as \"Your name (AI)\" and opens with \"I'm Peguin, your AI assistant\" every time. Your team always knows it's an assistant covering for you." },
  { q: "Which meeting apps does it work with?", a: "Google Meet and Zoom today. It joins as a guest from its own window, so you don't connect your meeting account. Microsoft Teams is next." },
  { q: "What does it read to write my update?", a: "Your git commits on your Mac, your GitHub pull requests and reviews, and, if you allow it, the prompts you gave Claude Code. Linear and Jira are coming. You can switch each source off." },
  { q: "Is my code sent anywhere?", a: "No. Peguin reads commit messages, PR titles and statuses, never code. Those short titles go to Claude to write the update; nothing is stored on our side." },
  { q: "What happens if someone asks a question it can't answer?", a: "It answers only from the facts it prepared. If the answer isn't there, it says it'll get you to follow up, and never makes something up." },
  { q: "Does my computer need to be on?", a: "Yes. Peguin runs on your Mac, which is usually already on when you're double-booked. It joins quietly in the background, muted with the camera off until it's called." },
  { q: "Is there a Windows version?", a: "Not yet. Peguin is macOS first; Windows is planned." },
  { q: "How does the free trial work?", a: `You get ${TRIAL_DAYS} days from sign-up, no card needed. Subscribe any time to keep going; cancel from your account whenever you like.` },
];

export function Faq() {
  return (
    <div className="faq">
      {FAQ.map((f) => (
        <details key={f.q}>
          <summary>{f.q}<span aria-hidden>+</span></summary>
          <p>{f.a}</p>
        </details>
      ))}
    </div>
  );
}

const NAV = [
  { to: "/#how", label: "How it works" },
  { to: "/#features", label: "Features" },
  { to: "/#who", label: "Who it's for" },
  { to: "/#privacy", label: "Privacy" },
  { to: "/pricing", label: "Pricing" },
  { to: "/#faq", label: "FAQ" },
];

export function Nav() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(scrollY > 8);
    on(); addEventListener("scroll", on, { passive: true });
    return () => removeEventListener("scroll", on);
  }, []);
  return (
    <header className={`nav ${scrolled ? "scrolled" : ""}`}>
      <div className="nav-inner">
        <Link to="/" className="wordmark"><Logo size={26} />Peguin</Link>
        <nav className={open ? "open" : ""} aria-label="Main">
          {NAV.map((n) => <Link key={n.to} to={n.to} onClick={() => setOpen(false)}>{n.label}</Link>)}
          <Link to="/account" className="nav-signin" onClick={() => setOpen(false)}>Sign in</Link>
        </nav>
        <Link to="/signin?next=/account" className="btn small">Start free trial</Link>
        <button className="menu" aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open} onClick={() => setOpen(!open)}>
          <Icon name={open ? "close" : "menu"} />
        </button>
      </div>
    </header>
  );
}

export function Footer() {
  return (
    <footer className="footer">
      <div className="footer-inner">
        <div className="footer-brand">
          <Link to="/" className="wordmark"><Logo size={24} />Peguin</Link>
          <p>Peguin gives your standup update when you can't be there, and always tells the room it's an AI.</p>
        </div>
        <div>
          <h4>Product</h4>
          <Link to="/#how">How it works</Link>
          <Link to="/#features">Features</Link>
          <Link to="/pricing">Pricing</Link>
          <Link to="/#faq">FAQ</Link>
        </div>
        <div>
          <h4>Account</h4>
          <Link to="/signin?next=/account">Start free trial</Link>
          <Link to="/account">Sign in</Link>
        </div>
      </div>
      <div className="footer-mark" aria-hidden>Peguin</div>
      <div className="footer-base"><span>© {new Date().getFullYear()} Peguin</span><span>Made in Lagos</span></div>
    </footer>
  );
}

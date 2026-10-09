import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { FEATURE_ROWS, PLANS, type PlanId } from "../../../src/core/plans";
import { api, formatPrice, getPlans, type PlanOffer, type Plans } from "../api";
import { Icon, Link, Logo, reducedMotion } from "../ui";
import { Perched } from "./Perched";
import { TourPenguin } from "./TourPenguin";
import { faq, TRIAL_DAYS } from "../faq";

export { TRIAL_DAYS };

/** Plans, live prices and whether sign-ups are open: undefined while loading, null if they couldn't be loaded. */
export function usePlans(): Plans | null | undefined {
  const [plans, setPlans] = useState<Plans | null | undefined>(undefined);
  useEffect(() => { void getPlans().then(setPlans); }, []);
  return plans;
}

/** Sign-ups are open unless the server says it's waitlist-only. */
export const useWaitlist = () => usePlans()?.signups === "waitlist";

/** The main call to action: start a trial, or join the waitlist while sign-ups are closed. */
export function StartButton({ className = "btn", children }: { className?: string; children?: ReactNode }) {
  return useWaitlist()
    ? <Link to="/waitlist" className={className}>Join the waitlist</Link>
    : <Link to="/signin?next=/account" className={className}>{children ?? "Start free trial"}</Link>;
}

const ORDER: PlanId[] = ["free", "basic", "pro", "team"];
/** Plans before prices load (or if they can't): the table still shows what each includes. */
const FALLBACK: PlanOffer[] = ORDER.map((id) => ({ ...PLANS[id], price: null, onSale: id === "free" }));

function included(o: PlanOffer): string[] {
  return FEATURE_ROWS.flatMap((r) => {
    const v = r.value(o.features);
    if (v === false) return [];
    return [typeof v === "string" ? (r.label === "Standups per week" ? (v === "Unlimited" ? "Every standup" : `${v} standups a week`) : `${r.label}: ${v}`) : r.label];
  });
}

/** The touring penguin needs all four cards in a row; narrower screens (and reduced motion) get one perched on the featured card. */
function useTour(): boolean {
  const query = "(min-width: 1001px)";
  const [wide, setWide] = useState(() => typeof matchMedia !== "undefined" && matchMedia(query).matches);
  useEffect(() => {
    const m = matchMedia(query);
    const on = () => setWide(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return wide && !reducedMotion();
}

function PlanCard({ offer, waitlist, trial, currency, perched }: { offer: PlanOffer; waitlist: boolean; trial: { days: number; plan: PlanId }; currency?: string; perched: boolean }) {
  const [amount, period] = offer.price ? formatPrice(offer.price).split("/")
    : offer.id === "free" && currency ? formatPrice({ amount: 0, currency, interval: "monthly" }).split("/") : [];
  const featured = offer.id === trial.plan;
  const cta = waitlist || !offer.onSale
    ? <Link to={`/waitlist?plan=${offer.id}`} className={`btn wide ${featured ? "" : "ghost"}`}>Join the waitlist</Link>
    : offer.id === "free"
      ? <Link to="/signin?next=/account" className="btn wide ghost">Start free</Link>
      : <Link to={`/signin?next=${encodeURIComponent(`/account?plan=${offer.id}`)}`} className={`btn wide ${featured ? "" : "ghost"}`}>Start free trial</Link>;
  return (
    <div className={`plan-card ${featured ? "featured" : ""}`}>
      {featured && perched && <Perched />}
      <div className="plan-head">
        <span className="plan-name">{offer.name}</span>
        {featured && <span className="pill">{trial.days} days free</span>}
      </div>
      <div className="price">
        {amount ? <><strong>{amount}</strong><span>/{period}</span></>
          : <span className="price-fallback">{offer.id === "free" ? "No charge" : "Coming soon"}</span>}
      </div>
      <p className="muted">{offer.blurb}</p>
      <ul className="checks">{included(offer).map((t) => <li key={t}><Icon name="check" size={16} />{t}</li>)}</ul>
      {cta}
    </div>
  );
}

export function PricingTable({ compare = false }: { compare?: boolean }) {
  const plans = usePlans();
  const grid = useRef<HTMLDivElement>(null);
  const touring = useTour();
  const offers = plans?.plans ?? FALLBACK;
  const trial = { days: plans?.trialDays ?? TRIAL_DAYS, plan: plans?.trialPlan ?? "pro" };
  const currency = offers.find((o) => o.price)?.price?.currency; // Free shows 0 in the paid plans' currency
  return (
    <>
      <div className="plan-grid" ref={grid}>
        {ORDER.map((id) => offers.find((o) => o.id === id)).filter((o): o is PlanOffer => !!o)
          .map((o) => <PlanCard key={o.id} offer={o} waitlist={plans?.signups === "waitlist"} trial={trial} currency={currency} perched={!touring} />)}
        {touring && <TourPenguin grid={grid} />}
      </div>
      {compare && (
        <div className="compare" role="region" aria-label="Compare plans" tabIndex={0}>
          <table>
            <thead><tr><th scope="col"><span className="sr-only">Feature</span></th>{ORDER.map((id) => <th key={id} scope="col">{PLANS[id].name}</th>)}</tr></thead>
            <tbody>
              {FEATURE_ROWS.map((r) => (
                <tr key={r.label}>
                  <th scope="row">{r.label}</th>
                  {ORDER.map((id) => {
                    const v = r.value(PLANS[id].features);
                    return <td key={id}>{typeof v === "string" ? v : v ? <Icon name="check" size={16} /> : <span className="dash" aria-label="Not included">–</span>}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

/** Email (and optionally the plan they want); the server answers the same whether or not they were already on it. */
export function WaitlistForm({ plan: initialPlan, email: initialEmail = "" }: { plan?: string; email?: string }) {
  const [email, setEmail] = useState(initialEmail);
  const [plan, setPlan] = useState(ORDER.includes(initialPlan as PlanId) ? initialPlan! : "");
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");
  const [error, setError] = useState("");
  async function submit(e: FormEvent) {
    e.preventDefault();
    setState("busy"); setError("");
    try { await api("/api/waitlist", { body: { email, plan: plan || undefined, source: location.pathname } }); setState("done"); }
    catch (err) { setError((err as Error).message); setState("idle"); }
  }
  if (state === "done") return (
    <div className="waitlist-done" role="status">
      <Icon name="check" size={20} />
      <div><strong>You're on the list.</strong><p className="muted">We sent a confirmation to {email}. We'll email you there when your invite is ready.</p></div>
    </div>
  );
  return (
    <form className="waitlist-form" onSubmit={submit}>
      {error && <div className="error" role="alert">{error}</div>}
      <label>Work email<input type="email" required autoComplete="email" placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
      <label><span>Plan you're interested in <span className="muted">(optional)</span></span>
        <select value={plan} onChange={(e) => setPlan(e.target.value)}>
          <option value="">Not sure yet</option>
          {ORDER.map((id) => <option key={id} value={id}>{PLANS[id].name}</option>)}
        </select>
      </label>
      <button className="btn wide" disabled={state === "busy"}>{state === "busy" ? "Adding you" : "Join the waitlist"}</button>
    </form>
  );
}

const FAQ = faq();

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
        <StartButton className="btn small" />
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
          <StartButton className="" />
          <Link to="/account">Sign in</Link>
        </div>
        <div>
          <h4>Legal</h4>
          <Link to="/privacy">Privacy</Link>
          <Link to="/terms">Terms</Link>
        </div>
      </div>
      <div className="footer-base"><span>© {new Date().getFullYear()} Peguin</span><span>Made in Lagos</span></div>
      <div className="footer-mark" aria-hidden>Peguin</div>
    </footer>
  );
}

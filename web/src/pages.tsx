import { useEffect, useState, type FormEvent } from "react";
import { api, formatPrice, getMe, getPlan, type Me, type Plan } from "./api";
import { Link, Logo, navigate } from "./ui";

const TRIAL_DAYS = 14; // matches TRIAL_DAYS in cloud/wrangler.jsonc

/** The live plan from Paystack; null until loaded or if billing isn't set up. */
function usePlan(): Plan | null {
  const [plan, setPlan] = useState<Plan | null>(null);
  useEffect(() => { void getPlan().then(setPlan); }, []);
  return plan;
}

export function Home() {
  return (
    <>
      <section className="hero">
        <Logo size={64} />
        <h1>Your standup, covered.</h1>
        <p className="lead">
          Double-booked? Peguin reads what you shipped, writes a 40-second update, joins the call muted and
          says it when it's your turn. It answers questions from your actual work and tells everyone it's an AI.
        </p>
        <div className="cta">
          <Link to="/signin?next=/account" className="btn">Start {TRIAL_DAYS}-day free trial</Link>
          <Link to="/pricing" className="btn ghost">See pricing</Link>
        </div>
        <p className="fine">Google Meet and Zoom today. Teams next. macOS first.</p>
      </section>

      <section className="steps">
        <div><span>1</span><h3>It reads your work</h3><p>Commits, pull requests and your Claude Code sessions since the last standup. On your computer.</p></div>
        <div><span>2</span><h3>It writes your update</h3><p>What got done, what's next, any blockers. Facts only, nothing made up.</p></div>
        <div><span>3</span><h3>It joins and speaks</h3><p>Muted with the camera off until someone says your name. Then it gives the update and takes questions.</p></div>
      </section>

      <section className="quote">
        <div className="bubble">
          <div className="who"><Logo size={22} /><strong>Ada (AI)</strong><em>AI</em></div>
          <p>Hi everyone, I'm Peguin, Ada's AI assistant. Ada is in another meeting, so I'm covering the update. Yesterday Ada merged the payment-webhook retries and fixed the flaky invoice test. Today they're migrating the users table to the new auth schema. No blockers.</p>
        </div>
      </section>
    </>
  );
}

export function Pricing() {
  const plan = usePlan();
  return (
    <section className="narrow center">
      <h1>One plan</h1>
      <p className="lead">Everything Peguin does, for one person.</p>
      <div className="card plan">
        <div className="price">{plan ? <><strong>{formatPrice(plan).split("/")[0]}</strong>/{formatPrice(plan).split("/")[1]}</> : <strong>&nbsp;</strong>}</div>
        <ul>
          <li>Automatic updates from git, GitHub and Claude Code</li>
          <li>Joins Google Meet and Zoom for you, on schedule</li>
          <li>Answers questions from your work, defers the rest</li>
          <li>{TRIAL_DAYS}-day free trial, no card needed</li>
        </ul>
        <Link to="/signin?next=/account" className="btn wide">Start free trial</Link>
      </div>
    </section>
  );
}

const ERRORS: Record<string, string> = {
  link: "That sign-in link expired or was already used. Request a new one.",
  google: "Google sign-in didn't complete. Try again.",
};

export function SignIn() {
  const params = new URLSearchParams(location.search);
  const next = params.get("next") ?? "/account";
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState<{ devLink?: string } | null>(null);
  const [error, setError] = useState(ERRORS[params.get("error") ?? ""] ?? "");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError("");
    try { setSent(await api<{ devLink?: string }>("/auth/email", { body: { email, next } })); }
    catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  }

  if (sent) return (
    <section className="narrow center">
      <h1>Check your email</h1>
      <p className="lead">We sent a sign-in link to <strong>{email}</strong>. It works once, for 15 minutes.</p>
      {sent.devLink && <p className="fine">Dev: <a href={sent.devLink}>open the link</a></p>}
    </section>
  );

  return (
    <section className="narrow">
      <h1>Sign in</h1>
      <p className="lead">New here? This creates your account.</p>
      {error && <div className="error" role="alert">{error}</div>}
      <a className="btn wide google" href={`/auth/google?next=${encodeURIComponent(next)}`}>Continue with Google</a>
      <div className="or"><span>or</span></div>
      <form onSubmit={submit}>
        <label>Email<input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        <button className="btn wide" disabled={busy}>{busy ? "Sending" : "Email me a sign-in link"}</button>
      </form>
    </section>
  );
}

const STATUS: Record<string, string> = {
  active: "Active", non_renewing: "Cancelled, active until", past_due: "Payment failed, retrying", canceled: "Ended",
};

export function Account() {
  const plan = usePlan();
  const [me, setMe] = useState<Me | null | undefined>(undefined);
  const [error, setError] = useState("");
  const done = new URLSearchParams(location.search).get("checkout") === "done";

  useEffect(() => {
    getMe().then((m) => (m ? setMe(m) : navigate("/signin?next=/account"))).catch((e: Error) => setError(e.message));
  }, []);

  const go = (path: string) => api<{ url: string }>(path, { body: {} }).then((r) => location.assign(r.url)).catch((e: Error) => setError(e.message));
  const signOut = async () => { await fetch("/auth/signout", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }); location.assign("/"); };

  if (me === undefined) return <section className="narrow"><p className="fine">{error || "Loading"}</p></section>;
  if (!me) return null;
  const sub = me.subscription;
  const until = sub?.current_period_end ? new Date(sub.current_period_end * 1000).toLocaleDateString() : null;
  const paid = sub && sub.status !== "canceled";
  const trialDays = me.trial_ends_at ? Math.ceil((me.trial_ends_at * 1000 - Date.now()) / 86400000) : 0;

  return (
    <section className="narrow">
      <h1>Account</h1>
      <p className="lead">{me.email}</p>
      {done && !me.entitled && <div className="note">Payment received. Your plan shows here in a few seconds; refresh if it doesn't.</div>}
      {error && <div className="error" role="alert">{error}</div>}

      <div className="card">
        <h3>Plan</h3>
        {paid
          ? <p>{STATUS[sub.status] ?? sub.status}{until ? ` ${sub.status === "active" ? "· renews" : ""} ${until}` : ""}</p>
          : trialDays > 0
            ? <p>Free trial · {trialDays} day{trialDays === 1 ? "" : "s"} left. Subscribe any time to keep going after.</p>
            : <p>{sub ? "Your plan has ended." : "Your free trial has ended."} Subscribe to keep using Peguin.</p>}
        {paid
          ? <button className="btn ghost" onClick={() => void go("/api/billing/portal")}>Manage billing</button>
          : <button className="btn" onClick={() => void go("/api/billing/checkout")}>Subscribe{plan ? ` · ${formatPrice(plan)}` : ""}</button>}
      </div>

      <div className="card">
        <h3>Desktop app</h3>
        <p>Peguin runs on your Mac. After installing, sign in from the app.</p>
        <button className="btn ghost" disabled title="Installers ship with the first release">Download for macOS</button>
      </div>

      <button className="link" onClick={() => void signOut()}>Sign out</button>
    </section>
  );
}

/** After /app/connect: hand the one-time code back to the desktop app. */
export function Connected() {
  const to = new URLSearchParams(location.search).get("to") ?? "";
  const valid = /^peguin:\/\/auth\?code=[A-Za-z0-9_-]+&state=[A-Za-z0-9_-]+$/.test(to);
  useEffect(() => { if (valid) location.href = to; }, [to, valid]);
  return (
    <section className="narrow center">
      <Logo size={56} />
      <h1>{valid ? "Signed in" : "Something's off"}</h1>
      <p className="lead">{valid ? "Return to the Peguin app. You can close this tab." : "Start sign-in again from the Peguin app."}</p>
      {valid && <a className="btn" href={to}>Open Peguin</a>}
    </section>
  );
}

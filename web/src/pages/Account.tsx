import { useEffect, useState, type FormEvent, type JSX } from "react";
import { isNewer } from "../../../src/core/version";
import { api, formatPrice, getMe, type Me } from "../api";
import { Faq, PricingCard, TRIAL_DAYS, usePlan } from "../components/Sections";
import { Perched } from "../components/Perched";
import { Icon, Link, Logo, navigate, Title } from "../ui";

export function Pricing() {
  return (
    <section className="page narrow-section">
      <Title as="h1">One plan</Title>
      <p className="section-lead">{TRIAL_DAYS} days free, without a card. Then one monthly price.</p>
      <PricingCard />
      <h2 className="sub">Questions</h2>
      <Faq />
    </section>
  );
}

const SIGNIN_ERRORS: Record<string, string> = {
  link: "That sign-in link expired or was already used. Request a new one.",
  google: "Google sign-in didn't complete. Try again.",
  google_state: "That sign-in started in another tab, on another address, or took more than 10 minutes. Try again from this page.",
  google_denied: "Google sign-in was cancelled. Try again, or use an email link.",
  google_exchange: "Google didn't accept the sign-in. Try again; if it keeps happening, use an email link and let us know.",
  google_account: "That Google account's email address isn't verified with Google. Verify it, or use an email link.",
};

export function SignIn() {
  const params = new URLSearchParams(location.search);
  const next = params.get("next") ?? "/account";
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState<{ devLink?: string } | null>(null);
  const [error, setError] = useState(SIGNIN_ERRORS[params.get("error") ?? ""] ?? "");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError("");
    try { setSent(await api<{ devLink?: string }>("/auth/email", { body: { email, next } })); }
    catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <section className="page auth">
      <Link to="/" className="auth-home"><Logo size={22} />Peguin</Link>
      <div className="auth-card">
        <Perched />
        {sent ? (
          <>
            <h1>Check your email</h1>
            <p className="muted">We sent a sign-in link to <strong>{email}</strong>. It works once, for 15 minutes.</p>
            {sent.devLink && <p className="fine">Dev: <a href={sent.devLink}>open the link</a></p>}
            <button className="link" onClick={() => setSent(null)}>Use a different email</button>
          </>
        ) : (
          <>
            <h1>Sign in to Peguin</h1>
            <p className="muted">New here? This creates your account and starts your {TRIAL_DAYS}-day trial.</p>
            {error && <div className="error" role="alert">{error}</div>}
            <a className="btn wide google" href={`/auth/google?next=${encodeURIComponent(next)}`}>
              <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>
              Continue with Google
            </a>
            <div className="or"><span>or</span></div>
            <form onSubmit={submit}>
              <label>Work email<input type="email" required autoComplete="email" placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} /></label>
              <button className="btn wide" disabled={busy}>{busy ? "Sending" : "Email me a sign-in link"}</button>
            </form>
          </>
        )}
      </div>
    </section>
  );
}

const STATUS: Record<string, string> = { active: "Active", non_renewing: "Cancelled", past_due: "Payment failed, retrying", canceled: "Ended" };

export function Account() {
  const plan = usePlan();
  const [me, setMe] = useState<Me | null | undefined>(undefined);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const done = new URLSearchParams(location.search).get("checkout") === "done";

  useEffect(() => {
    getMe().then((m) => (m ? setMe(m) : navigate("/signin?next=/account"))).catch((e: Error) => setError(e.message));
  }, []);

  const go = (path: string) => {
    setBusy(true); setError("");
    api<{ url: string }>(path, { body: {} }).then((r) => location.assign(r.url)).catch((e: Error) => { setError(e.message); setBusy(false); });
  };
  const signOut = async () => { await fetch("/auth/signout", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" }); location.assign("/"); };

  if (me === undefined) return <section className="page narrow-section"><p className="muted">{error || "Loading"}</p></section>;
  if (!me) return null;

  const sub = me.subscription;
  const paid = sub && sub.status !== "canceled";
  const date = (t: number | null | undefined) => (t ? new Date(t * 1000).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" }) : "");
  const trialDays = me.trial_ends_at ? Math.ceil((me.trial_ends_at * 1000 - Date.now()) / 86400000) : 0;
  const planLine = paid
    ? `${STATUS[sub.status] ?? sub.status}${sub.current_period_end ? ` · ${sub.status === "active" ? "renews" : "until"} ${date(sub.current_period_end)}` : ""}`
    : trialDays > 0 ? `Free trial · ${trialDays} day${trialDays === 1 ? "" : "s"} left` : sub ? "Your plan has ended" : "Your free trial has ended";

  return (
    <section className="page narrow-section account">
      <Title as="h1">Account</Title>
      <p className="muted">{me.email}</p>
      {done && !paid && <div className="note">Payment received. Your plan appears here in a few seconds; refresh if it doesn't.</div>}
      {error && <div className="error" role="alert">{error}</div>}

      <div className="card">
        <div className="card-row">
          <div>
            <h3>Plan</h3>
            <p className={paid || trialDays > 0 ? "" : "warn"}>{planLine}</p>
          </div>
          {paid
            ? <button className="btn ghost" disabled={busy} onClick={() => go("/api/billing/portal")}>Manage billing</button>
            : <button className="btn" disabled={busy} onClick={() => go("/api/billing/checkout")}>Subscribe{plan ? ` · ${formatPrice(plan)}` : ""}</button>}
        </div>
      </div>

      <DesktopCard app={me.app} release={me.release} />

      <button className="link" onClick={() => void signOut()}>Sign out</button>
    </section>
  );
}

function ago(t: number): string {
  const days = Math.floor((Date.now() / 1000 - t) / 86400);
  return days <= 0 ? "today" : days === 1 ? "yesterday" : `${days} days ago`;
}

function DesktopCard({ app, release }: Pick<Me, "app" | "release">) {
  const download = <a className="btn" href="/download/mac"><Icon name="laptop" size={16} />Download for Mac</a>;
  let line: string, action: JSX.Element | null;
  if (app && app.version && isNewer(release.version, app.version)) {
    line = `Version ${release.version} is out. This Mac has ${app.version}.`;
    action = release.available ? <a className="btn" href="/download/mac">Update to {release.version}</a> : null;
  } else if (app) {
    line = `Installed${app.version ? `, version ${app.version}` : ""}. Last used ${app.last_seen ? ago(app.last_seen) : "recently"}.`;
    action = null;
  } else {
    line = release.available
      ? "Install it, then sign in from Settings in the app. The first time, macOS asks you to allow it: System Settings, Privacy & Security, Open Anyway."
      : "The download opens here with the first public release.";
    action = release.available ? download : <button className="btn ghost" disabled><Icon name="laptop" size={16} />Download for Mac</button>;
  }
  return (
    <div className="card">
      <div className="card-row">
        <div>
          <h3>Desktop app {app && <span className={`pill ${app.version && isNewer(release.version, app.version) ? "live" : "ok"}`}>{app.version && isNewer(release.version, app.version) ? "Update available" : "Installed"}</span>}</h3>
          <p>{line}</p>
        </div>
        {action}
      </div>
    </div>
  );
}

/** After /app/connect: hand the one-time code back to the desktop app. */
export function Connected() {
  const to = new URLSearchParams(location.search).get("to") ?? "";
  const valid = /^peguin:\/\/auth\?code=[A-Za-z0-9_-]+&state=[A-Za-z0-9_-]+$/.test(to);
  useEffect(() => { if (valid) location.href = to; }, [to, valid]);
  return (
    <section className="page auth">
      <Link to="/" className="auth-home"><Logo size={22} />Peguin</Link>
      <div className="auth-card">
        <Logo size={44} />
        <h1>{valid ? "You're signed in" : "Something's off"}</h1>
        <p className="muted">{valid ? "Head back to the Peguin app. You can close this tab." : "Start sign-in again from the Peguin app."}</p>
        {valid && <a className="btn wide" href={to}>Open Peguin</a>}
      </div>
    </section>
  );
}

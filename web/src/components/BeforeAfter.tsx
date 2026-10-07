import { Brand, Icon, Logo } from "../ui";

const RAW: { source: string; text: string }[] = [
  { source: "git", text: "fix(invoices): flaky test, mock clock in InvoiceSpec" },
  { source: "github", text: "Merged #482 Retry payment webhooks with backoff" },
  { source: "git", text: "wip users table migration, step 1/3" },
  { source: "claude_code", text: "\"help me migrate the users table to the new auth schema without downtime\"" },
  { source: "github", text: "Review: Add idempotency keys to refunds" },
  { source: "git", text: "chore: bump deps" },
];

const BADGES = ["Grouped related work", "Dropped noise", "No hashes or URLs", "In progress, not done"];

export function BeforeAfter() {
  return (
    <div className="ba">
      <div className="ba-card raw">
        <div className="ba-label">What you did</div>
        <ul>
          {RAW.map((r, i) => <li key={i}><Brand id={r.source} size={20} /><span>{r.text}</span></li>)}
        </ul>
      </div>
      <div className="ba-arrow" aria-hidden><Icon name="arrow" size={22} /></div>
      <div className="ba-card done">
        <div className="ba-label"><Logo size={18} /> What Peguin says · 38 seconds</div>
        <p>
          Yesterday Ada merged the payment webhook retries and fixed the flaky invoice test, and reviewed the refunds
          idempotency change. Today they're <mark>migrating the users table to the new auth schema</mark>. No blockers.
        </p>
        <div className="badges">{BADGES.map((b) => <span key={b}><Icon name="check" size={13} />{b}</span>)}</div>
      </div>
    </div>
  );
}

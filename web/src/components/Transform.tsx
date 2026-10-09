import { Brand, Logo, useScrollProgress } from "../ui";

type Raw = { source: string; text: string; fate: "noise" | "a" | "b" | "c" };

// Yesterday's raw activity. As you scroll, noise is struck out, related work is
// grouped by colour, and the spoken update writes itself.
const RAW: Raw[] = [
  { source: "git", text: "fix(invoices): flaky test, mock clock in InvoiceSpec", fate: "a" },
  { source: "github", text: "Merged #482 Retry payment webhooks with backoff", fate: "a" },
  { source: "git", text: "chore: bump deps", fate: "noise" },
  { source: "git", text: "wip users table migration, step 1/3", fate: "b" },
  { source: "claude_code", text: "\"migrate the users table to the new auth schema without downtime\"", fate: "b" },
  { source: "git", text: "fix typo", fate: "noise" },
  { source: "github", text: "Review: Add idempotency keys to refunds", fate: "c" },
];

const SPOKEN: { text: string; group?: Raw["fate"] }[] = [
  { text: "Yesterday Ada" },
  { text: "merged the payment webhook retries and fixed the flaky invoice test,", group: "a" },
  { text: "and" },
  { text: "reviewed the refunds idempotency change.", group: "c" },
  { text: "Today they're" },
  { text: "moving the users table to the new auth schema.", group: "b" },
  { text: "No blockers." },
];

const clamp = (x: number) => Math.min(1, Math.max(0, x));

export function Transform() {
  const [ref, p] = useScrollProgress<HTMLDivElement>();
  const strike = clamp(p / 0.3);            // 0 → 0.3: noise goes
  const group = clamp((p - 0.25) / 0.25);   // 0.25 → 0.5: related work lights up
  const write = clamp((p - 0.45) / 0.45);   // 0.45 → 0.9: the update writes itself
  const words = SPOKEN.flatMap((s) => s.text.split(" ").map((w) => ({ w, group: s.group })));
  const shown = Math.round(words.length * write);
  const seconds = Math.round(38 * write);

  return (
    <div className="transform" ref={ref}>
      <div className="transform-sticky">
        <div className="transform-head">
          <h2>From yesterday's commits to a 40‑second update</h2>
          <p className="section-lead">Scroll to watch Peguin decide what your team needs to hear.</p>
        </div>
        <div className="transform-grid">
          <div className="t-card raw">
            <div className="t-label">Yesterday, as it happened</div>
            <ul>
              {RAW.map((r, i) => (
                <li key={i} className={`fate-${r.fate}`}
                  style={{
                    opacity: r.fate === "noise" ? 1 - strike * 0.65 : 1,
                    ["--strike" as string]: r.fate === "noise" ? strike : 0,
                    ["--glow" as string]: r.fate === "noise" ? 0 : group,
                  }}>
                  <Brand id={r.source} size={20} /><span>{r.text}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="t-card spoken" style={{ ["--on" as string]: write > 0 ? 1 : 0.4 }}>
            <div className="t-label"><Logo size={18} />What Peguin says <span className="t-time">0:{String(seconds).padStart(2, "0")}</span></div>
            <p>
              {words.map((x, i) => (
                <span key={i} className={`w ${i < shown ? "in" : ""} ${x.group ? `g-${x.group}` : ""}`}>{x.w} </span>
              ))}
            </p>
            <div className="t-progress"><i style={{ width: `${write * 100}%` }} /></div>
          </div>
        </div>
      </div>
    </div>
  );
}

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Brand, Link, Logo, reducedMotion } from "../ui";

/* A faithful, scripted copy of the desktop app (desktop/src/renderer): a cursor
   prepares the update, joins the standup, and Peguin speaks and answers. */

const W = 1040, H = 620; // design size; scaled down to fit
const W_PHONE = 660, H_PHONE = 560; // phones: just the main pane, so the text stays readable
const NAME = "Ada (AI)";
const SCRIPT = "Hi everyone, I'm Peguin, Ada's AI assistant. Ada is in another meeting, so I'm covering the update. Yesterday Ada merged the payment webhook retries and fixed the flaky invoice test. Today they're migrating the users table to the new auth schema. No blockers.";
const ANSWER = "It's in progress. There's no date yet, so I'll get Ada to follow up.";
const FACTS = ["Merged #482: retry payment webhooks", "Fixed the flaky invoice test", "Users table migration to the new auth schema: in progress, no date"];

type Line = { kind: "heard"; text: string; action?: string } | { kind: "ai"; text: string } | { kind: "system"; text: string };
type Target = "start" | "prepare" | "live" | "rest" | "leave" | "today";
type State = {
  view: "today" | "live";
  draft: "none" | "writing" | "done";
  status: "Idle" | "Joining" | "In the call";
  lines: Line[];
  speaking: boolean;
  cursor: Target;
  click: number;
  user: string;
};

const START: State = { view: "today", draft: "none", status: "Idle", lines: [], speaking: false, cursor: "start", click: 0, user: "Tomorrow at 09:30" };
const push = (l: Line) => (s: State): State => ({ ...s, lines: [...s.lines, l] });

// [delay before this step in ms, change]
const STEPS: [number, (s: State) => State][] = [
  [700, (s) => ({ ...s, cursor: "prepare" })],
  [950, (s) => ({ ...s, click: s.click + 1 })],
  [200, (s) => ({ ...s, draft: "writing", user: "Writing your update" })],
  [1700, (s) => ({ ...s, draft: "done", user: "Tomorrow at 09:30", cursor: "rest" })],
  [4300, (s) => ({ ...s, cursor: "live" })],
  [950, (s) => ({ ...s, click: s.click + 1 })],
  [200, (s) => ({ ...s, view: "live", status: "Joining", user: "Joining a meeting", cursor: "rest" })],
  [1200, (s) => push({ kind: "system", text: `Joined Daily standup as "${NAME}"` })({ ...s, status: "In the call", user: "In your standup" })],
  [1100, push({ kind: "heard", text: "Morning all. David, kick us off?" })],
  [1700, push({ kind: "heard", text: "Shipped the onboarding emails yesterday, on the billing page today." })],
  [2000, push({ kind: "heard", text: "Nice. Ada, you're up.", action: "gave the update" })],
  [700, (s) => push({ kind: "ai", text: SCRIPT })({ ...s, speaking: true })],
  [5200, (s) => push({ kind: "heard", text: "Is the auth migration landing this week?", action: "answered" })({ ...s, speaking: false })],
  [800, (s) => push({ kind: "ai", text: ANSWER })({ ...s, speaking: true })],
  [2400, (s) => ({ ...s, speaking: false, cursor: "leave" })],
  [1100, (s) => ({ ...s, click: s.click + 1 })],
  [200, (s) => push({ kind: "system", text: "Left the meeting" })({ ...s, status: "Idle", user: "Tomorrow at 09:30" })],
  [1500, (s) => ({ ...s, cursor: "today" })],
  [950, (s) => ({ ...s, click: s.click + 1 })],
  [200, (s) => ({ ...s, view: "today", cursor: "rest" })],
  [3000, () => START],
];

export function AppShowcase() {
  return (
    <section className="showcase" data-bg="#ffffff">
      <div className="sc-inner">
        <div className="sc-icon" data-reveal><Logo size={58} /></div>
        <h2 data-reveal>Send Peguin to standup.<br />Get on with your morning.</h2>
        <div className="cta center" data-reveal>
          <Link to="/signin?next=/account" className="btn big light">Try it free</Link>
        </div>
        <AppDemo />
      </div>
    </section>
  );
}

function AppDemo() {
  const fit = useRef<HTMLDivElement>(null);
  const win = useRef<HTMLDivElement>(null);
  const targets = useRef<Partial<Record<Target, HTMLElement | null>>>({});
  const [scale, setScale] = useState(1);
  const [phone, setPhone] = useState(false);
  const w = phone ? W_PHONE : W, h = phone ? H_PHONE : H;
  const [rise, setRise] = useState(reducedMotion() ? 1 : 0);
  const [visible, setVisible] = useState(false);
  const [s, setS] = useState<State>(START);
  const [pos, setPos] = useState({ x: W * 0.62, y: H * 0.86 });
  const step = useRef(0);

  // Scale the fixed-size window to the space available.
  useLayoutEffect(() => {
    const el = fit.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const small = el.clientWidth < 600;
      setPhone(small);
      setScale(Math.min(1, el.clientWidth / (small ? W_PHONE : W)));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Rises and straightens as it scrolls in; the script only runs while on screen.
  useEffect(() => {
    const el = fit.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setVisible(!!e?.isIntersecting), { threshold: 0.25 });
    io.observe(el);
    if (reducedMotion()) return () => io.disconnect();
    let raf = 0;
    const update = () => {
      raf = 0;
      const top = el.getBoundingClientRect().top;
      setRise(Math.min(1, Math.max(0, (innerHeight - top) / (innerHeight * 0.7))));
    };
    const on = () => { if (!raf) raf = requestAnimationFrame(update); };
    update();
    addEventListener("scroll", on, { passive: true });
    return () => { io.disconnect(); removeEventListener("scroll", on); cancelAnimationFrame(raf); };
  }, []);

  useEffect(() => {
    if (!visible) return;
    const [delay, change] = STEPS[step.current]!;
    const t = setTimeout(() => {
      setS(change);
      step.current = (step.current + 1) % STEPS.length;
    }, delay);
    return () => clearTimeout(t);
  }, [visible, s]);

  // Move the cursor to the centre of its target (in unscaled window coordinates).
  useLayoutEffect(() => {
    const el = s.cursor === "start" ? null : targets.current[s.cursor];
    const box = win.current?.getBoundingClientRect();
    if (s.cursor === "rest") { setPos({ x: w * 0.7, y: h * 0.6 }); return; }
    if (!el || !box) return;
    const r = el.getBoundingClientRect();
    setPos({ x: (r.left - box.left + r.width / 2) / scale, y: (r.top - box.top + r.height / 2) / scale });
  }, [s.cursor, s.view, scale, w, h]);

  const ref = (k: Target) => (el: HTMLElement | null) => { targets.current[k] = el; };
  const inCall = s.status !== "Idle";

  return (
    <div className="sc-frame" ref={fit} style={{ height: h * scale + 13, transform: `translateY(${(1 - rise) * 80}px) perspective(1600px) rotateX(${(1 - rise) * 10}deg)` }} aria-hidden>
      <div className={`ad ${phone ? "phone" : ""}`} ref={win} style={{ width: w, height: h, transform: `scale(${scale})` }}>
        <nav className="ad-rail">
          <span className="ad-lights"><i /><i /><i /></span>
          <span className={`ad-home ${s.view === "today" ? "on" : ""}`}><Logo size={24} /></span>
          <span className="ad-sep" />
          <span className={`ad-rbtn ${s.view === "live" ? "on" : ""}`}>{I.live}{inCall && <b className="ad-badge" />}</span>
          <span className="ad-rbtn">{I.sources}</span>
        </nav>

        <aside className="ad-side">
          <header>Peguin</header>
          <div className="ad-side-body">
            <p className="ad-label">Workspace</p>
            <span ref={ref("today")} className={`ad-chan ${s.view === "today" ? "on" : ""}`}>{I.hash}today</span>
            <span ref={ref("live")} className={`ad-chan ${s.view === "live" ? "on" : ""}`}>{I.hash}live-meeting{inCall && <em>LIVE</em>}</span>
            <span className="ad-chan">{I.hash}sources</span>
            <p className="ad-label">Next standup</p>
            <div className="ad-card"><strong>Tomorrow at 09:30</strong><span>Auto-join on</span></div>
          </div>
          <footer className="ad-user">
            <span className="ad-av">A</span>
            <div><strong>Ada Obi</strong><span className={inCall ? "online" : ""}>{s.user}</span></div>
            {I.settings}
          </footer>
        </aside>

        <main className="ad-main">
          {s.view === "today" ? (
            <>
              <ChannelHead name="today" topic="Your next update">
                {s.draft === "done" && <span className="ad-btn ghost">{I.refresh}Refresh</span>}
              </ChannelHead>
              <div className="ad-scroll">
                {s.draft === "none" && (
                  <div className="ad-empty">
                    <Logo size={52} />
                    <h3>No update yet</h3>
                    <p>Built from your work since the last standup.</p>
                    <span ref={ref("prepare")} className={`ad-btn primary ${pressed(s, "prepare")}`}>Prepare update</span>
                  </div>
                )}
                {s.draft === "writing" && <p className="ad-typing"><i /><i /><i />Peguin is writing</p>}
                {s.draft === "done" && (
                  <article className="ad-msg in">
                    <span className="ad-av bot"><Logo size={22} /></span>
                    <div>
                      <div className="ad-head"><strong>{NAME}</strong><span className="ad-tag">AI</span><time>Prepared 09:15</time></div>
                      <Typed text={SCRIPT} ms={2600} />
                      <div className="ad-embed">
                        <div>Facts used for questions</div>
                        <ul>{FACTS.map((f) => <li key={f}>{f}</li>)}</ul>
                      </div>
                      <div className="ad-chips">
                        <span><Brand id="github" size={16} />2 pull requests</span>
                        <span><Brand id="git" size={16} />6 commits</span>
                        <span><Brand id="claude_code" size={16} />3 sessions</span>
                        <span className="plain">Since Mon 09:30</span>
                      </div>
                    </div>
                  </article>
                )}
              </div>
            </>
          ) : (
            <>
              <ChannelHead name="live-meeting" topic={s.status === "In the call" ? "In the call · Daily standup" : s.status === "Joining" ? "Joining" : "Idle"}>
                <span className={`ad-dot ${s.status === "In the call" ? "on" : s.status === "Joining" ? "wait" : ""}`} />
              </ChannelHead>
              <div className="ad-scroll ad-live">
                {s.lines.length === 0 && <p className="ad-system center">Joining meet.google.com/abc-defg-hij</p>}
                {s.lines.map((l, i) => <LineView key={i} line={l} speaking={s.speaking && i === s.lines.length - 1} />)}
              </div>
              <div className="ad-composer">
                <span className="ad-input">meet.google.com/abc-defg-hij</span>
                <span ref={ref("leave")} className={`ad-btn ${inCall ? "danger" : "primary"} ${pressed(s, "leave")}`}>{inCall ? "Leave" : <>{I.send}Join</>}</span>
              </div>
            </>
          )}
        </main>

        {(
          <div className="ad-cursor" style={{ transform: `translate(${pos.x}px, ${pos.y}px)` }}>
            <span key={s.click} className="ad-ripple" />
            <svg width="22" height="22" viewBox="0 0 24 24"><path d="M5 3l14 8-6.5 1.5L10 19z" fill="#191919" stroke="#fff" strokeWidth="1.6" strokeLinejoin="round" /></svg>
          </div>
        )}
      </div>
    </div>
  );
}

/** The button under the cursor looks pressed for a moment after a click. */
const pressed = (s: State, t: Target) => (s.cursor === t ? "hover" : "");

function ChannelHead({ name, topic, children }: { name: string; topic: string; children?: ReactNode }) {
  return (
    <header className="ad-chead">
      {I.hash}<strong>{name}</strong><span className="ad-topic">{topic}</span>
      <span className="ad-chead-end">{children}</span>
    </header>
  );
}

function LineView({ line, speaking }: { line: Line; speaking: boolean }) {
  if (line.kind === "system") return <p className="ad-system center in">{line.text}</p>;
  if (line.kind === "heard") return (
    <div className="ad-msg in">
      <span className="ad-av meet">M</span>
      <div>
        <div className="ad-head"><strong>Meeting</strong></div>
        <p className="ad-text">{line.text}</p>
        {line.action && <p className="ad-system">→ Peguin {line.action}</p>}
      </div>
    </div>
  );
  return (
    <div className="ad-msg in">
      <span className="ad-av bot"><Logo size={22} /></span>
      <div>
        <div className="ad-head"><strong>{NAME}</strong><span className="ad-tag">AI</span>{speaking && <span className="ad-wave"><i /><i /><i /><i /><i /></span>}</div>
        <Typed text={line.text} ms={Math.min(4600, line.text.length * 16)} />
      </div>
    </div>
  );
}

/** Text that appears word by word, like speech. */
function Typed({ text, ms }: { text: string; ms: number }) {
  const words = text.split(" ");
  const [n, setN] = useState(0);
  useEffect(() => {
    const start = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const k = Math.min(words.length, Math.ceil(((t - start) / ms) * words.length));
      setN(k);
      if (k < words.length) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [text, ms, words.length]);
  return <p className="ad-text">{words.slice(0, n).join(" ")}<span className="ad-ghost">{n < words.length ? " " + words.slice(n).join(" ") : ""}</span></p>;
}

const svg = (d: ReactNode, size = 18) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{d}</svg>
);
const I = {
  hash: svg(<path d="M5 9h14M5 15h14M10 3 8 21M16 3l-2 18" />, 17),
  live: svg(<><circle cx="12" cy="12" r="2" /><path d="M16.2 7.8a6 6 0 0 1 0 8.4M7.8 16.2a6 6 0 0 1 0-8.4M19 5a10 10 0 0 1 0 14M5 19A10 10 0 0 1 5 5" /></>, 20),
  sources: svg(<><path d="M9 7V3M15 7V3" /><path d="M6 7h12v4a6 6 0 0 1-12 0z" /><path d="M12 17v4" /></>, 20),
  settings: svg(<><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></>, 17),
  refresh: svg(<><path d="M21 12a9 9 0 1 1-2.6-6.4" /><path d="M21 3v6h-6" /></>, 15),
  send: svg(<path d="M22 2 11 13M22 2l-7 20-4-9-9-4z" />, 15),
};

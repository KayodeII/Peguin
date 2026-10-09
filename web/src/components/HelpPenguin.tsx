import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { api, getMe } from "../api";
import { faq } from "../faq";
import { Icon, Logo, reducedMotion } from "../ui";
import { chirp } from "./Perched";

const W = 64; // walker width in px
const STEP_MS = 520; // one waddle
const STEPS = 5;
const WALK_SPEED = 34; // px per second
const FLAG_MS = 3200;
const SEEN_KEY = "peguin-help-intro";

type Phase = "walk" | "flag";

const seen = () => { try { return sessionStorage.getItem(SEEN_KEY) === "1"; } catch { return false; } };
const markSeen = () => { try { sessionStorage.setItem(SEEN_KEY, "1"); } catch { /* private mode */ } };

/**
 * The help entry point. Once per visit Peguin walks in five steps, raises a
 * "Need help?" flag and chirps, then settles into the chat button in the corner.
 */
export function HelpPenguin() {
  const [intro, setIntro] = useState(() => !seen());
  const [open, setOpen] = useState(false);
  const done = useCallback(() => { markSeen(); setIntro(false); }, []);

  return (
    <>
      {!open && (intro
        ? <Walker onOpen={() => { chirp(); done(); setOpen(true); }} onDone={done} />
        : <button className="hp-launcher" onClick={() => setOpen(true)} aria-label="Open help chat"><Logo size={28} /></button>)}
      {open && <HelpChat onClose={() => setOpen(false)} />}
    </>
  );
}

/* ------------------------------------------------------------ the walk-in */

function Walker({ onOpen, onDone }: { onOpen: () => void; onDone: () => void }) {
  const box = useRef<HTMLDivElement>(null);
  // Ends where the chat button sits, so the hand-off looks continuous.
  const endX = () => innerWidth - W - 20;
  const still = reducedMotion(); // no walk-in: it appears with the flag up
  const x = useRef(endX() + (still ? 0 : (WALK_SPEED * STEPS * STEP_MS) / 1000));
  const [phase, setPhase] = useState<Phase>(still ? "flag" : "walk");
  const [hover, setHover] = useState(false);

  // Walk left for five steps.
  useEffect(() => {
    const place = () => { if (box.current) box.current.style.transform = `translate3d(${x.current}px,0,0)`; };
    place();
    if (phase !== "walk") return;
    let last = performance.now(), raf = 0;
    const tick = (t: number) => {
      const dt = Math.min(0.05, (t - last) / 1000);
      last = t;
      x.current = Math.max(endX(), x.current - WALK_SPEED * dt);
      place();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const t = setTimeout(() => setPhase("flag"), STEPS * STEP_MS);
    return () => { cancelAnimationFrame(raf); clearTimeout(t); };
  }, [phase]);

  // Flag up and a chirp, then become the chat button (held while the pointer is on it).
  useEffect(() => {
    if (phase !== "flag" || hover) return;
    const t = setTimeout(onDone, FLAG_MS);
    return () => clearTimeout(t);
  }, [phase, hover, onDone]);

  const flagUp = phase === "flag";
  return (
    <div ref={box} className={`hp ${phase} ${flagUp ? "flag-up chirping" : "profile"} flag-left`}
      style={{ ["--dir" as string]: -1 }} onPointerEnter={() => setHover(true)} onPointerLeave={() => setHover(false)}>
      <button className="hp-bird" onClick={onOpen} aria-label="Need help? Open the help chat">
        <span className="hp-flag" aria-hidden><i className="hp-pole" /><span className="hp-cloth">Need help?</span></span>
        <span className="hp-chirp" aria-hidden>chirp!</span>
        <PenguinSide />
        <PenguinSprite />
      </button>
    </div>
  );
}

/** Side profile, facing right; flipped with --dir when walking left. */
export function PenguinSide() {
  return (
    <svg className="hp-sprite hp-side" viewBox="0 0 80 100" width={W} height={80} aria-hidden>
      <g className="hp-roller">
        <g className="hp-sbody">
          <ellipse className="hp-sfoot hp-sfoot-back" cx="37" cy="94" rx="10" ry="4" fill="#e0912a" />
          <path d="M19 78 L7 90 L22 88 Z" fill="#191919" />
          <ellipse cx="38" cy="56" rx="22" ry="35" fill="#191919" />
          <ellipse cx="47" cy="63" rx="12" ry="26" fill="#f4f1ea" />
          <circle cx="48" cy="36" r="5" fill="#fff" />
          <circle cx="50" cy="36.5" r="2.4" fill="#191919" />
          <circle cx="51" cy="35.5" r=".8" fill="#fff" />
          <path className="hp-beak-top" d="M57 40 L69 43.5 L57 47 Z" fill="#f2a93b" />
          <ellipse cx="52" cy="47" rx="3.4" ry="2" fill="#f4a3a3" opacity=".55" />
          <path className="hp-sflip" d="M34 50 C26 58 24 72 27 84 C29 88 33 87 34 82 C35 72 37 62 40 56 Z" fill="#0b0b0b" />
          <ellipse className="hp-sfoot hp-sfoot-front" cx="45" cy="94" rx="10" ry="4" fill="#f2a93b" />
        </g>
      </g>
    </svg>
  );
}

/** Facing the viewer: standing, holding the flag. */
export function PenguinSprite() {
  return (
    <svg className="hp-sprite hp-front" viewBox="0 0 80 100" width={W} height={80} aria-hidden>
      <g className="hp-roller">
        <ellipse className="hp-foot hp-foot-l" cx="29" cy="94" rx="9" ry="4.5" fill="#f2a93b" />
        <ellipse className="hp-foot hp-foot-r" cx="51" cy="94" rx="9" ry="4.5" fill="#f2a93b" />
        <g className="hp-waddle">
          <path className="hp-flip-l" d="M17 48 C6 56 3 72 7 84 C9 89 14 88 15 82 C16 72 18 62 21 55 Z" fill="#191919" />
          <path className="hp-flip-r" d="M63 48 C74 56 77 72 73 84 C71 89 66 88 65 82 C64 72 62 62 59 55 Z" fill="#191919" />
          <ellipse cx="40" cy="56" rx="25" ry="35" fill="#191919" />
          <ellipse cx="40" cy="63" rx="16.5" ry="26" fill="#f4f1ea" />
          <g className="hp-face">
            <circle cx="31" cy="38" r="5.5" fill="#fff" /><circle cx="49" cy="38" r="5.5" fill="#fff" />
            <circle className="hp-pupil" cx="31.5" cy="39" r="2.6" fill="#191919" /><circle className="hp-pupil" cx="49.5" cy="39" r="2.6" fill="#191919" />
            <path className="hp-beak-top" d="M34 45 h12 l-6 5.5 z" fill="#f2a93b" />
            <path className="hp-beak-bottom" d="M36 49 h8 l-4 3.5 z" fill="#e0912a" />
            <ellipse cx="24" cy="48" rx="4" ry="2.4" fill="#f4a3a3" opacity=".55" />
            <ellipse cx="56" cy="48" rx="4" ry="2.4" fill="#f4a3a3" opacity=".55" />
          </g>
        </g>
      </g>
    </svg>
  );
}

/* ------------------------------------------------------------ the chat */

type Msg = { role: "user" | "assistant"; text: string; handoff?: boolean };
type View = "chat" | "contact" | "sent";

const GREETING: Msg = { role: "assistant", text: "Ask me anything about Peguin. I'm an AI and only answer from our help pages. If I don't know, you can message the team." };
const SUGGESTED = faq().filter((_, i) => [0, 1, 3, 7].includes(i));

function HelpChat({ onClose }: { onClose: () => void }) {
  const [msgs, setMsgs] = useState<Msg[]>([GREETING]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<View>("chat");
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const list = useRef<HTMLDivElement>(null);
  const field = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { void getMe().then((m) => m && setEmail((e) => e || m.email)).catch(() => {}); }, []);
  useEffect(() => { field.current?.focus(); }, [view]);
  useEffect(() => { list.current?.scrollTo({ top: list.current.scrollHeight, behavior: "smooth" }); }, [msgs, busy]);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    addEventListener("keydown", esc);
    return () => removeEventListener("keydown", esc);
  }, [onClose]);

  const lastQuestion = () => [...msgs].reverse().find((m) => m.role === "user")?.text ?? "";
  const toContact = () => { setNote((n) => n || lastQuestion()); setError(""); setView("contact"); };

  async function send(text: string) {
    const q = text.trim();
    if (!q || busy) return;
    setInput("");
    const local = SUGGESTED.find((f) => f.q === q);
    const next = [...msgs, { role: "user" as const, text: q }];
    setMsgs(next);
    if (local) { setMsgs([...next, { role: "assistant", text: local.a }]); return; }
    setBusy(true);
    try {
      const r = await api<{ text: string; handoff: boolean }>("/api/support/chat", { body: { messages: next.map(({ role, text }) => ({ role, text })) } });
      setMsgs([...next, { role: "assistant", text: r.text, handoff: r.handoff }]);
    } catch (e) {
      const status = (e as { status?: number }).status;
      const text = status === 429 ? (e as Error).message : "I can't answer right now. You can message the team instead.";
      setMsgs([...next, { role: "assistant", text, handoff: true }]);
    } finally { setBusy(false); }
  }

  async function contact(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError("");
    const transcript = msgs.slice(1).map((m) => `${m.role === "user" ? "Visitor" : "Assistant"}: ${m.text}`).join("\n");
    try { await api("/api/support/message", { body: { email, message: note, transcript, page: location.pathname } }); setView("sent"); }
    catch (err) { setError((err as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <section className="hc" role="dialog" aria-label="Peguin help">
      <header className="hc-head">
        <span className="hc-avatar"><Logo size={26} /></span>
        <strong>{view === "chat" ? "Help" : "Message the team"}</strong>
        <button className="hc-close" onClick={onClose} aria-label="Close help"><Icon name="close" size={16} /></button>
      </header>

      {view === "chat" && (
        <>
          <div className="hc-list" ref={list} data-lenis-prevent>
            {msgs.map((m, i) => (
              <div key={i} className={`hc-msg ${m.role}`}>
                <p>{m.text}</p>
                {m.handoff && <button className="hc-handoff" onClick={toContact}>Message the team</button>}
              </div>
            ))}
            {busy && <div className="hc-msg assistant typing" aria-label="Typing"><i /><i /><i /></div>}
            {msgs.length === 1 && (
              <div className="hc-common">
                <p>Common questions</p>
                {SUGGESTED.map((f) => <button key={f.q} onClick={() => void send(f.q)}>{f.q}</button>)}
              </div>
            )}
          </div>
          <form className="hc-input" onSubmit={(e) => { e.preventDefault(); void send(input); }}>
            <textarea ref={field} rows={1} value={input} placeholder="Ask a question" maxLength={1000}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(input); } }} />
            <button className="hc-send" disabled={!input.trim() || busy} aria-label="Send"><Icon name="arrow" size={18} /></button>
          </form>
          <footer className="hc-foot">
            <button onClick={toContact}>Message the team</button>
          </footer>
        </>
      )}

      {view === "contact" && (
        <form className="hc-form" onSubmit={contact} data-lenis-prevent>
          <p className="muted">A person reads this and replies to your email.</p>
          {error && <div className="error" role="alert">{error}</div>}
          <label>Your email<input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" /></label>
          <label>Message<textarea ref={field} required rows={5} maxLength={4000} value={note} onChange={(e) => setNote(e.target.value)} /></label>
          <button className="btn wide" disabled={busy}>{busy ? "Sending" : "Send to the team"}</button>
          <button type="button" className="link" onClick={() => setView("chat")}>Back to chat</button>
        </form>
      )}

      {view === "sent" && (
        <div className="hc-sent">
          <PenguinSprite />
          <h3>Message sent</h3>
          <p className="muted">The team will reply to {email}.</p>
          <button className="btn ghost" onClick={() => setView("chat")}>Back to chat</button>
        </div>
      )}
    </section>
  );
}

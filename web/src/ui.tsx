import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { siClaude, siGit, siGithub, siGooglemeet, siJira, siLinear, siZoom, type SimpleIcon } from "simple-icons";

/** Client-side navigation; the Worker serves index.html for every page. "/#faq" scrolls to a section. */
export function navigate(to: string) {
  const url = new URL(to, location.href);
  const samePage = url.pathname === location.pathname;
  history.pushState(null, "", url.pathname + url.search + url.hash);
  if (!samePage) dispatchEvent(new PopStateEvent("popstate"));
  requestAnimationFrame(() => scrollToHash(url.hash));
}

type Smooth = { scrollTo: (target: number | HTMLElement, opts?: { offset?: number; immediate?: boolean }) => void };
const smooth = () => (window as unknown as { __lenis?: Smooth }).__lenis;

export function scrollToHash(hash: string) {
  const el = hash ? document.getElementById(hash.slice(1)) : null;
  const lenis = smooth();
  if (lenis) return lenis.scrollTo(el ?? 0, { offset: -72, immediate: !hash });
  if (!el) return scrollTo({ top: 0 });
  el.scrollIntoView({ behavior: reducedMotion() ? "auto" : "smooth" });
}

export function Link({ to, className, children, onClick }: { to: string; className?: string; children: ReactNode; onClick?: () => void }) {
  const go = (e: MouseEvent) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey) return;
    e.preventDefault(); onClick?.(); navigate(to);
  };
  return <a href={to} className={className} onClick={go}>{children}</a>;
}

export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden className="logo">
      <ellipse cx="16" cy="17" rx="10" ry="12" fill="#0b1118" />
      <ellipse cx="16" cy="20" rx="6.5" ry="8" fill="#f4f1ea" />
      <circle cx="12.5" cy="12" r="1.6" fill="#fff" /><circle cx="19.5" cy="12" r="1.6" fill="#fff" />
      <circle cx="12.9" cy="12.2" r="0.75" fill="#0b1118" /><circle cx="19.1" cy="12.2" r="0.75" fill="#0b1118" />
      <path d="M13.5 15.5h5l-2.5 2.6z" fill="#f2a93b" />
    </svg>
  );
}

const BRANDS: Record<string, SimpleIcon> = {
  google_meet: siGooglemeet, zoom: siZoom, git: siGit, github: siGithub, claude_code: siClaude, linear: siLinear, jira: siJira,
};

/** Brand mark as a white glyph on its brand colour. */
export function Brand({ id, size = 28, label }: { id: keyof typeof BRANDS | string; size?: number; label?: boolean }) {
  const icon = BRANDS[id];
  if (!icon) return null;
  return (
    <span className="brand">
      <span className="brand-tile" style={{ width: size, height: size, background: `#${icon.hex}` }} aria-hidden>
        <svg viewBox="0 0 24 24" width={size * 0.58} height={size * 0.58} fill="#fff"><path d={icon.path} /></svg>
      </span>
      {label && <span>{icon.title}</span>}
    </span>
  );
}

const ICONS: Record<string, ReactNode> = {
  check: <path d="M20 6 9 17l-5-5" />,
  arrow: <><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></>,
  mic: <><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></>,
  micOff: <><path d="m3 3 18 18" /><path d="M9 9v2a3 3 0 0 0 5.1 2.1M15 9.3V6a3 3 0 0 0-5.7-1.3" /><path d="M5 11a7 7 0 0 0 11.5 5.4M19 11a7 7 0 0 1-.6 2.8M12 18v3" /></>,
  doc: <><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5M9 13h6M9 17h4" /></>,
  ear: <><path d="M6 8.5a6 6 0 1 1 12 0c0 3.5-3 4.5-3 7.5a3 3 0 0 1-6 0" /><path d="M9.5 8.5a2.5 2.5 0 0 1 5 0" /></>,
  shield: <><path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6z" /><path d="m9 12 2 2 4-4" /></>,
  laptop: <><rect x="4" y="5" width="16" height="11" rx="2" /><path d="M2 19h20" /></>,
  key: <><circle cx="8" cy="15" r="4" /><path d="m11 12 9-9M16 7l3 3" /></>,
  tag: <><path d="M20 12 12 20l-8-8V4h8z" /><circle cx="8" cy="8" r="1.5" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  plug: <><path d="M9 7V3M15 7V3" /><path d="M6 7h12v4a6 6 0 0 1-12 0z" /><path d="M12 17v4" /></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /></>,
  sparkle: <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6" />,
  users: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6.5 6.5 0 0 1 3.5 6" /></>,
  globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" /></>,
  code: <><path d="m8 7-5 5 5 5M16 7l5 5-5 5" /></>,
  wave: <path d="M3 12h2M7 8v8M11 5v14M15 9v6M19 11v2" />,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
};

export function Icon({ name, size = 20 }: { name: keyof typeof ICONS | string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {ICONS[name]}
    </svg>
  );
}

/** Headline with an italic serif emphasis, e.g. <Title em="keep the update.">Skip the standup,</Title> */
export function Title({ as: Tag = "h2", children, em, className }: { as?: "h1" | "h2"; children: ReactNode; em?: string; className?: string }) {
  return <Tag className={className}>{children}{em && <> <em>{em}</em></>}</Tag>;
}

export const reducedMotion = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Adds .in to every [data-reveal] element as it scrolls into view (once). Re-scans when `key` changes. */
export function useRevealAll(key: unknown) {
  useEffect(() => {
    const els = [...document.querySelectorAll<HTMLElement>("[data-reveal]:not(.in)")];
    if (reducedMotion() || !("IntersectionObserver" in window)) { els.forEach((e) => e.classList.add("in")); return; }
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
    }, { rootMargin: "0px 0px -10% 0px", threshold: 0.12 });
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, [key]);
}

/** True once the element has been on screen. */
export function useInView<T extends Element>(threshold = 0.3): [React.RefObject<T | null>, boolean] {
  const ref = useRef<T>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    if (!ref.current || seen) return;
    if (reducedMotion()) { setSeen(true); return; }
    const io = new IntersectionObserver(([e]) => { if (e?.isIntersecting) { setSeen(true); io.disconnect(); } }, { threshold });
    io.observe(ref.current);
    return () => io.disconnect();
  }, [seen]);
  return [ref, seen];
}

/** Counts up to `to` once visible. */
export function CountUp({ to, suffix = "", duration = 1200 }: { to: number; suffix?: string; duration?: number }) {
  const [ref, seen] = useInView<HTMLSpanElement>();
  const [n, setN] = useState(0);
  useEffect(() => {
    if (!seen) return;
    if (reducedMotion()) { setN(to); return; }
    const start = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      setN(Math.round(to * (1 - (1 - p) ** 3)));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [seen, to, duration]);
  return <span ref={ref}>{n}{suffix}</span>;
}

export function Img({ photo, className, eager }: { photo: { src: string; alt: string }; className?: string; eager?: boolean }) {
  return <img src={photo.src} alt={photo.alt} className={className} loading={eager ? "eager" : "lazy"} decoding="async" />;
}

/**
 * Scroll progress through a tall element: 0 when its top reaches the top of the
 * viewport, 1 when its bottom reaches the bottom. Drives sticky, scroll-linked scenes.
 */
export function useScrollProgress<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T>(null);
  const [p, setP] = useState(reducedMotion() ? 1 : 0);
  useEffect(() => {
    if (reducedMotion()) return;
    let raf = 0;
    const update = () => {
      raf = 0;
      const el = ref.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const travel = r.height - innerHeight;
      setP(travel <= 0 ? (r.top < innerHeight / 2 ? 1 : 0) : Math.min(1, Math.max(0, -r.top / travel)));
    };
    const on = () => { if (!raf) raf = requestAnimationFrame(update); };
    update();
    addEventListener("scroll", on, { passive: true });
    addEventListener("resize", on);
    return () => { removeEventListener("scroll", on); removeEventListener("resize", on); cancelAnimationFrame(raf); };
  }, []);
  return [ref, p];
}

/** Gentle vertical parallax: the element drifts by up to `amount` px as it crosses the viewport. */
export function useParallax<T extends HTMLElement>(amount = 40): React.RefObject<T | null> {
  const ref = useRef<T>(null);
  useEffect(() => {
    if (reducedMotion()) return;
    let raf = 0;
    const update = () => {
      raf = 0;
      const el = ref.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const t = (r.top + r.height / 2 - innerHeight / 2) / innerHeight; // -1..1 around the centre
      el.style.transform = `translate3d(0, ${(-t * amount).toFixed(1)}px, 0)`;
    };
    const on = () => { if (!raf) raf = requestAnimationFrame(update); };
    update();
    addEventListener("scroll", on, { passive: true });
    return () => { removeEventListener("scroll", on); cancelAnimationFrame(raf); };
  }, [amount]);
  return ref;
}

/** Headline that rises in word by word, each word sliding up from behind a mask. */
export function Rise({ as: Tag = "h2", text, className, delay = 0 }: { as?: "h1" | "h2" | "p"; text: string; className?: string; delay?: number }) {
  const [ref, seen] = useInView<HTMLHeadingElement>();
  return (
    <Tag ref={ref} className={`rise ${seen ? "in" : ""} ${className ?? ""}`} aria-label={text}>
      {text.split(" ").map((w, i, all) => (
        <span key={i}>
          <span className="rise-mask" aria-hidden><span style={{ transitionDelay: `${delay + i * 45}ms` }}>{w}</span></span>
          {i < all.length - 1 ? " " : ""}
        </span>
      ))}
    </Tag>
  );
}

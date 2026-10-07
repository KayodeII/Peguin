import type { MouseEvent, ReactNode } from "react";
import { siClaude, siGit, siGithub, siGooglemeet, siJira, siLinear, siZoom, type SimpleIcon } from "simple-icons";

/** Client-side navigation; the Worker serves index.html for every page. "/#faq" scrolls to a section. */
export function navigate(to: string) {
  const url = new URL(to, location.href);
  const samePage = url.pathname === location.pathname;
  history.pushState(null, "", url.pathname + url.search + url.hash);
  if (!samePage) dispatchEvent(new PopStateEvent("popstate"));
  requestAnimationFrame(() => scrollToHash(url.hash));
}

export function scrollToHash(hash: string) {
  if (!hash) return scrollTo({ top: 0 });
  document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
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

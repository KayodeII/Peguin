import type { ReactNode } from "react";
import { siClaude, siGit, siGithub, siGooglecalendar, siGooglemeet, siJira, siLinear, siZoom, type SimpleIcon } from "simple-icons";

/** Small inline icons (24px grid, stroke follows currentColor). */
const paths: Record<string, ReactNode> = {
  today: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>,
  live: <><path d="M3 14v-2a9 9 0 0 1 18 0v2" /><rect x="3" y="14" width="4" height="7" rx="1.5" /><rect x="17" y="14" width="4" height="7" rx="1.5" /></>,
  sources: <><path d="M9 7V3M15 7V3" /><path d="M6 7h12v4a6 6 0 0 1-12 0V7z" /><path d="M12 17v4" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></>,
  refresh: <><path d="M21 12a9 9 0 1 1-2.6-6.4L21 8" /><path d="M21 3v5h-5" /></>,
  hash: <path d="M5 9h14M5 15h14M10 3 8 21M16 3l-2 18" />,
  recaps: <><path d="M9 4h6a1 1 0 0 1 1 1v1H8V5a1 1 0 0 1 1-1z" /><path d="M8 5H6a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1h-2" /><path d="m9 13 2 2 4-4" /></>,
  send: <><path d="M22 2 11 13" /><path d="M22 2 15 22l-4-9-9-4 20-7z" /></>,
};

export function Icon({ name, size = 20 }: { name: keyof typeof paths | string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {paths[name]}
    </svg>
  );
}

const BRANDS: Record<string, SimpleIcon> = {
  git: siGit, github: siGithub, claude_code: siClaude, calendar: siGooglecalendar,
  linear: siLinear, jira: siJira, google_meet: siGooglemeet, zoom: siZoom,
};

/** A brand mark on its brand colour, readable in every theme. */
export function BrandIcon({ id, size = 32 }: { id: string; size?: number }) {
  const icon = BRANDS[id];
  if (!icon) return null;
  return (
    <span className="brand-icon" style={{ width: size, height: size, background: `#${icon.hex}` }} title={icon.title} aria-hidden>
      <svg viewBox="0 0 24 24" width={size * 0.58} height={size * 0.58} fill="#fff"><path d={icon.path} /></svg>
    </span>
  );
}

export function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button role="switch" aria-checked={on} aria-label={label} className={`toggle ${on ? "on" : ""}`} onClick={() => onChange(!on)}>
      <span />
    </button>
  );
}

export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <ellipse cx="16" cy="17" rx="10" ry="12" fill="#0b1118" />
      <ellipse cx="16" cy="20" rx="6.5" ry="8" fill="#f4f1ea" />
      <circle cx="12.5" cy="12" r="1.6" fill="#fff" /><circle cx="19.5" cy="12" r="1.6" fill="#fff" />
      <path d="M13.5 15.5h5l-2.5 2.6z" fill="#f2a93b" />
    </svg>
  );
}

export function Avatar({ name, bot }: { name: string; bot?: boolean }) {
  const initials = name.trim().split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase() || "?";
  return <div className={`avatar ${bot ? "bot" : ""}`} aria-hidden>{bot ? <Logo size={30} /> : initials}</div>;
}

export function Typing({ text }: { text: string }) {
  return <div className="typing"><span className="dots"><i /><i /><i /></span>{text}</div>;
}

/** Electron prefixes IPC errors with "Error invoking remote method '...': Error: ". */
export function message(e: unknown): string {
  return String(e instanceof Error ? e.message : e).replace(/^Error invoking remote method '[^']+': (Error: )?/, "");
}

export const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
export const dayTime = (iso: string) => new Date(iso).toLocaleString([], { weekday: "short", hour: "2-digit", minute: "2-digit" });

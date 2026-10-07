import type { MouseEvent, ReactNode } from "react";

/** Client-side navigation for internal links; the Worker serves index.html for every page. */
export function navigate(to: string) {
  history.pushState(null, "", to);
  dispatchEvent(new PopStateEvent("popstate"));
  scrollTo(0, 0);
}

export function Link({ to, className, children }: { to: string; className?: string; children: ReactNode }) {
  const go = (e: MouseEvent) => { if (e.metaKey || e.ctrlKey) return; e.preventDefault(); navigate(to); };
  return <a href={to} className={className} onClick={go}>{children}</a>;
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

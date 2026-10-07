// Semver-ish "1.2.3" helpers shared by the cloud, the website and the desktop app.

export const VERSION_RE = /^\d+\.\d+\.\d+$/;

/** -1, 0 or 1. Missing or malformed parts count as 0. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map((n) => Number.parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => Number.parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d) return d > 0 ? 1 : -1;
  }
  return 0;
}

export const isNewer = (latest: string, installed: string) => compareVersions(latest, installed) > 0;

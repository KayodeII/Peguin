export type Platform = "zoom" | "google_meet" | "teams" | "unknown";

/** Mirrors detectPlatform() in src/core/providers/types.ts. */
export function detectPlatform(url: string): Platform {
  let host = "";
  try { host = new URL(url).hostname.toLowerCase(); } catch { return "unknown"; }
  if (host === "zoom.us" || host.endsWith(".zoom.us") || host.endsWith(".zoomgov.com")) return "zoom";
  if (host === "meet.google.com") return "google_meet";
  if (host.endsWith("teams.microsoft.com") || host.endsWith("teams.live.com")) return "teams";
  return "unknown";
}

/** Open each platform's browser client directly instead of its app launcher. */
export function webClientUrl(url: string, platform: Platform): string {
  if (platform !== "zoom") return url;
  const u = new URL(url);
  const id = u.pathname.match(/\/(?:j|wc\/join|wc)\/(\d+)/)?.[1];
  return id ? `${u.origin}/wc/join/${id}${u.search}` : url; // keeps ?pwd=
}

/**
 * Non-negotiable: the name always says it's an AI, whatever the user typed.
 * Teams only allows letters, numbers, spaces and - ' . _ @ in guest names.
 */
export function botName(displayName: string, platform: Platform): string {
  const base = displayName.replace(/\s*(\(AI\)|-\s*AI)\s*$/i, "").trim() || "Penguin";
  if (platform === "teams") return `${base.replace(/[^\p{L}\p{N} '._@-]/gu, "").trim()} - AI`;
  return `${base} (AI)`;
}

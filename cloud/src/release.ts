// The Mac app's latest release and the install this account last used.
// Releases are configured with APP_LATEST_VERSION and APP_DOWNLOAD_URL; the
// .dmg itself can live anywhere (a GitHub release, R2) and /download/mac points at it.
import type { Env } from "./env.js";
import { json, redirect } from "./http.js";

export type Release = { version: string; available: boolean };
export type Installed = { version: string | null; last_seen: number | null };

export const latestRelease = (env: Env): Release => ({
  version: env.APP_LATEST_VERSION ?? "0.0.0",
  available: !!env.APP_DOWNLOAD_URL,
});

export const releaseRoute = (env: Env) => json(latestRelease(env), 200, { "cache-control": "public, max-age=300" });

export const downloadMac = (env: Env) =>
  env.APP_DOWNLOAD_URL ? redirect(env.APP_DOWNLOAD_URL) : redirect("/account?download=soon");

/** The most recently used desktop sign-in on this account, if any. */
export async function installedApp(env: Env, userId: string): Promise<Installed | null> {
  return env.DB.prepare(
    `SELECT app_version AS version, COALESCE(last_used_at, created_at) AS last_seen FROM app_tokens
     WHERE user_id = ? AND revoked_at IS NULL ORDER BY COALESCE(last_used_at, created_at) DESC LIMIT 1`,
  ).bind(userId).first<Installed>();
}

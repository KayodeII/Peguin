// The Mac app's latest release and the install this account last used.
// Releases are GitHub Releases on RELEASES_REPO (built by .github/workflows/release.yml),
// read through the GitHub API and cached for ten minutes. APP_LATEST_VERSION and
// APP_DOWNLOAD_URL are a fallback for when GitHub can't be reached or there's no repo.
import { VERSION_RE } from "../../src/core/version.js";
import type { Env } from "./env.js";
import { json, redirect } from "./http.js";

export type Release = { version: string; available: boolean; url?: string };
export type Installed = { version: string | null; last_seen: number | null };

/** The stable asset name the release workflow uploads alongside the versioned .dmg. */
export const DMG_ASSET = "Peguin-mac-arm64.dmg";
const CACHE_SECONDS = 600;

type GithubRelease = { tag_name?: string; draft?: boolean; prerelease?: boolean; assets?: { name: string; browser_download_url: string }[] };

/** A published release with the .dmg attached, or null. */
export function fromGithub(r: GithubRelease): Release | null {
  const version = (r.tag_name ?? "").replace(/^v/, "");
  const dmg = r.assets?.find((a) => a.name === DMG_ASSET);
  if (r.draft || r.prerelease || !VERSION_RE.test(version) || !dmg) return null;
  return { version, available: true, url: dmg.browser_download_url };
}

async function githubLatest(repo: string): Promise<Release | null> {
  const key = new Request(`https://release-cache.peguin.co/${repo}`);
  const hit = await caches.default.match(key);
  if (hit) return hit.json<Release | null>();
  const res = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
    headers: { accept: "application/vnd.github+json", "user-agent": "peguin-cloud" },
  });
  if (!res.ok && res.status !== 404) throw new Error(`GitHub releases returned ${res.status}`);
  const release = res.ok ? fromGithub(await res.json<GithubRelease>()) : null;
  await caches.default.put(key, new Response(JSON.stringify(release), { headers: { "cache-control": `max-age=${CACHE_SECONDS}` } }));
  return release;
}

export async function latestRelease(env: Env): Promise<Release> {
  if (env.RELEASES_REPO) {
    try {
      const gh = await githubLatest(env.RELEASES_REPO);
      if (gh) return gh;
    } catch (e) { console.error("release lookup failed", e); }
  }
  return { version: env.APP_LATEST_VERSION ?? "0.0.0", available: !!env.APP_DOWNLOAD_URL, url: env.APP_DOWNLOAD_URL };
}

export async function releaseRoute(env: Env): Promise<Response> {
  const { version, available } = await latestRelease(env);
  return json({ version, available }, 200, { "cache-control": "public, max-age=300" });
}

export async function downloadMac(env: Env): Promise<Response> {
  const { url } = await latestRelease(env);
  return url ? redirect(url) : redirect("/account?download=soon");
}

/** The most recently used desktop sign-in on this account, if any. */
export async function installedApp(env: Env, userId: string): Promise<Installed | null> {
  return env.DB.prepare(
    `SELECT app_version AS version, COALESCE(last_used_at, created_at) AS last_seen FROM app_tokens
     WHERE user_id = ? AND revoked_at IS NULL ORDER BY COALESCE(last_used_at, created_at) DESC LIMIT 1`,
  ).bind(userId).first<Installed>();
}

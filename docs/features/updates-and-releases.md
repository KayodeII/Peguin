# Updates, releases and deploys

A pushed `v*` tag builds the .dmg and a zip on GitHub Releases. The Worker's `/api/release` reads the latest release (cached, with a last-good copy if GitHub fails) and the installed app updates itself in place: download, signature check on the release's sums, SHA-256 check, unpack, version check, "Restart to update". The Worker and website deploy from GitHub after CI passes on `main`.

## Decisions

- 2026-10-07: Desktop install status and update checks
- 2026-10-09: Update in place without a signed app (for now)
- 2026-10-24: Tamper-resistant installed app and signed updates
- `AGENTS.md` "Branches, versions and releases" (deploys from GitHub; removals ship a PR later)

## Files

| Path | Role |
|---|---|
| `desktop/src/main/updater.ts` | Check, download, verify, install and restart |
| `cloud/src/release.ts` | `/api/release`, `/download/mac`, GitHub lookup with last-good fallback |
| `scripts/release.mjs` | `npm run release -- patch|minor|major` (bump, commit, tag) |
| `.github/workflows/release.yml` | Builds and publishes the release assets, `SHA256SUMS.txt` and its signature |
| `desktop/scripts/sign-sums.mjs` | Signs `SHA256SUMS.txt` with the release key |
| `.github/workflows/deploy.yml` | D1 migrations, then `wrangler deploy` (builds `web/dist`) |
| `.github/workflows/ci.yml` | Typecheck and tests on every PR |
| `cloud/wrangler.jsonc` | Worker config, website build command |
| `docs/RELEASING.md` | How to release |
| `desktop/src/main/settings.ts` | `autoUpdate` |

## Tests

`test/desktop.test.ts` ("updating in place"), `test/cloud.test.ts` ("versions", "releases", "release assets for updating in place", "release lookup when GitHub fails").

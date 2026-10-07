# Releasing the Mac app

1. Merge what's going out into `main`, then from an up-to-date `main`:
   ```bash
   npm run release -- patch        # or minor, major, or an exact version like 0.3.0
   git push origin main --follow-tags
   ```
   The script refuses to run off `main`, with uncommitted changes, or when `main` differs from `origin/main`. It bumps `desktop/package.json` (and its lockfile), commits `Release vX.Y.Z` and tags `vX.Y.Z`.
2. Pick the bump by what changed since the last release: patch for fixes, minor for new features, major for breaking changes.
3. `.github/workflows/release.yml` builds the .dmg on an Apple silicon runner (bundling a static whisper.cpp at the pinned commit) and publishes a GitHub Release with:
   - `Peguin-0.2.0-mac-arm64.dmg`
   - `Peguin-mac-arm64.dmg` (same file, stable name)
   - `SHA256SUMS.txt`

Nothing else changes. The Worker reads the latest release from `RELEASES_REPO` (cached ten minutes), so within that time:
- `/download/mac` serves the new .dmg,
- the account page shows "Update available" to anyone on an older version,
- the app's sidebar shows the update (it checks every six hours).

The tag must match `desktop/package.json`, or the workflow stops. Drafts and prereleases are ignored.

## Until the app is signed

Builds are ad-hoc signed, not notarised, so macOS blocks the first launch of a downloaded copy. Users open it once from System Settings → Privacy & Security → Open Anyway. The account page says so. Notarisation needs an Apple Developer ID ($99/year); with it, set `identity` in `desktop/package.json`, add the signing secrets to the workflow, and auto-update with electron-updater becomes possible.

# Releasing the Mac app

1. Bump the version in `desktop/package.json` (for example `cd desktop && npm version 0.2.0 --no-git-tag-version`) and commit it to `main`.
2. Tag that commit and push the tag:
   ```bash
   git tag v0.2.0 && git push origin v0.2.0
   ```
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

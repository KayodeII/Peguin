# Peguin desktop app

Electron + React, styled after Discord's layout. Runs in the menu bar. Nothing to type: Peguin reads your work since the last standup (local git commits, GitHub PRs through the `gh` CLI, and your Claude Code prompts), has your AI write a 30–45 second update plus a list of facts, then joins your standup as a guest in a hidden window (muted, camera off). It gives the update when you're handed the floor, answers questions from the facts only (otherwise defers to you), and says "Yes, I'm here" when called.

Set your standup link and time once and turn on auto-join: Peguin prepares 15 minutes before and joins just before it starts (`src/main/scheduler.ts`).

Drafts, answers, copilot suggestions and recap summaries always run on the user's own AI (Settings > AI, `src/main/brain.ts`): the Claude Code CLI (`claude -p`), the Codex CLI (`codex exec`) or their xAI key (`src/main/xai.ts`). Peguin's server never sees work or meeting text.

**Join as me** (`src/main/copilot/session.ts`) opens the owner's own meeting with a private notes panel that suggests answers to questions; see `docs/features/copilot.md`.

Account: Settings → Sign in opens the browser at `<cloud>/app/connect` (PKCE). The website hands back `peguin://auth?code=…`; the app swaps it for an app token, stored encrypted with the OS keychain (`safeStorage`), and keeps a signed licence (`license.txt`) that it checks offline with the public key in `src/main/account.ts`. Cloud URL: `PENGUIN_CLOUD_URL` (default `http://localhost:8787`, i.e. `cd cloud && npm run dev`).

```bash
cd desktop
npm install
npm run setup:whisper   # once: builds whisper.cpp + model into ./vendor (nothing system-wide)
npm run dev             # React window with hot reload
npm start               # production build, then run
npm run typecheck
```

Layout:
- `src/main/`: app lifecycle and menu bar (`index.ts`), settings (`settings.ts`), work sources (`context/`: git, github, claudeCode), drafting and answers (`brain.ts`), auto-join (`scheduler.ts`), the meeting runner and platform rules (`meeting/`), whisper.cpp and TTS (`speech/`)
- `src/main/copilot/`: the private copilot; `src/main/calendar/`: calendar sources; `src/main/updater.ts`: self-update
- `src/preload/`: `app.ts` (API for the React window), `meeting.ts` and `copilot.ts` (bridges for meeting pages)
- `src/renderer/`: the preferences window (React)
- `resources/meeting-inject.js`: runs inside the meeting page: Peguin's mic and camera, audio tap, per-platform join drivers
- `resources/copilot-inject.js`: in the owner's own meeting, taps only other participants' audio

## Installer

```bash
npm run dist:mac   # builds the app, a static whisper-server (scripts/build-whisper-release.sh) and release/Peguin-<version>-mac-arm64.dmg
npm run icons      # regenerate build/icon.icns and the menu bar template icon
```

The DMG is ad-hoc signed (runs, but macOS asks the user to confirm on first open) until there's an Apple Developer ID for signing and notarization. The speech model (whisper large-v3-turbo, ~550 MB) downloads on first run into the app-data folder, with progress in the sidebar. Apps opened from Finder get the login shell's PATH (`fixPath`), so git, gh and claude are found.

The app updates itself from GitHub Releases (`src/main/updater.ts`, see `docs/features/updates-and-releases.md`). Not yet: Developer ID signing and notarization, Windows. Dev aids: `PENGUIN_SNAPSHOT=file.png` saves a picture of the window and quits; `PENGUIN_USER_DATA=dir` uses a separate profile. Logic tests live in the root `test/desktop.test.ts`.

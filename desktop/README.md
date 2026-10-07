# Penguin desktop app

Electron + React, styled after Discord's layout. Runs in the menu bar. Nothing to type: Penguin reads your work since the last standup (local git commits, GitHub PRs through the `gh` CLI, and your Claude Code prompts), has Claude write a 30–45 second update plus a list of facts, then joins your standup as a guest in a hidden window (muted, camera off). It gives the update when you're handed the floor, answers questions from the facts only (otherwise defers to you), and says "Yes, I'm here" when called.

Set your standup link and time once and turn on auto-join: Penguin prepares 15 minutes before and joins just before it starts (`src/main/scheduler.ts`).

Drafting and answers currently run through the Claude Code CLI (`claude -p`) with your own Claude login; the Penguin account's server-side Claude replaces this.

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
- `src/preload/`: `app.ts` (API for the React window), `meeting.ts` (bridge for meeting pages)
- `src/renderer/`: the preferences window (React)
- `resources/meeting-inject.js`: runs inside the meeting page: Penguin's mic and camera, audio tap, per-platform join drivers

Not yet: Penguin account sign-in and connections (needs the Cloudflare Worker), packaging and signing, Piper TTS (macOS `say` for now), Windows tray icon. Dev aids: `PENGUIN_SNAPSHOT=file.png` saves a picture of the window and quits; `PENGUIN_USER_DATA=dir` uses a separate profile. Logic tests live in the root `test/desktop.test.ts`.

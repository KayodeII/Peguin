# Penguin desktop app

Electron + React. Runs in the menu bar, keeps your preferences, and sends Penguin into a meeting as a guest in a hidden window. Penguin listens with local whisper.cpp, decides with the shared `src/realtime/turn.ts`, and speaks: your update when you're handed the floor, a deferral for questions, "Yes, I'm here" when called.

```bash
cd desktop
npm install
npm run setup:whisper   # once: builds whisper.cpp + model into ./vendor (nothing system-wide)
npm run dev             # React window with hot reload
npm start               # production build, then run
npm run typecheck
```

Layout:
- `src/main/`: app lifecycle and menu bar (`index.ts`), settings (`settings.ts`), the meeting runner and platform rules (`meeting/`), whisper.cpp and TTS (`speech/`)
- `src/preload/`: `app.ts` (API for the React window), `meeting.ts` (bridge for meeting pages)
- `src/renderer/`: the preferences window (React)
- `resources/meeting-inject.js`: runs inside the meeting page: Penguin's mic and camera, audio tap, per-platform join drivers

Not yet: Penguin account sign-in and connections (needs the Cloudflare Worker), packaging and signing, Piper TTS (macOS `say` for now), Windows tray icon. `PENGUIN_SNAPSHOT=file.png` saves a picture of the window and quits (dev aid).

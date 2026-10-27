# Desktop app shell

The Electron app around the features: the main window (Discord's layout, Notion's colour and type), Settings, themes and accents, the menu bar icon, the `peguin://` links, the first run, Mini Peguin, and settings storage.

The first run is one step at a time, like Tailscale's setup: what Peguin does (including that it always says it's an AI), your name and nicknames, where the update comes from, which of your AIs to use (Claude Code and Codex are detected on the Mac), your standup, what macOS will ask for and when (nothing is asked during setup) with the speech model download, signing in for the trial, and where Peguin lives afterwards. Nothing is saved until the last step. Built with Vite (renderer) and esbuild (main and preloads).


**Mini Peguin** (Settings > General, off by default; the shrink button next to Settings in the main window, or the tray) is the app made small, like Tailscale's mini player: the next standup, the meeting Peguin is in, what voice control hears, and Prepare, Send Peguin, Hand over, Leave, voice control on/off and Open Peguin. On a Mac with a camera notch it can be a Dynamic Island: a black pill around the camera (status dot on one side, the standup time or a waveform on the other) that opens under the pointer and while voice control is busy. Otherwise it's a small floating window that stays above other apps and remembers where it was put. Either way the window is exactly as tall as what it shows, so nothing see-through catches clicks. While it's on, it replaces voice control's own status pill.

## Decisions

- 2026-10-06: Desktop-first; each user's machine runs the bot
- 2026-10-07: Product shape: desktop app first (build tooling)
- 2026-10-07: Notion-style themes; domain www.peguin.co
- 2026-10-06: Name (user-facing "Peguin", internal "penguin")
- 2026-10-27: A first run that explains each step
- 2026-10-27: Mini Peguin: the Dynamic Island or a small window

## Files

| Path | Role |
|---|---|
| `desktop/src/main/index.ts` | App start, windows, tray, `peguin://` handling, every IPC handler |
| `desktop/src/main/settings.ts` | Settings schema (zod) and defaults |
| `desktop/src/main/paths.ts` | Installed vs source paths |
| `desktop/src/preload/app.ts` | `window.penguin` bridge for the renderer |
| `desktop/src/renderer/App.tsx`, `main.tsx`, `index.html` | Window shell and routing |
| `desktop/src/renderer/views.tsx` | Home, live view, Settings sections |
| `desktop/src/main/mini.ts`, `desktop/src/renderer/mini.tsx` | Mini Peguin: the window (placement in `miniBounds`, pure) and its page |
| `desktop/src/renderer/onboarding.tsx` | The first run (`ai:detect` in `index.ts` finds Claude Code and Codex) |
| `desktop/src/renderer/ui.tsx`, `styles.css`, `global.d.ts` | Components, icons, themes, types |
| `desktop/scripts/dev.mjs` | `npm run dev` |
| `desktop/scripts/icons.cjs`, `icns.sh`, `tray.mjs` | App and menu bar icons |
| `desktop/vite.config.ts`, `desktop/package.json` | Build and packaging (version lives here) |
| `desktop/README.md` | Running from source |

## Tests

`test/desktop.test.ts`, `test/mini.test.ts` (Mini Peguin placement).

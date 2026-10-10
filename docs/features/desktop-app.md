# Desktop app shell

The Electron app around the features: the main window (Discord's layout, Notion's colour and type), Settings, themes and accents, the menu bar icon, the `peguin://` links, and settings storage. Built with Vite (renderer) and esbuild (main and preloads).

## Decisions

- 2026-10-06: Desktop-first; each user's machine runs the bot
- 2026-10-07: Product shape: desktop app first (build tooling)
- 2026-10-07: Notion-style themes; domain www.peguin.co
- 2026-10-06: Name (user-facing "Peguin", internal "penguin")

## Files

| Path | Role |
|---|---|
| `desktop/src/main/index.ts` | App start, windows, tray, `peguin://` handling, every IPC handler |
| `desktop/src/main/settings.ts` | Settings schema (zod) and defaults |
| `desktop/src/main/paths.ts` | Installed vs source paths |
| `desktop/src/preload/app.ts` | `window.penguin` bridge for the renderer |
| `desktop/src/renderer/App.tsx`, `main.tsx`, `index.html` | Window shell and routing |
| `desktop/src/renderer/views.tsx` | Home, live view, Settings sections |
| `desktop/src/renderer/ui.tsx`, `styles.css`, `global.d.ts` | Components, icons, themes, types |
| `desktop/scripts/dev.mjs` | `npm run dev` |
| `desktop/scripts/icons.cjs`, `icns.sh`, `tray.mjs` | App and menu bar icons |
| `desktop/vite.config.ts`, `desktop/package.json` | Build and packaging (version lives here) |
| `desktop/README.md` | Running from source |

## Tests

`test/desktop.test.ts`.

# Join as me: the private copilot

The owner joins their own meeting as themselves in a Peguin window. Peguin listens only to the other participants, transcribes on the Mac, and when someone asks a question it suggests an answer in a panel that isn't sent to the call. Pro and Team plans.

- Suggestions are labelled **From your notes**, **Not in your notes** or **General knowledge**. Work questions stay to the prepared facts; experience is never invented.
- **Work / Interview** switch and **Check online** (a second, web-searched pass for general questions), both saved straight away.
- Questions queue (up to three waiting); older overflow is marked skipped, never left on "Thinking…".
- **Hide** collapses the panel to a strip. **Pop out** moves it into its own always-on-top window; **Dock** puts it back. Sharing the meeting window alone leaves the popped-out notes out of that share.
- **AI notice**: on Pop out, and on joining in Interview mode, Peguin posts in the meeting chat that the owner is using an AI assistant. Only once it shows up in the chat are the popped-out notes left out of full-screen shares too (`setContentProtection`). If it can't be posted, the notes stay visible in shares and the panel says why.
- Screen sharing from the meeting uses macOS's own picker (macOS 15+).

## Decisions

- 2026-10-09: The private copilot
- 2026-10-10: The copilot answers general questions, interviews included
- 2026-10-10: Copilot: Work/Interview switch, Check online, Hide, Pop out
- 2026-10-10: Copilot: the call is told in chat, then popped-out notes leave screen shares
- 2026-10-10: Speech recognition (1.2 s end-of-utterance silence for the copilot)

## Files

| Path | Role |
|---|---|
| `desktop/src/main/copilot/session.ts` | The session: window, meeting view, panel layout, pop-out window, share picker, question queue, Check online |
| `desktop/resources/copilot-inject.js` | Runs in the meeting page: taps other people's audio only, never the owner's mic or camera; posts the AI notice in the chat |
| `desktop/src/preload/copilot.ts` | Bridge for the meeting page (injects the script, sends audio, relays the AI notice) |
| `desktop/src/renderer/copilot.tsx` | The panel: header buttons, Work/Interview, Check online, cards, transcript |
| `desktop/src/renderer/main.tsx` | Routes `#copilot` and `#copilot-out` to the panel |
| `desktop/src/renderer/styles.css` | `.copilot`, `.cp-*` styles |
| `src/core/brain/prompts.ts` | `isQuestion` (copilot's), `COPILOT_LABELS`, `copilotSystem`, `copilotWebSystem`, `plainSpoken` |
| `desktop/src/main/brain.ts` | `suggestAnswer`, `checkOnline` |
| `desktop/src/main/settings.ts` | `copilot.mode`, `copilot.web` |
| `desktop/src/main/index.ts` | `startCopilot`, IPC `copilot:start|state|collapse|pop-out|stop` |
| `desktop/src/preload/app.ts` | `copilotStart`, `copilotState`, `copilotCollapse`, `copilotPopOut`, `copilotStop` |
| `desktop/src/main/plan.ts` | The plan gate |

## Tests

`test/copilot.test.ts` (queue: every card answered, failed or skipped), `test/cloud.test.ts` ("private copilot", "copilot modes and checking online": question detection, labels, modes, web prompt, markdown stripping).

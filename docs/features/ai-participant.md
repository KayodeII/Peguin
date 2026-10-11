# Join as Peguin: the AI participant

A hidden Chromium window joins the meeting's web client as a guest named "<owner> (AI)" (" - AI" on Teams). Peguin's voice and avatar replace the mic and camera, it listens to the other participants, waits until someone hands the floor to the owner by name, discloses that it's an AI, speaks the prepared update and answers short follow-ups from the prepared facts only. **Hand over to me** opens the meeting in the owner's browser while Peguin says so and leaves.

## Decisions

- 2026-10-06: Desktop-first; each user's machine runs the bot
- 2026-10-06: Always disclose (non-negotiable 1 in `AGENTS.md`)
- 2026-10-06: Prepare and pre-synthesize the update
- 2026-10-07: Bot name suffix is " - AI" on Teams
- 2026-10-07: Official SDKs for Teams and Zoom; strict join pacing
- 2026-10-07: Product shape (turn-taking stays rule-based)
- 2026-10-08: Speak in sentences, stop when talked over
- 2026-10-09: Hand over by leaving, not by taking over Peguin's seat
- Meet refused Electron's user agent; meeting windows present as plain Chrome (`chromeUserAgent`, PR #16)

## Files

| Path | Role |
|---|---|
| `desktop/src/main/meeting/runner.ts` | One meeting: the hidden window, listening, turn-taking, speaking, hand-over |
| `desktop/resources/meeting-inject.js` | Runs in the meeting page: replaces mic and camera, taps remote audio, clicks through the join flow |
| `desktop/src/preload/meeting.ts` | Bridge between the meeting page and the main process |
| `desktop/src/main/meeting/platform.ts` | Detects Meet/Zoom/Teams, web-client URLs, bot name, `chromeUserAgent` |
| `src/realtime/turn.ts` | `TurnDetector`, `mentionsName`, `isHandoff`, `isQuestion` (pure, shared with the server stack) |
| `src/core/brain/prompts.ts` | Disclosure, update and follow-up prompts (facts only) |
| `desktop/src/main/brain.ts` | Drafts and live answers through the owner's AI |
| `desktop/src/main/speech/tts.ts` | Synthesises the prepared lines and live answers |
| `desktop/src/main/meeting/record.ts` | Structured log of the meeting, for the recap |
| `desktop/src/main/index.ts` | Starting/stopping a meeting, hand-over, IPC |
| `desktop/src/renderer/views.tsx` | Live view and the Hand over button |

## Tests

`test/turn.test.ts` (turn-taking, false positives), `test/desktop.test.ts` (bot name and links, plain Chrome user agent), `test/voice.test.ts` (talking over Peguin, disclosure).

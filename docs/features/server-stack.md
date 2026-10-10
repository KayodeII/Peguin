# Server stack (optional adapters)

The original design: a meeting-bot vendor (Recall.ai or Attendee) puts a browser in the call that loads `public/agent.html`; the realtime node runs Deepgram speech in and out over a WebSocket; a BullMQ worker prepares, joins and recaps on schedule; Postgres and Redis hold state. Kept as optional adapters while the desktop app is the default.

## Decisions

- 2026-10-06: Use a meeting-bot provider instead of native platform APIs
- 2026-10-06: Do speech-to-text ourselves from page audio
- 2026-10-06: Deepgram for both STT and TTS
- 2026-10-06: Three services, Postgres + Redis + BullMQ
- 2026-10-06: Desktop-first (why this became optional)

## Files

| Path | Role |
|---|---|
| `src/api/app.ts`, `main.ts` | HTTP API and webhooks |
| `src/realtime/main.ts`, `session.ts` | WebSocket server, one live meeting |
| `src/realtime/turn.ts` | Turn-taking (shared with the desktop app) |
| `src/worker/main.ts` | `schedule.fire`, `meeting.prep`, `meeting.join`, `meeting.recap` |
| `src/core/providers/` | `MeetingBotProvider`, Recall, Attendee |
| `src/core/speech/deepgram.ts` | Streaming STT and TTS |
| `src/core/brain/claude.ts`, `slack.ts` | Prompts via the Anthropic SDK, Slack recap |
| `src/core/` (`config`, `db`, `repo`, `queue`, `redis`, `crypto`, `log`, `migrate`, `meetings`) | Infrastructure |
| `migrations/001_init.sql`, `docker-compose.yml` | Schema, local Postgres and Redis |
| `public/agent.html` | The bot's camera, mic and speaker in the vendor's browser |
| `docs/ARCHITECTURE.md` | How it scales |

## Tests

`test/core.test.ts`, `test/session.test.ts`, `test/turn.test.ts`.

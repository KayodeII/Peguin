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

## Running it

Moved here from the root README when the desktop app became the product.

### How it works

```mermaid
flowchart LR
  subgraph Call["Zoom / Meet / Teams call"]
    Bot["Meeting bot<br/>(Recall.ai or Attendee)"]
  end
  Bot -- "loads agent page:<br/>call audio = page mic,<br/>page audio = bot voice" --> RT
  subgraph Peguin
    API["api<br/>REST + webhooks"]
    RT["realtime<br/>1 WebSocket per meeting"]
    W["worker<br/>prep · join · recap"]
  end
  RT <-- "PCM in / MP3 out" --> DG["Deepgram<br/>STT + TTS"]
  RT --> C["Claude"]
  W --> C
  W --> Src["GitHub · Linear · Jira"]
  W --> Slack
  W -- "create bot" --> Bot
  Bot -- "status webhooks" --> API
  API & RT & W --- PG[(Postgres)]
  API & RT & W --- R[(Redis<br/>queues + pub/sub)]
```

**One meeting, start to finish**

1. **Schedule fires** (BullMQ job scheduler, cron + timezone), or you call `POST /v1/users/:id/meetings`.
2. **Prep** (worker): pull activity since the previous workday (Friday onward on Mondays), have Claude draft a 30–45 second spoken update plus grounded facts, and store both on the meeting.
3. **Join** (worker): ask the provider for a bot. The bot opens `REALTIME_PUBLIC_URL/agent?m=…&t=…` in a headless browser. That page is the bot's camera, its speaker and its ears.
4. **Live** (realtime): the page streams call audio to Peguin. Peguin runs it through streaming speech-to-text and the turn detector. When you're handed the floor it plays the update, which was synthesized when the session started so there's no delay. Follow-up questions go to Claude, limited to the prepared facts.
5. **Recap** (worker): on the provider's "call ended" webhook, summarise the transcript and post questions and action items for you to Slack.

### Why it scales

| Concern | Design |
|---|---|
| Running a browser inside every call | Done by the provider (Recall.ai or your Attendee cluster), not Peguin |
| Live meetings | Each meeting lives entirely on the realtime node holding its WebSocket. No sticky sessions or shared memory. Add nodes to add capacity (`REALTIME_MAX_SESSIONS` per node; full nodes refuse with 503 so the bot reconnects elsewhere) |
| Cross-node control | `POST /v1/meetings/:id/speak` publishes on Redis; whichever node holds the meeting acts on it |
| Background work | One BullMQ queue, deterministic job ids (`prep-…`, `join-…`, `recap-…`) so retries and duplicate webhooks are harmless |
| Deploys | Realtime nodes drain: stop taking new meetings, let live ones finish (up to 20 min) |
| Out-of-order webhooks | A finished meeting never moves back to an earlier status |
| Secrets | Integration tokens and Slack webhooks encrypted at rest (AES-256-GCM) |
| Latency when called on | The update is drafted and synthesized before anyone asks; only follow-ups make a live Claude + TTS round trip |

### Run it locally

You need Docker, Node 20+, and accounts for Recall.ai (or Attendee), Anthropic and Deepgram.

```bash
cp .env.example .env            # fill in keys; generate secrets with: openssl rand -base64 32
npm install
docker compose up -d postgres redis
npm run migrate
npm run dev:api & npm run dev:realtime & npm run dev:worker
```

The bot provider has to reach your machine, so expose both services:

```bash
ngrok http 8080   # -> API_PUBLIC_URL
ngrok http 8081   # -> REALTIME_PUBLIC_URL
```

For Recall.ai, point the dashboard's status webhook at `API_PUBLIC_URL/webhooks/recall?token=WEBHOOK_SECRET`. Attendee webhooks are set per bot automatically.

Or run everything in containers: `docker compose up --build`.

### Set yourself up

```bash
API=http://localhost:8080; KEY="x-api-key: $ADMIN_API_KEY"

# 1. You. Aliases help it recognise your name when speech-to-text mishears it.
curl -XPOST $API/v1/users -H "$KEY" -H 'content-type: application/json' -d '{
  "name": "Mujeeb Adebowale", "email": "you@company.com", "aliases": ["MJ", "Mujib"],
  "timezone": "Africa/Lagos", "slackWebhookUrl": "https://hooks.slack.com/services/…",
  "standingNotes": "Out on Friday."
}'

# 2. Where your work lives (any subset)
curl -XPUT $API/v1/users/$USER_ID/integrations/github -H "$KEY" -H 'content-type: application/json' \
  -d '{"token":"github_pat_…","config":{"username":"your-handle","orgs":["your-org"]}}'
curl -XPUT $API/v1/users/$USER_ID/integrations/linear -H "$KEY" -H 'content-type: application/json' \
  -d '{"token":"lin_api_…"}'
curl -XPUT $API/v1/users/$USER_ID/integrations/jira -H "$KEY" -H 'content-type: application/json' \
  -d '{"token":"atlassian-api-token","config":{"baseUrl":"https://acme.atlassian.net","email":"you@company.com"}}'

# 3. Your standup: start 2 minutes early, weekdays
curl -XPOST $API/v1/users/$USER_ID/schedules -H "$KEY" -H 'content-type: application/json' \
  -d '{"meetingUrl":"https://meet.google.com/abc-defg-hij","cron":"58 8 * * 1-5","timezone":"Africa/Lagos"}'

# Or send it right now
curl -XPOST $API/v1/users/$USER_ID/meetings -H "$KEY" -H 'content-type: application/json' \
  -d '{"meetingUrl":"https://us02web.zoom.us/j/123456789"}'
```

### API

| Method | Path | What it does |
|---|---|---|
| POST | `/v1/users` | Create a user |
| GET / PATCH | `/v1/users/:id` | Read or update name, aliases, timezone, Slack, standing notes |
| PUT / DELETE | `/v1/users/:id/integrations/:kind` | Connect or disconnect `github`, `linear`, `jira` |
| POST / GET | `/v1/users/:id/schedules` | Recurring standups (cron + IANA timezone) |
| DELETE | `/v1/schedules/:id` | Remove a schedule |
| POST | `/v1/users/:id/meetings` | Prep and join a meeting now |
| GET | `/v1/meetings/:id` | Status, draft, recap and transcript |
| POST | `/v1/meetings/:id/speak` | Give the update immediately |
| POST | `/v1/meetings/:id/leave` | Pull the bot out |
| POST | `/webhooks/:provider?token=…` | Provider status webhooks |

All `/v1` routes need the `x-api-key` header.

### Project layout

```
src/
  api/        REST + provider webhooks
  realtime/   agent-page WebSocket, live session, turn detector
  worker/     prep, join, recap, schedules
  core/       config, Postgres, Redis, queue, crypto, providers, sources, Claude, Deepgram
public/agent.html   the page the bot loads in the call
migrations/         SQL, applied in order by `npm run migrate`
test/               turn detection, session loop, providers, crypto, dates
```

### Platform notes

- **Google Meet**: Google's own Meet Media API is receive-only and closed to new sign-ups, so Meet support comes through the bot provider.
- **Zoom**: Zoom's RTMS is receive-only too, so the bot joins as a participant. Some Zoom accounts require bots to be admitted from the waiting room.
- **Teams**: works through the provider, no Azure media bot of your own needed. External bots may need to be let in from the lobby.
- **Consent**: check your company's recording and AI-participant policies. Peguin announces itself before speaking, and the bot's name says it's an AI.

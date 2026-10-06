# Penguin

Penguin joins your standup on Zoom, Google Meet or Microsoft Teams, waits until someone calls your name, and gives your update out loud. It drafts the update beforehand from your GitHub, Linear and Jira activity. It answers simple follow-up questions using only those facts, defers anything else to you, and posts a recap to Slack afterwards.

Penguin always introduces itself as your AI assistant before speaking.

Working on this with a coding agent? Start with [AGENTS.md](AGENTS.md); background is in [docs/](docs/).

## How it works

```mermaid
flowchart LR
  subgraph Call["Zoom / Meet / Teams call"]
    Bot["Meeting bot<br/>(Recall.ai or Attendee)"]
  end
  Bot -- "loads agent page:<br/>call audio = page mic,<br/>page audio = bot voice" --> RT
  subgraph Penguin
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
4. **Live** (realtime): the page streams call audio to Penguin. Penguin runs it through streaming speech-to-text and the turn detector. When you're handed the floor it plays the update, which was synthesized when the session started so there's no delay. Follow-up questions go to Claude, limited to the prepared facts.
5. **Recap** (worker): on the provider's "call ended" webhook, summarise the transcript and post questions and action items for you to Slack.

## Why it scales

| Concern | Design |
|---|---|
| Running a browser inside every call | Done by the provider (Recall.ai or your Attendee cluster), not Penguin |
| Live meetings | Each meeting lives entirely on the realtime node holding its WebSocket. No sticky sessions or shared memory. Add nodes to add capacity (`REALTIME_MAX_SESSIONS` per node; full nodes refuse with 503 so the bot reconnects elsewhere) |
| Cross-node control | `POST /v1/meetings/:id/speak` publishes on Redis; whichever node holds the meeting acts on it |
| Background work | One BullMQ queue, deterministic job ids (`prep-…`, `join-…`, `recap-…`) so retries and duplicate webhooks are harmless |
| Deploys | Realtime nodes drain: stop taking new meetings, let live ones finish (up to 20 min) |
| Out-of-order webhooks | A finished meeting never moves back to an earlier status |
| Secrets | Integration tokens and Slack webhooks encrypted at rest (AES-256-GCM) |
| Latency when called on | The update is drafted and synthesized before anyone asks; only follow-ups make a live Claude + TTS round trip |

## Run it locally

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

## Set yourself up

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

## API

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

## Project layout

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

## Platform notes

- **Google Meet**: Google's own Meet Media API is receive-only and closed to new sign-ups, so Meet support comes through the bot provider.
- **Zoom**: Zoom's RTMS is receive-only too, so the bot joins as a participant. Some Zoom accounts require bots to be admitted from the waiting room.
- **Teams**: works through the provider, no Azure media bot of your own needed. External bots may need to be let in from the lobby.
- **Consent**: check your company's recording and AI-participant policies. Penguin announces itself before speaking, and the bot's name says it's an AI.

## Next steps

- A small web dashboard (login, connect tools with OAuth instead of tokens, live captions from the Redis channel)
- Per-team accounts and API keys in place of the single admin key
- Barge-in: stop talking if someone speaks over Penguin
- Voice cloning, opt-in only, if you want it to sound like you

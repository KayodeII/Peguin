# Architecture

## Services

One codebase and one Docker image, run as three processes. Each scales on its own.

| Service | Entry | Job | Scales by |
|---|---|---|---|
| api | `src/api/main.ts` | REST for users, integrations, schedules and meetings; provider webhooks | Stateless; any number behind a load balancer |
| realtime | `src/realtime/main.ts` | Serves `/agent` (bot page) and `/ws` (one WebSocket per live meeting); runs the listen → decide → speak loop | Add nodes; each takes up to `REALTIME_MAX_SESSIONS` |
| worker | `src/worker/main.ts` | BullMQ jobs: `schedule.fire`, `meeting.prep`, `meeting.join`, `meeting.recap` | Add workers or raise `WORKER_CONCURRENCY` |

Shared infrastructure: **Postgres** (users, encrypted integrations, schedules, meetings, utterances) and **Redis** (BullMQ queue, job schedulers, pub/sub).

## Meeting lifecycle

```
schedule cron fires (BullMQ job scheduler, tz-aware)      or   POST /v1/users/:id/meetings
        │
        ▼
schedule.fire ─► meetings row (status=scheduled)
        │
        ▼
meeting.prep (status=preparing)
  gatherActivity(github, linear, jira) since previousWorkdayStart()
  draftStandup() via Claude → draft { script, facts }
  on final failure: continue anyway; session falls back to standing notes
        │
        ▼
meeting.join → provider.createBot(meetingUrl, agentPageUrl, webhookUrl)   (status=joining)
        │
        ▼
provider bot opens  REALTIME_PUBLIC_URL/agent?m=<meetingId>&t=<HMAC token>
  page mic   = meeting audio  ──PCM16 16 kHz──►  /ws  (realtime node)
  page audio = bot's voice    ◄──────MP3───────
        │
        ▼
MeetingSession (realtime node)
  on start: pre-synthesize disclosure + script (TTS)
  Deepgram streaming STT (diarized, name boosted with keyterms)
  final utterance → TurnDetector
     give_update → play cached MP3 → markUpdateGiven
     answer      → answerFollowUp (facts only) → TTS → play
  transcript flushed to Postgres every 5 s; live events on Redis penguin:meeting:<id>
        │
        ▼
provider webhook "ended" → status=ended → meeting.recap (15 s delay, jobId recap-<id>)
  summarizeMeeting() → meetings.recap → Slack webhook
```

## Cross-node communication

- **Commands** (`POST /v1/meetings/:id/speak`): the api publishes to `penguin:cmd:<meetingId>`. Only the realtime node holding that meeting is subscribed, so it acts and the others ignore it. A publish count of 0 means no node has the meeting, and the API returns 409.
- **Events**: sessions publish `utterance`, `update_given`, `session_started` and `session_ended` on `penguin:meeting:<meetingId>`, for a future dashboard or live captions.

## Failure handling

| Failure | Behaviour |
|---|---|
| One activity source down | Others still used; draft is told which failed |
| Claude down at prep | 3 attempts, then join with fallback update |
| Bot creation fails | Meeting marked `failed` with error |
| Realtime node dies mid-call | Page reconnects with backoff; LB routes to another node; `update_given_at` stops a repeat |
| Deploy | Realtime node drains: healthz 503, refuses new sockets, waits up to 20 min for live meetings |
| Duplicate or late webhooks | Status never leaves `ended`/`failed`; recap deduped by job id |
| Page never reports playback end | Timer based on word count releases the speaking lock |

## Security

- `/v1/*` needs the `x-api-key` header (single admin key for now; per-team keys are planned).
- Webhooks are authenticated with a `?token=WEBHOOK_SECRET` query param (provider-agnostic).
- The agent page and WebSocket are authenticated with an HMAC token bound to one meeting id (`SESSION_SECRET`).
- Third-party tokens and Slack webhooks are AES-256-GCM encrypted with `ENCRYPTION_KEY`.

## Data model

See `migrations/001_init.sql`. Tables: `users`, `integrations` (PK user_id+kind), `schedules`, `meetings` (status enum, `draft` jsonb, `bot_id` unique), `utterances`.

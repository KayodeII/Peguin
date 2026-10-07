# Architecture

> **Direction change (2026-10-06):** Peguin is moving to a desktop app that runs the bot on the user's own machine, with a small Cloudflare Worker for accounts and licenses. See `docs/DECISIONS.md`. The target layout is below. The rest of this file describes the current server implementation, which stays as an optional adapter set while the migration happens.

## Target: desktop app plus license server

```
User's machine (Electron)                          Cloudflare (owner's domain)
┌───────────────────────────────────────┐          ┌───────────────────────────┐
│ Scheduler + calendar conflict check   │          │ Worker: auth, Stripe hook │
│ Prep: GitHub/Linear/Jira → facts      │─HTTPS───►│   license tokens (Ed25519)│
│ Hidden Chromium window in the meeting │          │   Claude draft/follow-up  │
│   getUserMedia → Peguin voice+avatar │          │ D1 (accounts, subs)       │
│   WebRTC remote tracks → STT          │          │ R2 (installers), Pages    │
│ whisper.cpp STT · Piper TTS           │          └───────────────────────────┘
│ TurnDetector (domain, pure)           │
│ SQLite                                │
└───────────────────────────────────────┘
```

The code is organized as ports and adapters: `domain/` (meeting state machine, turn detection, draft rules), `application/` (use cases), `ports/` (interfaces) and `adapters/`. The same use cases run on the desktop adapters (local Chromium, whisper.cpp, Piper, SQLite) or the server adapters (Recall/Attendee, Deepgram, Postgres, BullMQ).

# Current server implementation

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

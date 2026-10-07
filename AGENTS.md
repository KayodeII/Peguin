# AGENTS.md: Penguin

This is the single source of truth for any coding agent (Claude Code, Codex, Cursor, Copilot, Grok, others) working in this repo. Tool-specific files (`CLAUDE.md`, `.cursor/rules/`, `.github/copilot-instructions.md`) only point here. Update this file, not those.

Read next, in this order, when the task needs it:
- `docs/ARCHITECTURE.md`: how the services fit together and why it scales
- `docs/DECISIONS.md`: why things are the way they are (platform research, vendor choices). Check here before proposing a different approach.
- `docs/STATUS.md`: what's built, what's tested, what's not, what's next

## Direction (2026-10-06)

Penguin is moving to a **desktop app** (Electron) that runs the bot on the user's machine, plus a small Cloudflare Worker for accounts, Stripe and license tokens. The server stack under `src/` stays as optional adapters during the migration. Read the DECISIONS entry before changing structure. Throwaway experiments live in `spikes/` and are not part of the build.

## What Penguin is

An AI standup assistant. It sends a bot into the owner's daily standup on **Zoom, Google Meet or Microsoft Teams**. The bot waits until someone hands the floor to the owner by name, then speaks the owner's update aloud. It answers short follow-ups using only prepared facts and posts a recap to Slack afterwards. The update is drafted before the meeting from GitHub, Linear and Jira activity.

Owner: Mujeeb Adebowale, senior backend/full-stack engineer (TypeScript, Node, Go, Postgres, Redis). Lagos, Nigeria (timezone `Africa/Lagos`). Write code at a senior level. Skip basic explanations.

## Non-negotiables

1. **Penguin always discloses it's an AI** before speaking (`disclosure()` in `src/core/brain/claude.ts`), and the bot name ends in `(AI)` (on Teams, which forbids parentheses in guest names, ` - AI`). Never remove or make this optional.
2. **Never invent facts in the meeting.** Follow-up answers come only from the prepared `draft.facts`; otherwise Penguin defers to the owner. Keep prompts strict about this.
3. **All platforms go through the provider interface** (`src/core/providers/types.ts`). No platform-specific code outside a provider adapter.
4. **Services stay stateless across nodes.** A live meeting's in-memory state lives only on the realtime node holding its WebSocket. Anything durable goes to Postgres, and anything cross-node goes through Redis. No sticky sessions.
5. **Jobs must be idempotent.** Use deterministic BullMQ job ids (`prep-<id>`, `join-<id>`, `recap-<id>`). Don't use `:` in job ids or scheduler keys; BullMQ rejects it.
6. **Secrets are encrypted at rest** (`encrypt`/`decrypt` in `src/core/crypto.ts`). Never log tokens; the pino logger redacts `token` and `authorization`.

## Stack

- Node 20+ (ESM, `"type": "module"`), TypeScript strict with `noUncheckedIndexedAccess`, NodeNext modules. **Relative imports must end in `.js`.**
- Express 5 (api), `ws` (realtime), BullMQ on ioredis (queue and schedules), `pg` (raw SQL, no ORM), zod (env and request validation), pino (logs)
- Anthropic SDK (`CLAUDE_MODEL`, default `claude-sonnet-5-5`), Deepgram (streaming STT `nova-3` + TTS Aura)
- Meeting bots: Recall.ai (default) or Attendee (open source, self-hostable), switched with `BOT_PROVIDER`
- Tests: vitest. No test DB needed for unit tests; external services are mocked.

## Layout

```
src/
  api/        app.ts (routes, webhooks), main.ts
  realtime/   main.ts (HTTP + WS server, drain), session.ts (one live meeting), turn.ts (when to speak, pure)
  worker/     main.ts (job handlers: schedule.fire, meeting.prep, meeting.join, meeting.recap)
  core/
    config.ts       zod-validated env; requireKey() for lazily required keys
    db.ts repo.ts   pg pool; all SQL lives in repo.ts
    queue.ts        BullMQ queue, typed JobData, schedulers
    redis.ts crypto.ts log.ts migrate.ts meetings.ts
    providers/      types.ts (interface + detectPlatform), recall.ts, attendee.ts
    sources/        github.ts, linear.ts, jira.ts, types.ts (previousWorkdayStart)
    brain/          claude.ts (draft, follow-up, recap prompts), slack.ts
    speech/         deepgram.ts (openListener, speak)
public/agent.html   page the bot loads in the call: its camera, mic and speaker
desktop/            Electron + React desktop app (see desktop/README.md); reuses src/realtime/turn.ts
spikes/             throwaway experiments, not part of the build
migrations/         numbered .sql files, applied once each, in order
test/               *.test.ts
```

## Commands

```bash
npm install
docker compose up -d postgres redis
npm run migrate
npm run dev:api        # :8080
npm run dev:realtime   # :8081
npm run dev:worker
npm test               # vitest
npm run typecheck      # must pass before you finish
npm run build          # tsc -> dist/
```

Live meetings need public URLs (ngrok) for `API_PUBLIC_URL` and `REALTIME_PUBLIC_URL`, plus `RECALL_API_KEY` (or `ATTENDEE_API_KEY`), `ANTHROPIC_API_KEY` and `DEEPGRAM_API_KEY` in `.env`. See `.env.example`.

## Conventions

- Put new SQL in `repo.ts`. Schema changes go in a **new** `migrations/00N_name.sql`; never edit an applied migration.
- New job type: add it to `JobData` in `queue.ts`, add a handler in `worker/main.ts`, give it a deterministic `jobId`.
- New meeting platform or bot vendor: implement `MeetingBotProvider`, register it in `providers/index.ts`, and add webhook parsing tests in `test/core.test.ts`.
- New activity source: implement `Source`, register it in `sources/index.ts`, and add the kind to the `integrations.kind` CHECK through a new migration.
- Turn-taking changes: `turn.ts` stays pure (no I/O, time passed in), and every rule change gets a test in `test/turn.test.ts`, including a false-positive case.
- API errors are JSON `{ error: "plain sentence saying what's wrong and how to fix it" }`; zod errors become 400 automatically.
- Keep functions small and typed; avoid `any` except at external API boundaries.
- Before finishing any change: `npm run typecheck && npm test`.

## Gotchas

- Webhooks can arrive late, duplicated or out of order. `setMeetingStatus` never moves a meeting out of `ended`/`failed`, and recap is deduped by job id.
- Recall status webhooks are configured once in the Recall dashboard (`/webhooks/recall?token=WEBHOOK_SECRET`). Attendee webhooks are set per bot in `createBot`.
- The agent page runs inside the provider's headless browser: meeting audio arrives as the page's microphone, and whatever the page plays becomes the bot's voice. It sends 16 kHz PCM16 to `/ws` and plays MP3 it receives back.
- The update audio is synthesized when the session starts, so speaking is instant. Only follow-ups do a live Claude + TTS round trip.
- The realtime node refuses new sockets with 503 when full (`REALTIME_MAX_SESSIONS`), when draining, or when the AI/speech keys are missing.

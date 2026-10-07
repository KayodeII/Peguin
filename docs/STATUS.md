# Status

Last updated: 2026-10-06

## Built

- api, realtime and worker services; Postgres schema and migrator; BullMQ queue and schedulers
- Recall.ai and Attendee provider adapters (create bot, leave, webhook parsing)
- GitHub, Linear and Jira activity sources; previous-workday window (Monday covers Friday onward)
- Claude prompts: standup draft (script + facts), follow-up answers (facts only), Slack recap
- Deepgram streaming STT and TTS
- Turn detector with sound-alike name matching (handles "Mujib", "Moo jeeb")
- Agent page (`public/agent.html`): avatar, live captions, mic capture → 16 kHz PCM16, MP3 playback, reconnect
- Dockerfile (one image, three commands) and docker-compose for the local stack

## Verified

- `npm run typecheck`: clean
- `npm test`: 26 passing (turn detection incl. false positives, full session loop with fake STT/TTS/Claude, provider webhooks, crypto, platform detection, workday dates)
- Local end-to-end against real Postgres 16 and Redis: migrations (idempotent), API auth and validation, schedule registered with the correct next run in Africa/Lagos, prep → join pipeline with retries and fallback, webhook status transitions incl. out-of-order events, recap dedupe, realtime token and capacity checks

## Not verified yet

- A real call on any platform (needs Recall/Attendee, Anthropic and Deepgram keys and ngrok)
- Docker image build (`docker compose up --build`)
- Recall output-media audio quality and latency in practice
- Attendee webhook payload field names (parsed defensively; confirm against a real event)
- Deepgram model names `nova-3` / `aura-2-thalia-en` on the owner's account

## Direction change (2026-10-06)

Moving to desktop-first (see `docs/DECISIONS.md`). Spike in `spikes/meet-join/` **passed in a real Meet** (owner on phone, Penguin on the Mac): it joins as a guest named "(AI)", is admitted, speaks a line heard on the phone, and taps the other participants' audio (3 remote tracks, speech detected). Learned: Meet admits guests muted, so Penguin must click "Turn on microphone"; Penguin's window must be muted locally or it echoes on the host machine. Chromium logs a harmless BUNDLE codec-collision warning during setup.

Teams and Zoom drivers added to the spike. Teams (browser guest join) reaches the meeting lookup on a fake link, but **browser automation for Teams is dropped** after the owner's Microsoft account was locked during testing. Teams moves to Azure Communication Services (see DECISIONS). Zoom browser client **passed in a real meeting** (owner hosting on phone): fills "Your Name" itself (found by label; the field has no placeholder), joins as "Mujeeb (AI)", turns on audio and video, and speaks. Zoom feature pop-ups ("Got it") have to be dismissed.

Respond loop built in the spike: page audio → 16 kHz PCM → energy-gated utterances → local whisper.cpp (`base.en`, Metal; built by `setup-whisper.sh` into the spike's gitignored `vendor/`) → `TurnDetector` (bundled from `src/realtime/turn.ts`) → pre-synthesized update or a deferral. Verified offline with synthesized speech: handoff, follow-up and "floor moved on" all decided correctly, about 50 ms per transcription. Seen: "auth" heard as "Earth"; the real app should prompt Whisper with ticket and project names.

**Desktop app started** (`desktop/`): Electron + React preferences window (name with enforced AI suffix, aliases, timezone, standing notes as the update, connection and voice placeholders, show-window toggle), menu bar icon, and "send Penguin to a meeting" with live status and transcript. The spike's join, listen, decide and speak loop is ported to TypeScript (`MeetingRunner`). Typecheck and build pass; the window renders. Not yet run against a real meeting from the app.

## Next (desktop)

1. Teams: ACS prototype (needs an Azure account)
2. Respond loop: test in a real call (owner on phone says "Mujeeb, you're up")
3. Desktop app: real-call test from the app; Piper TTS; packaging (electron-builder, bundled whisper binary, model download on first run)
4. Cloudflare Worker + D1: Google and email-link sign-in, `penguin://` app sign-in, Stripe, license tokens, OAuth for Calendar/GitHub/Linear/Jira, Claude proxy (draft + answers), ACS tokens for Teams
5. Website (React + Vite on Cloudflare Pages): landing, sign-up, checkout, download
6. Ports refactor as the desktop and server share more code
6. Zoom Meeting SDK (Marketplace approval) to replace the browser client

## Next (server, paused)

1. First live test: one Zoom or Meet call with Recall, `POST /v1/users/:id/meetings`
2. Tune `turn.ts` on real transcripts (log decisions, then add cases to tests)
3. Web dashboard: login, OAuth connect for GitHub/Linear/Jira, live captions from `penguin:meeting:<id>`
4. Per-team accounts and API keys to replace the single `ADMIN_API_KEY`
5. Barge-in: stop speaking when someone talks over Penguin
6. Optional, opt-in voice cloning

# Decisions

Newest first. Add an entry when you make a choice a future agent might otherwise undo.

## 2026-10-06: Use a meeting-bot provider instead of native platform APIs

Research (October 2026):
- **Google Meet Media API** is a developer preview, closed to new registrations, and **receive-only**: it can't send audio into a call. Each connection also needs approval from someone in the meeting's org. That rules it out for a speaking bot.
- **Zoom Realtime Media Streams (RTMS)** is **receive-only** (audio, video, transcripts and chat over WebSocket). Speaking needs a bot joining through the Zoom Meeting SDK.
- **Microsoft Teams** Graph media bots can send and receive 20 ms PCM, but need Windows Server, .NET with `Microsoft.Skype.Bots.Media` (no Linux version), a public IP and TLS certificate, and admin consent for `Calls.AccessMedia.All`.

Decision: put the platforms behind a `MeetingBotProvider` interface, backed by:
- **Recall.ai** (default): its Output Media API loads our webpage as the bot's camera and mic on Zoom, Meet, Teams and Webex. We use the `web_4_core` variant for smooth audio, which their docs list at about $0.60/hour pay-as-you-go.
- **Attendee** (`attendee-labs/attendee`, open source, Django in one Docker image): `voice_agent_settings.url` does the same thing. Use it to self-host or cut per-hour cost.

Both providers feed meeting audio to the page as its microphone, so a single agent page (`public/agent.html`) works for every platform and provider.

## 2026-10-06: Do speech-to-text ourselves from page audio

Recall exposes an in-page transcript socket, but Attendee doesn't. Streaming the page mic to our realtime node and running Deepgram there gives one code path for both providers, plus diarization and name keyterm boosting.

## 2026-10-06: Deepgram for both STT and TTS

One vendor and one key; low-latency streaming STT (`nova-3`) and fast TTS (Aura, MP3). Both models are set through env vars if we switch.

## 2026-10-06: Three services, Postgres + Redis + BullMQ

The owner asked for the best architecture that scales. The heavy per-meeting work (a browser in the call) is the provider's, so ours is one WebSocket plus streaming STT/TTS per meeting. Keeping each meeting on one realtime node avoids distributed session state. BullMQ gives retries, delays, deduplication and tz-aware cron schedulers on infrastructure we already need.

## 2026-10-06: Prepare and pre-synthesize the update

Latency when called on is what users notice. The update is drafted in `meeting.prep` and turned into audio when the session starts, so playback starts immediately. Only follow-ups do a live round trip.

## 2026-10-06: Always disclose

The bot announces itself as the owner's AI assistant and its name ends in "(AI)". This covers recording and AI-participant policies and protects the owner if something is misstated. It's non-negotiable (see AGENTS.md).

## 2026-10-06: Name

The app is named **Penguin** (the owner typed it once as "Peguin").

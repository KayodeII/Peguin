# Decisions

Newest first. Add an entry when you make a choice a future agent might otherwise undo.

## 2026-10-07: Paystack instead of Stripe; our own 14-day trial

- **Billing is Paystack** (the owner is in Lagos; a Paystack key already exists). Checkout initialises a transaction with the plan (`PAYSTACK_PLAN_CODE`), which creates the subscription on payment. Manage billing uses Paystack's manage-subscription link.
- **Webhook** `/webhooks/paystack`: `x-paystack-signature` is the HMAC-SHA512 of the raw body keyed with the secret key. Events carry no id, so each is deduplicated by a hash of its body. Subscription and invoice events always re-read the subscription from Paystack, matched to the user by email. The webhook URL is set in the Paystack dashboard (no API for it).
- **Trial:** Paystack plans have no trials, so Peguin gives 14 days from sign-up with no card (`users.trial_ends_at`). Entitlement = trial, or active, or non-renewing until the period ends, or a failed renewal within 3 days.
- **Price:** the Paystack business doesn't accept USD, so the plan is in naira. Test mode uses a ₦7,500/month placeholder until the owner sets the real price (`scripts/paystack-setup.mjs --currency NGN --amount …`). The website reads the live plan from `GET /api/plan`, so the shown price always matches what Paystack charges.
- Stripe code and columns are retired (the columns stay in the schema; SQLite can't drop them cleanly).

## 2026-10-07: Notion-style themes; domain www.peguin.co

- **Desktop look:** Discord's layout with Notion's colour and type by default. Themes in Settings → Appearance: System (follows the OS between Notion light and dark), Light, Dark, Midnight (Discord dark), plus five accents. Appearance saves instantly. Settings opens from one gear, in the user panel.
- **Domain:** `https://www.peguin.co` is canonical and `peguin.co` redirects to it. Installed builds talk to www.peguin.co; running from source talks to the local Worker unless `PENGUIN_CLOUD_URL` is set.

## 2026-10-07: One Cloudflare Worker for the website and the API

`cloud/` is a single Worker with D1. It serves the website (`web/dist`, Workers static assets, Cloudflare's successor to Pages) and the API on one origin, so session cookies stay first-party and there's one deploy.
- **Sign-in:** email links (Resend; printed to the console in dev) and Google. Sessions are random tokens stored hashed, in an HttpOnly SameSite=Lax cookie; cookie-authenticated writes must be JSON (CSRF).
- **Desktop sign-in:** `/app/connect` with a PKCE S256 challenge, returning to `peguin://auth` with a one-time code that only the app's verifier can redeem, for a revocable app token.
- **Billing:** originally Stripe; replaced by Paystack (see the entry above).
- **Licences:** Ed25519-signed, at most 30 days, plus 3 offline days past the period end. The private JWK is a Worker secret; the public key ships in the app. JWKs are imported without `alg`, because Node and Workers disagree on its value.
- **Claude:** `claude-opus-5` through the official SDK, with server-side refusal fallbacks (`fallbacks: "default"`). Drafts use high effort; live answers use low effort for speed. Daily per-user caps. Same prompts as the desktop (`src/core/brain/prompts.ts`).
- The old server default `claude-sonnet-5-5` wasn't a valid model ID; it's now `claude-opus-5`.

## 2026-10-07: Product shape: desktop app first, then website and payments

- **Build order:** the real desktop app (Electron + React) with a preferences window first, then the website, sign-up and Stripe on Cloudflare, then opt-in voice cloning.
- **Sign-in:** Google plus a passwordless email link, handled by the Cloudflare Worker. The desktop app signs in by opening the browser and returning through a `peguin://` link.
- **Web stack:** React + Vite on Cloudflare Pages; the Worker serves the API. The desktop app's UI uses the same React.
- **Desktop build:** Vite for the React window, esbuild for the main process and preloads (electron-vite doesn't support Vite 8 yet).
- **Display name** is a user preference, but the AI suffix is always added (" (AI)", or " - AI" on Teams).
- **Connections:** users connect their calendar (to find standups and double-bookings) and GitHub/Linear/Jira (facts for the update). They don't connect Zoom, Meet or Teams logins: Peguin joins as a guest.
- **Turn-taking stays rule-based** (`src/realtime/turn.ts`): instant, free and testable. An LLM classifier for ambiguous cases may come later in the paid tier. The LLM's job is drafting the update and answering from facts.
- **Voice cloning (later, opt-in):** only the account holder's own voice, recorded live in the app with a consent sentence (no uploads); disclosure stays in every meeting; deletable. Check model licences before choosing (several open models are non-commercial).

## 2026-10-07: Official SDKs for Teams and Zoom; strict join pacing

During Teams spike testing (about six automated guest joins to a fake meeting within minutes, from the owner's IP), the owner's personal Microsoft account was locked for "activity that goes against the Microsoft Services Agreement". The spike never signed in, so the cause is unconfirmed, but platforms clearly detect and act against bot-like joins, and users' accounts and IPs must not be put at risk.

Decision:
- **Teams:** join through **Azure Communication Services** (ACS), Microsoft's supported way for an external app to join a Teams meeting as a guest with a custom name, sending and receiving audio. The ACS web Calling SDK runs inside the Electron app, so the desktop architecture is unchanged. It's billed per minute (a few cents per standup; check current pricing), so it goes through the server and is covered by the subscription.
- **Zoom:** the browser-client approach for the spike; the **Zoom Meeting SDK** for production. That needs Zoom Marketplace approval for joining meetings outside our own account.
- **Google Meet:** browser guest join (no official route that can speak; see the first entry). Keep it, and watch for enforcement.
- **Join rules for every driver:** one join click per 15 s, at most 3 per meeting, no retry loops. Never sign in to any account inside Peguin's window (sign-in pages are blocked). Test against real meetings only, one join per test.

## 2026-10-07: Bot name suffix is " - AI" on Teams

Teams guest names allow only letters, numbers, spaces and `- ' . _ @`; "Mujeeb (AI)" leaves "Join now" disabled. On Teams the name is "Mujeeb - AI"; everywhere else it stays "Mujeeb (AI)". The spoken disclosure is unchanged.

## 2026-10-06: Desktop-first; each user's machine runs the bot

Context: the main use case is covering a standup when the owner is double-booked, so their computer is already on and in a call. Recall, Deepgram and a hosted cluster all charge per use; running on the user's machine makes running costs close to zero.

Decision:
- **Peguin becomes an Electron app.** A hidden Chromium window joins the meeting's web client as a guest named "<owner> (AI)". It replaces `getUserMedia` with Peguin's voice and an avatar, and taps the other participants' WebRTC audio tracks. This is the same technique Recall and Attendee use, run locally. Electron rather than Tauri, because we need our own Chromium to inject audio.
- **Local speech:** whisper.cpp (STT) and Piper (TTS). Local storage: SQLite. A local scheduler replaces BullMQ.
- **A small server on the owner's Cloudflare domain:** a Worker for accounts, Stripe subscription webhooks and signed license tokens (Ed25519, about 30 days, with offline grace), plus D1, and R2 for installers. Drafting with Claude stays server-side, so the API key never ships in the client and the paid feature can't be cracked away.
- **Live follow-ups:** answered by Claude through the server when subscribed and online. Otherwise Peguin defers to the owner (`FOLLOWUPS=defer`); a small local model never answers live questions (non-negotiable 2).
- **Kept as optional adapters, not the default:** the current server stack (Recall/Attendee, Deepgram, BullMQ, Postgres).

Costs: Apple Developer Program for notarization and a Windows code-signing certificate before distribution; Stripe fees on revenue; a few cents of Claude per user. Local development needs neither signing nor paid keys.

Order: (1) spike that Electron can join Meet, speak and hear (`spikes/meet-join/`); (2) ports refactor (domain and use cases independent of vendors); (3) Electron app skeleton; (4) license Worker; (5) Teams and Zoom web clients.

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

Originally named "Penguin". Renamed to **Peguin** on 2026-10-07 to match the domain (peguin.co); every user-facing string, the bot's spoken introduction and the `peguin://` URL scheme use it. Internal identifiers (package names, `PENGUIN_*` env vars, the D1 database, the repo folder) keep "penguin" to avoid churn.

# Status

Last updated: 2026-10-09. Earlier history is in `git log` and `docs/DECISIONS.md`. **Start with "Handoff" below.**

## Phase: private beta

Goal: 5-10 people using Peguin in their real standups every day. Everything below is built unless marked otherwise.

## Built

**Desktop app (`desktop/`, Electron, macOS Apple silicon)**
- Joins Google Meet and Zoom as a guest named "<Name> (AI)" from a hidden window (Teams needs ACS, see DECISIONS); muted until it speaks, camera off.
- Listens with a bundled whisper.cpp; `TurnDetector` decides when it's been handed the floor, when to answer and when to stay quiet.
- Finds standups in the owner's calendars (Mac Calendar via EventKit, private iCal links, Calendly) by their own words, or uses a fixed time.
- Writes the update from git, GitHub (via `gh`) and Claude Code sessions, 15 minutes before the standup; answers follow-ups from those facts only, otherwise defers. Claude through the Peguin account when subscribed, else the Claude CLI. Prompts write for the ear.
- Speaks in the standard voice or, opt-in, the owner's own voice (Chatterbox Turbo on-device; live-recorded, encrypted sample; owner-set pronunciations, pause, expressiveness and checks; update made ahead and cached).
- Answers are spoken a sentence at a time; Peguin stops and listens when someone talks over it (setting, on by default).
- After each meeting, a recap in `#recaps`: follow-ups (every deferred question, plus Claude's), a short summary from the transcript (setting), what Peguin said, the transcript; encrypted, kept 30 days by default; a notification.
- Discord-style UI with Notion themes; sign-in to the account via `peguin://`; update check every six hours.

**Cloud (`cloud/`, Cloudflare Worker + D1) at www.peguin.co**
- Email-link and Google sign-in, 14-day trial, Paystack subscription (test mode), Ed25519 licences, server-side Claude for drafts and answers.
- Website (`web/`): landing with the scripted app demo, pricing, account (install and update status, download), help penguin and chat, designed emails.
- Releases: tag `v*` builds the .dmg on GitHub Actions; the site serves the latest GitHub Release.

## Verified

- `npm test` (102), typecheck for root, cloud, web and desktop; CI on every PR.
- Real calls (earlier builds): Meet and Zoom join, speak and listen with the owner on a phone.
- Own voice end to end in Electron: encrypted sample, update generated and checked (~25 s), cached replay (0.01 s), fallback to the standard voice.
- Meeting playback queue and talk-over stop, against a fake Meet page with the real preload and inject script: chunks play in order, mic unmutes and re-mutes, a stop cuts off at once and mutes.

## Not verified yet

- A full real standup from the current app with the owner's voice on (owner on a phone).
- Talk-over detection in a real call (false stops from participants' echo or noise).
- Paystack live payments; sign-in emails reaching inboxes (Resend DNS); server-side Claude in production (no `ANTHROPIC_API_KEY` set).

## Next

1. Merge `launch` (below), deploy the Worker with migration 0005, release v0.4.0.
2. Owner setup for the new features: OAuth apps (`docs/OAUTH_SETUP.md`), `ADMIN_TOKEN`, tier prices (`cloud/scripts/paystack-setup.mjs`), and Google's review for the calendar scope.
3. Real-call test: own voice (both engines), answers, talk-over, recap. Meet refused the owner's last test link ("You can't join this video call"): check the meeting allows signed-out guests before blaming the app.
4. Emotion cues for ElevenLabs: built on `emotion-cues`; needs a real listen with an ElevenLabs key.
5. Before charging strangers: legal entity and contact email in /privacy and /terms, Paystack live keys, Resend DNS, `ANTHROPIC_API_KEY`, Apple Developer ID (notarised app, auto-update), watermarking cloned audio.
6. Later: Team seats, streaming answer text, Linear and Jira, Teams via ACS, Windows.

## Handoff (2026-10-09)

### What's live
- Release **v0.3.0**. The Worker was last deployed before the recaps merge (`/api/recap` 404s live) and has no `ANTHROPIC_API_KEY` (help chat 503s).

### The `launch` branch (local until the owner pushes)
`main` + everything finished since v0.3.0, merged and tested together (118 tests):
- `natural-voice-sample`: consent sentence and natural talk recorded separately; the talk is the voice.
- `elevenlabs-voice`: Settings > Voice > "Where your voice is made": On this Mac or ElevenLabs (own API key; Eleven v4 for prepared lines, v4 Turbo for answers). Untested against the real API (no key here); the clone-verification step may need adjusting once tried.
- `plans-waitlist-oauth`: Free/Basic/Pro/Team (`src/core/plans.ts`), `SIGNUPS` waitlist switch with admin invites, one-click Google Calendar/Outlook/Calendly through the Worker. Untested against real OAuth providers.
- `legal-pages` (updated for all of the above, including Google's Limited Use statement) and `google-signin-reasons`.
- Dev aids: meeting progress prints to the terminal; `PENGUIN_PLAN=pro` lifts plan limits when running from source signed out (signed out counts as Free).

Throwaway, delete when done: `try-everything`. Kept for reference: `voice-finetune-spike` (merged into the voice work).

### Owner's end-to-end test (not done yet)
Local site (`cd cloud && npx wrangler dev`) and app (`cd desktop && PEGUIN_VOICE_MODEL_DIR=~/Desktop/penguin/spikes/voice/vendor/models/chatterbox-turbo npm run dev`, not signed in so drafts use the Claude CLI): onboarding, prepare, record voice, connect Mac Calendar, a real Meet with the owner on a phone (update, follow-up, talk-over, deferral), then the recap.

### Voice quality work in progress
The owner wants the most natural speech possible. In `spikes/voice/` (README, v3):
- All 60 training sentences recorded (3.8 minutes, `record_dataset.py`; the recorder now keeps one mic stream open because closing CoreAudio streams per sentence could hang).
- Fine-tuning Chatterbox Turbo with LoRA on the Mac works (65 s for 10 epochs). Toolkit defaults produced gibberish; English settings (original tokenizer, frozen text embeddings, r=16, lr 5e-5) trained cleanly: intelligible from 21 sentences, and about the same by word check from all 60 (single takes; remaining slips look like sampling noise). The owner is comparing `gen/mujeeb`, `gen/ft-en-21` and `gen/ft-en-60` by ear.
- Fair 40-clip comparison (README, "Fair comparison"): **a natural standup-style reference clip with no training (3.9% word error, 72% perfect) beats both today's read-through sample (7.5%, 38%) and the fine-tuned voice (10.7%, 38%)**. Cheapest product change: record the voice sample as natural talk. All six variants scored: averaging the fingerprint and output-layer-only training don't help; the owner is doing a blind listening test (`gen/blind/`) for naturalness.
- The fine-tuned voice can be shipped without PyTorch: `patch_onnx.py` bakes the 12.6 MB LoRA into the ONNX files (96/97 weights) and the app's engine runs it in real time. Training itself would need a cloud GPU (opt-in upload) or an MLX-Swift helper.
- OmniVoice and Qwen3-TTS (both Apache 2.0) are installed for a zero-shot comparison but haven't generated yet.
- If fine-tuning wins, shipping it is unsolved: the app runs ONNX, so each user's merged model would need exporting (no script yet), and training would have to run inside the app.

### Still waiting on the owner
Paystack Test webhook URL in the Paystack dashboard; final naira price and Paystack live keys; `ANTHROPIC_API_KEY` as a Worker secret; Resend DNS for peguin.co; `SUPPORT_INBOX` secret; Apple Developer ID (notarisation, removes "Open Anyway"); rotating the keys pasted in chat earlier.

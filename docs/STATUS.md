# Status

Last updated: 2026-10-10. Earlier history is in `git log` and `docs/DECISIONS.md`; where each feature lives is in `docs/features/`. **Start with "Handoff" below.**

## Phase: private beta

Goal: 5-10 people using Peguin in their real standups every day. Everything below is built unless marked otherwise.

## Built

**Desktop app (`desktop/`, Electron, macOS Apple silicon)**
- **Join as Peguin:** joins Google Meet and Zoom as a guest named "<Name> (AI)" from a hidden window (Teams needs ACS, see DECISIONS), muted until it speaks. Presents as plain Chrome (Meet refused Electron's identity). `TurnDetector` decides when it's been handed the floor, when to answer and when to stay quiet. Answers from the prepared facts only, a sentence at a time; stops when talked over. **Hand over to me** opens the meeting in the owner's browser and Peguin leaves.
- **Join as me (private copilot, Pro and Team):** the owner's own meeting in a Peguin window; Peguin hears only the other participants and suggests answers labelled From your notes / Not in your notes / General knowledge. Work/Interview switch, Check online (web-searched second answer), Hide, Pop out (notes in their own window, so a window share leaves them out), screen sharing through macOS's picker. Questions queue (three waiting at most).
- **Your own AI** for drafts, answers, suggestions and recap summaries: Claude Code, Codex CLI or an xAI key (Settings > AI). The Worker no longer runs AI for the app.
- **Speech recognition:** whisper.cpp large-v3-turbo q5_0 (~550 MB, downloaded on first run), primed with names and terms from the facts.
- **Voice:** the Mac's voice or a Grok voice (falls back to the Mac's); opt-in own voice on the Mac (Chatterbox Turbo) or ElevenLabs, from a live-recorded, consented, encrypted sample; prepared lines checked by ear.
- **Update writing** from git, GitHub (via `gh`) and Claude Code sessions, 15 minutes before the standup.
- **Calendars:** Mac Calendar (EventKit), Google Calendar and Outlook (one click, OAuth through the Worker), Calendly, iCal links; joins calendar standups automatically.
- **Recaps** in `#recaps`: follow-ups (every deferred question), optional summary, transcript; encrypted, kept 30 days by default.
- **Plans** gated offline from the signed licence; Discord-style UI with Notion themes; sign-in via `peguin://`.
- **Self-update** from GitHub Releases: download, SHA-256 check, unpack, "Restart to update".

**Cloud (`cloud/`, Cloudflare Worker + D1) at www.peguin.co**
- Email-link and Google sign-in (waitlist switch), 14-day Pro trial, Paystack subscriptions (test mode), Ed25519 licences, calendar OAuth hand-off, `/api/release` with a last-good fallback.
- Old app AI routes (`/api/draft|answer|suggest|recap`) answer 503 so pre-0.7 apps use their own Claude Code. Peguin's Anthropic key only serves the help chat (falls back to the FAQ without it).
- Website (`web/`): landing with the scripted app demo, pricing, account page, Privacy Policy and Terms, help penguin and chat, designed emails.
- **Deploys from GitHub:** `.github/workflows/deploy.yml` applies D1 migrations and deploys after CI passes on `main` (secrets `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`). Laptop deploys hit Cloudflare 429s on the owner's mobile IP.

## Verified

- `npm test` (151), typecheck for root, cloud, web and desktop; CI on every PR; the deploy workflow has succeeded on every merge since #19.
- Release assets for v0.6.0 to v0.8.0: checksums, bundle versions and code in the asar. `/api/release` serves 0.8.0. The owner's installed app is 0.7.0 (was 0.6.1).
- Real Meet (owner, 2026-10-10): the app is no longer refused after the user-agent fix; Join as me worked in a real call.
- Speech benchmark (12 questions, three accents, phone quality): word errors 12.9% to 4.2%.
- Copilot with real Claude and Codex calls (about 4 s and 10.5 s per answer; web checks 17-19 s), including the queue, labels, modes and Check online, in the app with demo questions.
- Own voice end to end in Electron (earlier build); the meeting playback queue and talk-over stop against a fake Meet page.

## Not verified yet

- **v0.8.0 doesn't contain #20 or #21**: it was tagged before they were merged. Release 0.9.0 to ship them.
- Self-update installing on the owner's Mac from a release to the next (0.7.0 to 0.9.0 is the next chance).
- Screen sharing from the copilot window (macOS picker) and Pop out in a real call.
- Grok chat and Grok voice with a real xAI key; Codex and Grok as the AI in a real meeting.
- A full Join as Peguin standup from the current app with the owner's voice on; talk-over in a real call.
- Paystack live payments; sign-in emails reaching inboxes (Resend DNS).

## Next

1. Release 0.9.0 from `main` (Work/Interview, Check online, Hide, Pop out, screen sharing), then confirm the installed app updates itself.
2. Owner's real-call test: Join as me (Work and Interview, Check online, Pop out with a window share, Present), Join as Peguin end to end, a recap.
3. Try a new xAI key in Settings (Grok chat, Grok voice "Hear it"). Revoke the key pasted in chat earlier.
4. Copilot ideas the owner may want: notes window opening on a second display, a compact newest-answer view, recaps for copilot meetings.
5. Owner setup: OAuth apps (`docs/OAUTH_SETUP.md`), `ADMIN_TOKEN`, tier prices (`cloud/scripts/paystack-setup.mjs`), Google's review for the calendar scope.
6. Before charging strangers: legal entity and contact email in /privacy and /terms, Paystack live keys, Resend DNS, Apple Developer ID (notarised app), watermarking cloned audio.
7. Later: Team seats, Slack recaps, Linear and Jira on the desktop, Teams via ACS, Windows.

## Handoff (2026-10-10)

### What's live
- **Site:** `main` at #21, deployed by the workflow. **App:** v0.8.0 is the latest release (same features as 0.7.0, see above).
- Owner's account `olukayodedayo200@gmail.com` is Pro until 2100 (created by hand in D1; sign-ups are waitlist-only).
- The owner runs `git push`, releases and anything touching production D1; agents give one exact command.

### Open
- `docs-refresh`: feature pages (`docs/features/`), README rewrite, this STATUS. Docs only.
- The owner has an uncommitted edit to `docs/DECISIONS.md` (removes two lines from the 2026-10-10 copilot entry); theirs to commit or drop.
- Every remote branch except `main` and `pr-assets` (PR screenshots, keep it) is merged into `main` and can be deleted.

### Voice research
In `spikes/voice/` (README): a natural-talk reference clip beat both a read script and a LoRA fine-tune; the app records natural talk. Fine-tuning can ship without PyTorch (`patch_onnx.py`) but needs a training runtime; OmniVoice and Qwen3-TTS haven't been compared yet.

### Still waiting on the owner
Paystack Test webhook URL in the Paystack dashboard; final naira price and Paystack live keys; Resend DNS for peguin.co; `SUPPORT_INBOX` secret; Apple Developer ID (notarisation, removes "Open Anyway"); rotating the keys pasted in chat earlier.

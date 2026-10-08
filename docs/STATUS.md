# Status

Last updated: 2026-10-08. Earlier history is in `git log` and `docs/DECISIONS.md`.

## Phase: private beta

Goal: 5-10 people using Peguin in their real standups every day. Everything below is built unless marked otherwise.

## Built

**Desktop app (`desktop/`, Electron, macOS Apple silicon)**
- Joins Google Meet and Zoom as a guest named "<Name> (AI)" from a hidden window (Teams needs ACS, see DECISIONS); muted until it speaks, camera off.
- Listens with a bundled whisper.cpp; `TurnDetector` decides when it's been handed the floor, when to answer and when to stay quiet.
- Writes the update from git, GitHub (via `gh`) and Claude Code sessions, 15 minutes before the scheduled standup; answers follow-ups from those facts only, otherwise defers. Claude through the Peguin account when subscribed, else the Claude CLI. Prompts write for the ear.
- Speaks in the standard voice or, opt-in, the owner's own voice (Chatterbox Turbo on-device; live-recorded, encrypted sample; owner-set pronunciations, pause, expressiveness and checks; update made ahead and cached).
- Answers are spoken a sentence at a time; Peguin stops and listens when someone talks over it (setting, on by default).
- Discord-style UI with Notion themes; sign-in to the account via `peguin://`; update check every six hours.

**Cloud (`cloud/`, Cloudflare Worker + D1) at www.peguin.co**
- Email-link and Google sign-in, 14-day trial, Paystack subscription (test mode), Ed25519 licences, server-side Claude for drafts and answers.
- Website (`web/`): landing with the scripted app demo, pricing, account (install and update status, download), help penguin and chat, designed emails.
- Releases: tag `v*` builds the .dmg on GitHub Actions; the site serves the latest GitHub Release.

## Verified

- `npm test` (78), typecheck for root, cloud, web and desktop; CI on every PR.
- Real calls (earlier builds): Meet and Zoom join, speak and listen with the owner on a phone.
- Own voice end to end in Electron: encrypted sample, update generated and checked (~25 s), cached replay (0.01 s), fallback to the standard voice.
- Meeting playback queue and talk-over stop, against a fake Meet page with the real preload and inject script: chunks play in order, mic unmutes and re-mutes, a stop cuts off at once and mutes.

## Not verified yet

- A full real standup from the current app with the owner's voice on (owner on a phone).
- Talk-over detection in a real call (false stops from participants' echo or noise).
- Paystack live payments; sign-in emails reaching inboxes (Resend DNS); server-side Claude in production (no `ANTHROPIC_API_KEY` set).

## Next

1. Real-call test of the current app: own voice, sentence-by-sentence answers, talking over Peguin. (Owner.)
2. Calendar sync: find standups in Google Calendar and join them (Google verification needed past 100 users).
3. After each meeting: an in-app recap (what was said, asked and deferred) and an optional Slack post.
4. Before charging strangers: Privacy Policy and Terms, Paystack live keys and final price, Resend DNS, `ANTHROPIC_API_KEY`, Apple Developer ID (notarised app, auto-update), watermarking cloned audio.
5. Later: streaming Claude's answer text, Linear and Jira sources, Teams via ACS, Windows.

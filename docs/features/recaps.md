# Recaps and follow-ups

After every meeting Peguin attends, the owner gets a recap: follow-ups first (every question Peguin deferred, never dropped), then an optional AI summary of the transcript, what Peguin said, and the transcript. Kept encrypted on the Mac for the owner's chosen period (default 30 days). Copilot meetings aren't recapped yet. Slack posting is planned.

## Decisions

- 2026-10-08: A recap after every meeting
- 2026-10-10: Every user's own AI (the summary uses it)

## Files

| Path | Role |
|---|---|
| `desktop/src/main/meeting/record.ts` | The structured log built during the meeting (pure) |
| `desktop/src/main/meetings.ts` | Storing, listing and expiring recaps |
| `desktop/src/main/sealed.ts` | Keychain encryption |
| `desktop/src/main/brain.ts` | The summary through the owner's AI |
| `src/core/brain/prompts.ts` | Recap prompt (transcript only, no speaker names) |
| `desktop/src/renderer/recaps.tsx` | `#recaps`: follow-up checklist, summary, transcript, unread count |
| `src/core/brain/slack.ts` | Server stack's Slack recap |

## Tests

`test/recap.test.ts`.

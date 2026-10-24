# Recaps and follow-ups

After every meeting Peguin attends, the owner gets a recap: follow-ups first (every question Peguin deferred, never dropped), then an optional AI summary of the transcript, what Peguin said, and the transcript. Kept encrypted on the Mac for the owner's chosen period (default 30 days). Slack posting is planned.

**Copilot meetings** (Join as me) are recapped too, unless the owner turns off Settings > Recaps > Recap meetings you join yourself. The record has `kind: "copilot"`: what the others said (the owner's mic is never recorded), each question with the suggestion the owner saw. A question the notes didn't cover ("Not in your notes.") becomes a follow-up ("Follow up on: ..."); one with no suggestion in time is "skipped", not a follow-up, because the owner was there to answer it. Suggestions aren't entries, so the transcript never shows Peguin saying anything. The summary uses `copilotRecapSystem`, which knows the owner's own words are missing. Kept only once Peguin started listening and heard someone.

## Decisions

- 2026-10-08: A recap after every meeting
- 2026-10-10: Every user's own AI (the summary uses it)
- 2026-10-24: Recaps for copilot meetings

## Files

| Path | Role |
|---|---|
| `desktop/src/main/meeting/record.ts` | The structured log built during the meeting (pure), Peguin's or a copilot meeting |
| `desktop/src/main/copilot/session.ts` | Keeps a copilot meeting's log and hands it over when it ends |
| `desktop/src/main/meetings.ts` | Storing, listing and expiring recaps |
| `desktop/src/main/sealed.ts` | Keychain encryption |
| `desktop/src/main/brain.ts` | The summary through the owner's AI |
| `src/core/brain/prompts.ts` | Recap prompt (transcript only, no speaker names) |
| `desktop/src/renderer/recaps.tsx` | `#recaps`: follow-up checklist, summary, transcript, unread count |
| `src/core/brain/slack.ts` | Server stack's Slack recap |

## Tests

`test/recap.test.ts` ("copilot meeting record" too), `test/copilot.test.ts` ("copilot recap").

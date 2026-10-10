# Calendars and the scheduler

Peguin finds standups in the owner's calendars and attends them: prepare 15 minutes before, join a minute before, each occurrence once, falling back to the fixed time in settings. A meeting counts as a standup when its title has one of the owner's words and it has a Meet, Zoom or Teams link.

Sources are adapters behind one interface: the Mac's Calendar (Swift EventKit helper, any account added to macOS), Google Calendar and Outlook (one click, OAuth through the Worker, which keeps no calendar tokens), Calendly, and private iCal links. Links and tokens are encrypted on the Mac.

## Decisions

- 2026-10-08: Standups from the owner's calendars
- 2026-10-08: Plans, a switchable waitlist, one-click calendars (OAuth hand-off with PKCE)

## Files

| Path | Role |
|---|---|
| `desktop/src/main/calendar/index.ts`, `types.ts` | The adapter interface and combining sources (dedupe, cache) |
| `desktop/src/main/calendar/match.ts` | Which meetings are standups |
| `desktop/src/main/calendar/mac.ts` + `desktop/native/calendar.swift` | Mac Calendar through EventKit (`desktop/scripts/build-calendar-helper.sh`) |
| `desktop/src/main/calendar/google.ts`, `microsoft.ts`, `calendly.ts`, `ics.ts` | The other sources |
| `desktop/src/main/calendar/oauth.ts`, `secrets.ts` | `peguin://calendar` hand-off, token refresh, encrypted storage (`calendar.bin`) |
| `desktop/src/main/scheduler.ts` | When to prepare and join (`due()`, pure) |
| `desktop/src/renderer/calendars.tsx` | Settings > Calendars |
| `cloud/src/calendars.ts` | OAuth consent, one-time hand-off, refresh pass-through |
| `cloud/migrations/0005_plans_waitlist_calendars.sql` | Hand-off table |
| `docs/OAUTH_SETUP.md` | Setting up the Google, Microsoft and Calendly OAuth apps |

## Tests

`test/calendar.test.ts`, `test/desktop.test.ts` ("scheduler"), `test/cloud.test.ts` ("calendar connections").

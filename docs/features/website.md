# Website, help chat and emails

www.peguin.co: a React + Vite site served by the same Worker as the API. Light-only, Notion neutrals with a tomato accent, motion-led, no invented social proof. The help penguin opens a chat that answers from the FAQ (Claude when available, otherwise the closest FAQ entry) and hands off to the team. Emails share one inline-styled layout.

## Decisions

- 2026-10-07: Website redesign modelled on Wispr Flow, Notion theme
- 2026-10-07: Brand palette and a bolder, photo-led website (superseded in part)
- 2026-10-07: Notion neutrals, no AI-slop patterns, motion-led website
- 2026-10-07: Light-only website with a flowing section colour
- 2026-10-07: App showcase with a grain gradient
- 2026-10-07: Reduced motion means calmer, not off
- 2026-10-07: Help penguin, help chat and designed emails
- 2026-10-09: Work without server-side AI (help chat fallback)
- `AGENTS.md` "Privacy Policy and Terms"

## Files

| Path | Role |
|---|---|
| `web/src/main.tsx`, `web/src/pages/Home.tsx` | Routing and the home page |
| `web/src/components/` | Hero, sections, scenes, demos (`AppDemo.tsx`, `MeetingDemo.tsx`), backgrounds, `HelpPenguin.tsx` |
| `web/src/ui.tsx` | Shared UI, `useBackgroundFlow` |
| `web/src/faq.ts` | FAQ, shared with the help chat |
| `web/src/pages/Legal.tsx` | Privacy Policy and Terms (must match what the code does) |
| `web/src/photos.ts`, `web/public/images/` | Photos and their sources |
| `web/og/`, `web/scripts/og.cjs` | Social images |
| `cloud/src/support.ts` | `/api/support/chat` and `/api/support/message` |
| `cloud/src/claude.ts` | `ask()` for the help chat |
| `cloud/src/email.ts`, `web/public/email/` | Email layout and art |
| `cloud/migrations/0003_support.sql` | Support messages |

## Tests

`test/cloud.test.ts` ("help chat", "help chat without Claude", "emails", "redirects after sign-in").

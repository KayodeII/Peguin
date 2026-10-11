# Accounts, plans, billing and licences

Sign-in with an email link or Google on www.peguin.co; the desktop app signs in through the browser and returns via `peguin://auth` (PKCE) for a revocable app token. Plans (Free, Basic, Pro, Team) are defined once and gate features; the app checks a signed licence offline. Billing is Paystack, with a 14-day Pro trial and no card. New sign-ups can be switched to a waitlist.

## Decisions

- 2026-10-07: One Cloudflare Worker for the website and the API (sign-in, licences)
- 2026-10-07: Paystack instead of Stripe; our own 14-day trial
- 2026-10-08: Plans, a switchable waitlist, one-click calendars
- 2026-10-10: Every user's own AI (plans no longer include AI usage)

## Files

| Path | Role |
|---|---|
| `src/core/plans.ts` | The plans and what each includes (Worker, website and app) |
| `cloud/src/auth.ts` | Email links, Google, sessions, app connect (PKCE) |
| `cloud/src/billing.ts` | Paystack checkout, webhook, entitlement |
| `cloud/src/license.ts` | Ed25519-signed licences |
| `cloud/src/waitlist.ts` | Waitlist and invites (`SIGNUPS`, `POST /api/admin/invite`) |
| `cloud/src/crypto.ts`, `http.ts`, `env.ts`, `index.ts` | Helpers, environment, routes |
| `cloud/migrations/0001`–`0005` | Users, sessions, app tokens, Paystack, plans, waitlist |
| `cloud/scripts/paystack-setup.mjs`, `license-keys.mjs`, `import-secrets.mjs` | One-off setup |
| `desktop/src/main/account.ts` | App sign-in, token (Keychain), licence |
| `desktop/src/main/plan.ts` | Feature gates; Free's weekly standup count (`joins.json`); `PENGUIN_PLAN` in development |
| `web/src/pages/Account.tsx` | Account page: plan, billing, installed app |

## Tests

`test/cloud.test.ts` (Paystack signatures, entitlement, licences, redirects, plans), `test/calendar.test.ts` ("plan limits").

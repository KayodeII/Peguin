# Peguin cloud

One Cloudflare Worker with D1: sign-in (email link, Google), desktop app sign-in (`peguin://` + PKCE), Paystack subscriptions (with our own 14-day trial), signed licences, and server-side Claude for drafts and live answers. It also serves the website from `../web/dist`.

```bash
cd cloud
npm install
cp .dev.vars.example .dev.vars        # fill what you have; sign-in links print to the console without email
npm run keys:license                  # LICENSE_PRIVATE_JWK for .dev.vars; the public key goes in the desktop app
npm run db:migrate:local
npm run dev                           # http://localhost:8787
```

Routes: `POST /auth/email`, `GET /auth/email/verify`, `GET /auth/google[/callback]`, `POST /auth/signout`, `GET /app/connect`, `POST /api/app/token`, `POST /api/app/signout`, `GET /api/me`, `POST /api/billing/checkout`, `POST /api/billing/portal`, `GET /api/license`, `POST /api/draft`, `POST /api/answer`, `POST /api/recap`, `GET /api/plans`, `POST /api/waitlist`, `GET /api/admin/waitlist`, `POST /api/admin/invite`, `GET /calendar/connect`, `GET /calendar/callback`, `GET /api/calendar/providers`, `POST /api/calendar/token`, `POST /api/calendar/refresh`, `POST /webhooks/paystack`.

Plans are in `../src/core/plans.ts`; prices are Paystack plans: `pbpaste | node scripts/paystack-setup.mjs --currency NGN --basic 3000 --pro 7500` sets `PAYSTACK_PLANS`. `SIGNUPS` in `wrangler.jsonc` switches between open sign-up and the waitlist. Invite people: `curl -X POST https://www.peguin.co/api/admin/invite -H "authorization: Bearer $ADMIN_TOKEN" -H "content-type: application/json" -d '{"count":10}'` (or `{"emails":["a@b.co"]}`). Calendar OAuth redirect URI for every provider: `https://www.peguin.co/calendar/callback`.

Production is `https://www.peguin.co` (the bare `peguin.co` redirects there). Deploy: create the D1 database (`wrangler d1 create penguin`, put its id in `wrangler.jsonc`), `wrangler secret put` each secret, `npm run db:migrate`, then `npm run deploy`. Paystack: `pbpaste | node scripts/paystack-setup.mjs` (key from the clipboard) creates the plan and sets the secrets; then set the webhook URL `https://www.peguin.co/webhooks/paystack` in Paystack → Settings → API Keys & Webhooks. Google OAuth redirect URI: `https://www.peguin.co/auth/google/callback`. Existing credentials: `node scripts/import-secrets.mjs <.env> [--paystack] [--resend-domain]`. with `checkout.session.completed` and `customer.subscription.*`.

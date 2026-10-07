# Penguin cloud

One Cloudflare Worker with D1: sign-in (email link, Google), desktop app sign-in (`penguin://` + PKCE), Stripe subscriptions, signed licences, and server-side Claude for drafts and live answers. It also serves the website from `../web/dist`.

```bash
cd cloud
npm install
cp .dev.vars.example .dev.vars        # fill what you have; sign-in links print to the console without email
npm run keys:license                  # LICENSE_PRIVATE_JWK for .dev.vars; the public key goes in the desktop app
npm run db:migrate:local
npm run dev                           # http://localhost:8787
```

Routes: `POST /auth/email`, `GET /auth/email/verify`, `GET /auth/google[/callback]`, `POST /auth/signout`, `GET /app/connect`, `POST /api/app/token`, `POST /api/app/signout`, `GET /api/me`, `POST /api/billing/checkout`, `POST /api/billing/portal`, `GET /api/license`, `POST /api/draft`, `POST /api/answer`, `POST /webhooks/stripe`.

Production is `https://www.peguin.co` (the bare `peguin.co` redirects there). Deploy: create the D1 database (`wrangler d1 create penguin`, put its id in `wrangler.jsonc`), `wrangler secret put` each secret, `npm run db:migrate`, then `npm run deploy`. Stripe webhook endpoint: `https://www.peguin.co/webhooks/stripe`; Google OAuth redirect URI: `https://www.peguin.co/auth/google/callback` with `checkout.session.completed` and `customer.subscription.*`.

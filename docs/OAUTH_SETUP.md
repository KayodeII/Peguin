# Calendar OAuth apps

One-time setup so "Connect" works for Google Calendar, Outlook and Calendly in the desktop app. Each provider gets the same redirect URI:

```
https://www.peguin.co/calendar/callback
http://localhost:8787/calendar/callback     (local testing with `npm run dev` in cloud/)
```

The Worker hides a provider until both its client ID and secret are set, so you can do them one at a time. Check what's live with `curl https://www.peguin.co/api/calendar/providers`.

## Google Calendar

Reuses the OAuth client you already have for "Continue with Google" (`GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`), so there are no new secrets.

1. Open https://console.cloud.google.com and pick the project that holds the sign-in client.
2. **APIs & Services → Library**: search "Google Calendar API" and click **Enable**.
3. **Google Auth Platform → Data access → Add or remove scopes**: add `https://www.googleapis.com/auth/calendar.events.readonly` (it's listed as "See events on all your calendars"). `openid` and `email` are already there for sign-in. Save.
4. **Google Auth Platform → Clients**: open the Web client used for sign-in, and under **Authorized redirect URIs** add both URIs above. Save.
5. **Google Auth Platform → Audience**:
   - While the app is in **Testing**, only the test users you add here (up to 100) can connect, and their access expires after 7 days. That's fine for you and early users.
   - To open it to everyone, click **Publish app**. A calendar scope is "sensitive", so Google reviews it. It needs the homepage, the privacy policy URL (the `legal-pages` branch has to be live first), a short video showing the Connect flow and how Peguin uses the events, and a written reason ("finds the user's standup meetings so the app can join them; read-only, events are not stored on our servers"). Review usually takes a few days to a few weeks.

## Outlook (Microsoft 365 and personal Outlook.com)

1. Open https://entra.microsoft.com, then **Applications → App registrations → New registration**.
   - Name: `Peguin`
   - Supported account types: **Accounts in any organizational directory and personal Microsoft accounts** (the Worker uses the `common` endpoint, which needs this).
   - Redirect URI: platform **Web**, value `https://www.peguin.co/calendar/callback`. Register.
2. On the app's **Overview**, copy **Application (client) ID**. This is `MICROSOFT_CLIENT_ID`.
3. **Authentication**: add the localhost redirect URI too (Web platform).
4. **Certificates & secrets → Client secrets → New client secret** (24 months). Copy the **Value** column right away (not the Secret ID; the value is shown once). This is `MICROSOFT_CLIENT_SECRET`. Put the expiry date in your calendar: connections stop refreshing when it expires.
5. **API permissions → Add a permission → Microsoft Graph → Delegated permissions**: tick `Calendars.Read`, `offline_access`, `openid`, `email`. `User.Read` is already there. No admin consent is needed for these, though some companies make their staff ask an admin anyway.
6. Optional but recommended before strangers use it: **Branding & properties → Publisher verification** (needs a Microsoft Partner Network ID). Without it, many work tenants won't let their users consent to the app.

## Calendly

1. Open https://developer.calendly.com, sign in, then go to **My apps → Create new app**.
   - Kind of app: **Web**
   - Environment: **Sandbox** to test (allows the localhost redirect), then create a **Production** app for real users. Each has its own ID and secret.
   - Redirect URI: `https://www.peguin.co/calendar/callback` (and the localhost one on the sandbox app).
2. Copy the **Client ID** and **Client secret**. These are `CALENDLY_CLIENT_ID` and `CALENDLY_CLIENT_SECRET`. The webhook signing key isn't needed.

## Put the secrets on the Worker

Run each line and paste the value when it asks:

```
cd ~/Desktop/penguin/cloud
npx wrangler secret put MICROSOFT_CLIENT_ID
npx wrangler secret put MICROSOFT_CLIENT_SECRET
npx wrangler secret put CALENDLY_CLIENT_ID
npx wrangler secret put CALENDLY_CLIENT_SECRET
```

For local testing, put the same names in `cloud/.dev.vars` instead (use the sandbox Calendly app there).

Secrets take effect straight away; the calendar code itself goes live when the `plans-waitlist-oauth` branch is merged, migrated (`npx wrangler d1 migrations apply penguin --remote`) and deployed (`npx wrangler deploy`).

import { appConnect, appSignOut, appToken, emailStart, emailVerify, googleCallback, googleStart, requireUser, signOut } from "./auth.js";
import { TRIAL_PLAN } from "../../src/core/plans.js";
import { accessOf, checkout, plans, portal, subscriptionOf, webhook } from "./billing.js";
import { availableProviders, connectCallback, connectStart, connectToken, refreshToken } from "./calendars.js";
import { answer, draft, recap } from "./claude.js";
import { HttpError, type Env } from "./env.js";
import { json } from "./http.js";
import { issueLicense } from "./license.js";
import { downloadMac, installedApp, latestRelease, releaseRoute } from "./release.js";
import { supportChat, supportMessage } from "./support.js";
import { invite, joinWaitlist, listWaitlist, waitlistMode } from "./waitlist.js";

type Handler = (env: Env, req: Request, url: URL) => Promise<Response>;

const authed = (fn: (env: Env, req: Request, user: Awaited<ReturnType<typeof requireUser>>) => Promise<Response>): Handler =>
  async (env, req) => fn(env, req, await requireUser(env, req));

const routes: Record<string, Handler> = {
  "POST /auth/email": (env, req) => emailStart(env, req),
  "GET /auth/email/verify": (env, _req, url) => emailVerify(env, url),
  "GET /auth/google": (env, _req, url) => googleStart(env, url),
  "GET /auth/google/callback": (env, req, url) => googleCallback(env, req, url),
  "POST /auth/signout": (env, req) => signOut(env, req),

  "GET /app/connect": (env, req, url) => appConnect(env, req, url),
  "POST /api/app/token": (env, req) => appToken(env, req),
  "POST /api/app/signout": (env, req) => appSignOut(env, req),

  "GET /api/release": (env) => releaseRoute(env),
  "GET /download/mac": (env) => downloadMac(env),
  "GET /api/plans": async (env) => json({
    signups: waitlistMode(env) ? "waitlist" : "open", trialDays: Number(env.TRIAL_DAYS), trialPlan: TRIAL_PLAN, plans: await plans(env),
  }, 200, { "cache-control": "public, max-age=300" }),
  "GET /api/me": authed(async (env, _req, user) => {
    const sub = await subscriptionOf(env, user.id);
    const access = accessOf(sub, user.trial_ends_at);
    return json({
      email: user.email, name: user.name, subscription: sub, trial_ends_at: user.trial_ends_at, plan: access.plan, status: access.status,
      // Every account can use the app now (Free included); kept for app builds from before plans.
      entitled: true,
      app: await installedApp(env, user.id), release: await latestRelease(env).then(({ version, available }) => ({ version, available })),
    });
  }),
  "POST /api/billing/checkout": authed((env, req, user) => checkout(env, req, user)),
  "POST /api/billing/portal": authed((env, _req, user) => portal(env, user)),
  "GET /api/license": authed((env, _req, user) => issueLicense(env, user)),
  "POST /api/draft": authed((env, req, user) => draft(env, req, user)),
  "POST /api/answer": authed((env, req, user) => answer(env, req, user)),
  "POST /api/recap": authed((env, req, user) => recap(env, req, user)),

  "GET /calendar/connect": (env, _req, url) => connectStart(env, url),
  "GET /calendar/callback": (env, req, url) => connectCallback(env, req, url),
  "GET /api/calendar/providers": async (env) => json({ providers: availableProviders(env) }),
  "POST /api/calendar/token": authed((env, req, user) => connectToken(env, req, user)),
  "POST /api/calendar/refresh": authed((env, req, user) => refreshToken(env, req, user)),

  "POST /api/waitlist": (env, req) => joinWaitlist(env, req),
  "GET /api/admin/waitlist": (env, req) => listWaitlist(env, req),
  "POST /api/admin/invite": (env, req) => invite(env, req),

  "POST /api/support/chat": (env, req) => supportChat(env, req),
  "POST /api/support/message": (env, req) => supportMessage(env, req),

  "POST /webhooks/paystack": (env, req) => webhook(env, req),
};

/** Cookie-authenticated writes must be JSON, which a cross-site form can't send. */
function csrfOk(req: Request, path: string): boolean {
  if (req.method !== "POST" || path.startsWith("/webhooks/") || req.headers.get("authorization")) return true;
  return (req.headers.get("content-type") ?? "").startsWith("application/json");
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.hostname === "peguin.co") return Response.redirect(`https://www.peguin.co${url.pathname}${url.search}`, 301);
    const route = routes[`${req.method} ${url.pathname}`];
    if (!route) {
      if (/^\/(api|auth|app|webhooks|download|calendar)\//.test(url.pathname)) return json({ error: "Not found." }, 404);
      return env.ASSETS.fetch(req);
    }
    try {
      if (!csrfOk(req, url.pathname)) throw new HttpError(415, "Send JSON.");
      return await route(env, req, url);
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message }, e.status);
      console.error(e);
      return json({ error: "Something went wrong on our side. Try again." }, 500);
    }
  },
} satisfies ExportedHandler<Env>;

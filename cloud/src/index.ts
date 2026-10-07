import { appConnect, appSignOut, appToken, emailStart, emailVerify, googleCallback, googleStart, requireUser, signOut } from "./auth.js";
import { checkout, currentPlan, isEntitled, portal, subscriptionOf, webhook } from "./billing.js";
import { answer, draft } from "./claude.js";
import { HttpError, type Env } from "./env.js";
import { json } from "./http.js";
import { issueLicense } from "./license.js";
import { downloadMac, installedApp, latestRelease, releaseRoute } from "./release.js";
import { supportChat, supportMessage } from "./support.js";

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

  "GET /api/release": async (env) => releaseRoute(env),
  "GET /download/mac": async (env) => downloadMac(env),
  "GET /api/plan": async (env) => json({ ...(await currentPlan(env)), trialDays: Number(env.TRIAL_DAYS) }, 200, { "cache-control": "public, max-age=300" }),
  "GET /api/me": authed(async (env, _req, user) => {
    const sub = await subscriptionOf(env, user.id);
    return json({
      email: user.email, name: user.name, subscription: sub, trial_ends_at: user.trial_ends_at, entitled: isEntitled(sub, user.trial_ends_at),
      app: await installedApp(env, user.id), release: latestRelease(env),
    });
  }),
  "POST /api/billing/checkout": authed((env, _req, user) => checkout(env, user)),
  "POST /api/billing/portal": authed((env, _req, user) => portal(env, user)),
  "GET /api/license": authed((env, _req, user) => issueLicense(env, user)),
  "POST /api/draft": authed((env, req, user) => draft(env, req, user)),
  "POST /api/answer": authed((env, req, user) => answer(env, req, user)),

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
      if (/^\/(api|auth|app|webhooks|download)\//.test(url.pathname)) return json({ error: "Not found." }, 404);
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

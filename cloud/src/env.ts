export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  APP_ORIGIN: string;
  CLAUDE_MODEL: string;
  TRIAL_DAYS: string;
  ANTHROPIC_API_KEY?: string;
  PAYSTACK_SECRET_KEY?: string;
  /** The single plan from before tiers; treated as Pro when PAYSTACK_PLANS doesn't name one. */
  PAYSTACK_PLAN_CODE?: string;
  /** JSON {"basic":"PLN_…","pro":"PLN_…","team":"PLN_…"}: the Paystack plan behind each paid plan. */
  PAYSTACK_PLANS?: string;
  /** "open" (anyone can sign up) or "waitlist" (new accounts need an invite). */
  SIGNUPS?: string;
  /** Bearer token for /api/admin/* (inviting people from the waitlist). */
  ADMIN_TOKEN?: string;
  MICROSOFT_CLIENT_ID?: string;
  MICROSOFT_CLIENT_SECRET?: string;
  CALENDLY_CLIENT_ID?: string;
  CALENDLY_CLIENT_SECRET?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
  LICENSE_PRIVATE_JWK?: string;
  /** Where help-chat messages are emailed. Without it they are only stored in D1. */
  SUPPORT_INBOX?: string;
  /** GitHub "owner/repo" whose releases carry the .dmg. */
  RELEASES_REPO?: string;
  /** Fallback when there's no GitHub release: latest version, e.g. "0.2.0", and where its .dmg downloads from. */
  APP_LATEST_VERSION?: string;
  APP_DOWNLOAD_URL?: string;
}

/** A secret the current route can't work without. */
export function need(env: Env, key: keyof Env): string {
  const v = env[key];
  if (typeof v !== "string" || !v) throw new HttpError(503, `${key} isn't configured on the server yet.`);
  return v;
}

export class HttpError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

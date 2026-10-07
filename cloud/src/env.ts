export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  APP_ORIGIN: string;
  CLAUDE_MODEL: string;
  TRIAL_DAYS: string;
  DRAFTS_PER_DAY: string;
  ANSWERS_PER_DAY: string;
  ANTHROPIC_API_KEY?: string;
  PAYSTACK_SECRET_KEY?: string;
  PAYSTACK_PLAN_CODE?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
  LICENSE_PRIVATE_JWK?: string;
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

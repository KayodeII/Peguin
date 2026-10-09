// Server-side Claude for subscribers: drafts the update and answers live
// questions from the facts, with the same prompts as the desktop CLI path.
import Anthropic from "@anthropic-ai/sdk";
import { answerContext, answerSystem, draftSystem, draftUser, parseDraft, parseRecap, recapSystem, recapUser, type PromptActivity } from "../../src/core/brain/prompts.js";
import type { User } from "./auth.js";
import { PLANS } from "../../src/core/plans.js";
import { accessOf, subscriptionOf } from "./billing.js";
import { HttpError, need, type Env } from "./env.js";
import { body, json } from "./http.js";

type Kind = "draft" | "answer" | "recap";

const NOUN: Record<Kind, string> = { draft: "drafts", answer: "follow-up answers", recap: "recaps" };

/**
 * Per-user daily cap from the user's plan (and never above the server-wide cap),
 * so a stuck client can't run up the bill. A plan without the feature gets 402.
 */
async function countUse(env: Env, user: User, kind: Kind) {
  const { plan } = accessOf(await subscriptionOf(env, user.id), user.trial_ends_at);
  const ceiling = Number({ draft: env.DRAFTS_PER_DAY, answer: env.ANSWERS_PER_DAY, recap: env.RECAPS_PER_DAY }[kind]);
  const limit = Math.min(PLANS[plan].features.perDay[kind], ceiling);
  if (limit <= 0) throw new HttpError(402, `${NOUN[kind][0]!.toUpperCase()}${NOUN[kind].slice(1)} aren't included in the ${PLANS[plan].name} plan. Upgrade at /account.`);
  const day = new Date().toISOString().slice(0, 10);
  const row = await env.DB.prepare(
    `INSERT INTO usage (user_id, day, kind, count) VALUES (?, ?, ?, 1)
     ON CONFLICT(user_id, day, kind) DO UPDATE SET count = count + 1 RETURNING count`,
  ).bind(user.id, day, kind).first<{ count: number }>();
  if ((row?.count ?? 0) > limit) throw new HttpError(429, `Daily limit reached (${limit} ${NOUN[kind]}). It resets at midnight UTC.`);
}

export type Turn = { role: "user" | "assistant"; content: string };

/** Anthropic refused for an account reason (no credit, bad key, rate limit) or is down: the app should use its own Claude instead. */
const unavailable = (e: unknown) => e instanceof Anthropic.APIError && (e.status === undefined || [400, 401, 403, 429, 500, 529].includes(e.status));

export async function ask(env: Env, system: string, user: string | Turn[], effort: "low" | "high", maxTokens = 16000): Promise<string> {
  const client = new Anthropic({ apiKey: need(env, "ANTHROPIC_API_KEY") });
  const res = await client.beta.messages.create({
    model: env.CLAUDE_MODEL,
    max_tokens: maxTokens,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort },
    system,
    messages: typeof user === "string" ? [{ role: "user", content: user }] : user,
  }).catch((e: unknown) => {
    if (!unavailable(e)) throw e;
    console.error("Anthropic unavailable", e instanceof Error ? e.message : e);
    throw new HttpError(503, "Peguin's server-side AI is unavailable right now.");
  });
  if (res.stop_reason === "refusal") throw new HttpError(422, "Claude declined this request.");
  return res.content.map((b) => (b.type === "text" ? b.text : "")).join("").trim();
}

export async function draft(env: Env, req: Request, user: User): Promise<Response> {
  const { name, activity, failed, cues } = await body<{ name?: string; activity?: PromptActivity[]; failed?: string[]; cues?: boolean }>(req);
  if (!name || !Array.isArray(activity)) throw new HttpError(400, "Send name and activity.");
  await countUse(env, user, "draft");
  const text = await ask(env, draftSystem(name, { cues: cues === true }), draftUser(name, activity.slice(0, 300), "", failed ?? []), "high");
  return json(parseDraft(text));
}

export async function answer(env: Env, req: Request, user: User): Promise<Response> {
  const b = await body<{ name?: string; facts?: string[]; script?: string; recent?: string[]; question?: string; cues?: boolean }>(req);
  if (!b.name || !b.question) throw new HttpError(400, "Send name and question.");
  await countUse(env, user, "answer");
  // Live in a meeting: low effort keeps the reply quick.
  const text = await ask(env, answerSystem(b.name, { cues: b.cues === true }), answerContext(b.facts ?? [], b.script, (b.recent ?? []).slice(-12), b.question), "low");
  return json({ text });
}

/** A private recap of a meeting Peguin attended, from its transcript only. */
export async function recap(env: Env, req: Request, user: User): Promise<Response> {
  const b = await body<{ name?: string; lines?: string[] }>(req);
  if (!b.name || !Array.isArray(b.lines)) throw new HttpError(400, "Send name and lines.");
  await countUse(env, user, "recap");
  const lines = b.lines.slice(-400).map((l) => String(l).slice(0, 500));
  return json(parseRecap(await ask(env, recapSystem(b.name), recapUser(lines), "low")));
}

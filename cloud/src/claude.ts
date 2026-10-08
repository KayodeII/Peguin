// Server-side Claude for subscribers: drafts the update and answers live
// questions from the facts, with the same prompts as the desktop CLI path.
import Anthropic from "@anthropic-ai/sdk";
import { answerContext, answerSystem, draftSystem, draftUser, parseDraft, parseRecap, recapSystem, recapUser, type PromptActivity } from "../../src/core/brain/prompts.js";
import type { User } from "./auth.js";
import { isEntitled, subscriptionOf } from "./billing.js";
import { HttpError, need, type Env } from "./env.js";
import { body, json } from "./http.js";

type Kind = "draft" | "answer" | "recap";

async function entitled(env: Env, user: User) {
  if (!isEntitled(await subscriptionOf(env, user.id), user.trial_ends_at)) throw new HttpError(402, "Your trial has ended and there's no active plan.");
}

/** Per-user daily cap, so a stuck client can't run up the bill. */
async function countUse(env: Env, user: User, kind: Kind) {
  const limit = Number({ draft: env.DRAFTS_PER_DAY, answer: env.ANSWERS_PER_DAY, recap: env.RECAPS_PER_DAY }[kind]);
  const day = new Date().toISOString().slice(0, 10);
  const row = await env.DB.prepare(
    `INSERT INTO usage (user_id, day, kind, count) VALUES (?, ?, ?, 1)
     ON CONFLICT(user_id, day, kind) DO UPDATE SET count = count + 1 RETURNING count`,
  ).bind(user.id, day, kind).first<{ count: number }>();
  if ((row?.count ?? 0) > limit) throw new HttpError(429, `Daily limit reached (${limit} ${kind}s). It resets at midnight UTC.`);
}

export type Turn = { role: "user" | "assistant"; content: string };

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
  });
  if (res.stop_reason === "refusal") throw new HttpError(422, "Claude declined this request.");
  return res.content.map((b) => (b.type === "text" ? b.text : "")).join("").trim();
}

export async function draft(env: Env, req: Request, user: User): Promise<Response> {
  await entitled(env, user);
  const { name, activity, failed } = await body<{ name?: string; activity?: PromptActivity[]; failed?: string[] }>(req);
  if (!name || !Array.isArray(activity)) throw new HttpError(400, "Send name and activity.");
  await countUse(env, user, "draft");
  const text = await ask(env, draftSystem(name), draftUser(name, activity.slice(0, 300), "", failed ?? []), "high");
  return json(parseDraft(text));
}

export async function answer(env: Env, req: Request, user: User): Promise<Response> {
  await entitled(env, user);
  const b = await body<{ name?: string; facts?: string[]; script?: string; recent?: string[]; question?: string }>(req);
  if (!b.name || !b.question) throw new HttpError(400, "Send name and question.");
  await countUse(env, user, "answer");
  // Live in a meeting: low effort keeps the reply quick.
  const text = await ask(env, answerSystem(b.name), answerContext(b.facts ?? [], b.script, (b.recent ?? []).slice(-12), b.question), "low");
  return json({ text });
}

/** A private recap of a meeting Peguin attended, from its transcript only. */
export async function recap(env: Env, req: Request, user: User): Promise<Response> {
  await entitled(env, user);
  const b = await body<{ name?: string; lines?: string[] }>(req);
  if (!b.name || !Array.isArray(b.lines)) throw new HttpError(400, "Send name and lines.");
  await countUse(env, user, "recap");
  const lines = b.lines.slice(-400).map((l) => String(l).slice(0, 500));
  return json(parseRecap(await ask(env, recapSystem(b.name), recapUser(lines), "low")));
}

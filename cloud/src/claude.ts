// Server-side Claude for subscribers: drafts the update and answers live
// questions from the facts, with the same prompts as the desktop CLI path.
import Anthropic from "@anthropic-ai/sdk";
import { answerContext, answerSystem, copilotSystem, draftSystem, draftUser, parseDraft, parseRecap, recapSystem, recapUser, type PromptActivity } from "../../src/core/brain/prompts.js";
import type { User } from "./auth.js";
import { PLANS } from "../../src/core/plans.js";
import { accessOf, subscriptionOf } from "./billing.js";
import { HttpError, need, type Env } from "./env.js";
import { body, json } from "./http.js";

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

/**
 * The app's drafts, answers, copilot suggestions and recaps run on each user's own
 * AI (their Claude Code or Codex sign-in, or their xAI key), never on Peguin's key.
 * Apps before 0.7 still call these routes when signed in; a 503 is what makes them
 * fall back to the user's own Claude Code sign-in.
 */
export const ownAiOnly = (): Response => new Response(
  JSON.stringify({ error: "Peguin uses your own AI now (Settings, AI). Update the app; until then it uses your Claude Code sign-in." }),
  { status: 503, headers: { "content-type": "application/json" } },
);

import Anthropic from "@anthropic-ai/sdk";
import { config, requireKey } from "../config.js";
import type { StandupDraft, User, Utterance } from "../repo.js";
import type { ActivityItem } from "../sources/types.js";
import { answerContext, answerSystem, draftSystem, draftUser, parseDraft } from "./prompts.js";

let client: Anthropic | undefined;
const ai = () => (client ??= new Anthropic({ apiKey: requireKey("ANTHROPIC_API_KEY") }));

async function complete(system: string, user: string, maxTokens: number): Promise<string> {
  const msg = await ai().messages.create({
    model: config.CLAUDE_MODEL,
    max_tokens: maxTokens,
    system,
    messages: [{ role: "user", content: user }],
  });
  return msg.content.map((b) => (b.type === "text" ? b.text : "")).join("").trim();
}

const firstName = (u: User) => u.name.split(/\s+/)[0] ?? u.name;

/** Peguin always says who it is. This is not optional: it keeps teammates
 *  informed and covers the user if the update is wrong. */
export const disclosure = (u: User) => `Hi, this is Peguin, ${firstName(u)}'s AI assistant, giving ${firstName(u)}'s update.`;

export async function draftStandup(u: User, activity: ActivityItem[], failedSources: string[]): Promise<StandupDraft> {
  const text = await complete(draftSystem(u.name), draftUser(u.name, activity, u.standing_notes ?? "", failedSources), 900);
  return { ...parseDraft(text), generated_at: new Date().toISOString() };
}

/** Short, spoken answer to a follow-up question, grounded in the draft. */
export async function answerFollowUp(u: User, draft: StandupDraft | null, question: string, recent: Utterance[]): Promise<string> {
  const lines = recent.map((r) => `${r.is_bot ? "Peguin" : r.speaker ?? "Someone"}: ${r.text}`);
  return complete(answerSystem(u.name), answerContext(draft?.facts ?? [], draft?.script, lines, question), 200);
}

export async function summarizeMeeting(u: User, transcript: Utterance[]): Promise<string> {
  const system = `Summarise this standup for ${u.name}, who was not there. Slack mrkdwn, under 150 words.
Sections: *Questions for ${firstName(u)}* (anything asked of them that Peguin deferred), *Action items* (for ${firstName(u)} only, with who asked), *Team highlights* (2-4 bullets). Omit empty sections.`;
  const lines = transcript.map((r) => `${r.is_bot ? "Peguin" : r.speaker ?? "Someone"}: ${r.text}`).join("\n");
  return complete(system, lines || "(empty transcript)", 700);
}

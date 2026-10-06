import Anthropic from "@anthropic-ai/sdk";
import { config, requireKey } from "../config.js";
import type { StandupDraft, User, Utterance } from "../repo.js";
import type { ActivityItem } from "../sources/types.js";

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

/** Penguin always says who it is. This is not optional: it keeps teammates
 *  informed and covers the user if the update is wrong. */
export const disclosure = (u: User) => `Hi, this is Penguin, ${firstName(u)}'s AI assistant, giving ${firstName(u)}'s update.`;

export async function draftStandup(u: User, activity: ActivityItem[], failedSources: string[]): Promise<StandupDraft> {
  const system = `You write a spoken daily standup update that an AI assistant will read aloud in a live meeting on behalf of ${u.name}.
Rules:
- Spoken English in the third person, since the assistant is the one speaking ("${firstName(u)} merged...", "next, they're picking up...").
- 30 to 45 seconds when read aloud (about 80 to 110 words). Structure: what got done, what's next, any blockers.
- Group related items. Say ticket keys only if short; never read URLs, hashes or repo paths aloud.
- Only state things supported by the activity or notes. If something is unclear, leave it out.
- If there's no activity, say so plainly and mention the standing notes.
- No greeting and no sign-off; those are added separately.
Return JSON only: {"script": string, "facts": string[]} where facts are short, specific, grounded bullets (with ticket keys, PR titles, statuses) for answering follow-up questions.`;
  const lines = activity.map((a) => `- [${a.source}/${a.kind}${a.status ? `/${a.status}` : ""}] ${a.title} @ ${a.at}`).join("\n") || "(no activity found)";
  const userMsg = `Activity since the previous workday:\n${lines}\n\nStanding notes from ${firstName(u)}: ${u.standing_notes || "(none)"}\n${failedSources.length ? `Could not reach: ${failedSources.join(", ")}. Don't mention this unless there's nothing else to say.` : ""}`;
  const text = await complete(system, userMsg, 900);
  const json = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
  return { script: String(json.script), facts: (json.facts ?? []).map(String), generated_at: new Date().toISOString() };
}

/** Short, spoken answer to a follow-up question, grounded in the draft. */
export async function answerFollowUp(u: User, draft: StandupDraft | null, question: string, recent: Utterance[]): Promise<string> {
  const system = `You are Penguin, ${u.name}'s AI assistant, speaking live in their standup. Someone just asked a follow-up.
Answer in one or two short spoken sentences using ONLY the facts below. If the facts don't cover it, say you'll pass the question to ${firstName(u)} and they'll follow up. Never invent status, dates or commitments. No URLs.`;
  const ctx = `Facts:\n${(draft?.facts ?? []).map((f) => `- ${f}`).join("\n") || "(none)"}\n\nUpdate already given:\n${draft?.script ?? "(none)"}\n\nRecent conversation:\n${recent.map((r) => `${r.is_bot ? "Penguin" : r.speaker ?? "Someone"}: ${r.text}`).join("\n")}\n\nQuestion: ${question}`;
  return complete(system, ctx, 200);
}

export async function summarizeMeeting(u: User, transcript: Utterance[]): Promise<string> {
  const system = `Summarise this standup for ${u.name}, who was not there. Slack mrkdwn, under 150 words.
Sections: *Questions for ${firstName(u)}* (anything asked of them that Penguin deferred), *Action items* (for ${firstName(u)} only, with who asked), *Team highlights* (2-4 bullets). Omit empty sections.`;
  const lines = transcript.map((r) => `${r.is_bot ? "Penguin" : r.speaker ?? "Someone"}: ${r.text}`).join("\n");
  return complete(system, lines || "(empty transcript)", 700);
}

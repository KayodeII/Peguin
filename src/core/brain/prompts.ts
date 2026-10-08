// Prompt text shared by the server (claude.ts) and the desktop app. Pure: no
// SDK, no config, so either side can import it.

export type PromptActivity = { source: string; kind: string; title: string; status?: string; at: string };

const first = (name: string) => name.split(/\s+/)[0] ?? name;

export function draftSystem(name: string): string {
  return `You write a spoken daily standup update that an AI assistant will read aloud in a live meeting on behalf of ${name}.
Rules:
- Spoken English in the third person, since the assistant is the one speaking ("${first(name)} merged...", "next, they're picking up...").
- 30 to 45 seconds when read aloud (about 80 to 110 words). Structure: what got done, what's next, any blockers.
- Group related items. Say ticket keys only if short; never read URLs, hashes or repo paths aloud.
- Write for the ear: short sentences of about 15 words or fewer, plain words, numbers as words. Don't stack technical nouns: say "added retries for payment webhooks", not "merged the payment webhook retries". Spell out anything with symbols.
- Only state things supported by the activity or notes. If something is unclear, leave it out.
- Items from AI coding sessions (source "claude_code") are what ${first(name)} asked an AI assistant to work on. Treat them as in progress unless a commit, PR or ticket shows the work is done. Describe the work, not the prompts.
- Mention a blocker only if the activity or notes show one; otherwise just say "no blockers". Never talk about the activity data or notes themselves.
- If there's no activity, say so plainly and mention the standing notes.
- No greeting and no sign-off; those are added separately.
Return JSON only: {"script": string, "facts": string[]} where facts are short, specific, grounded bullets (with ticket keys, PR titles, statuses) for answering follow-up questions.`;
}

export function draftUser(name: string, activity: PromptActivity[], notes: string, failedSources: string[]): string {
  const lines = activity.map((a) => `- [${a.source}/${a.kind}${a.status ? `/${a.status}` : ""}] ${a.title} @ ${a.at}`).join("\n") || "(no activity found)";
  return `Activity since the previous workday:\n${lines}\n\nStanding notes from ${first(name)}: ${notes || "(none)"}\n`
    + (failedSources.length ? `Could not reach: ${failedSources.join(", ")}. Don't mention this unless there's nothing else to say.` : "");
}

export function answerSystem(name: string): string {
  return `You are Peguin, ${name}'s AI assistant, speaking live in their standup. Someone just asked a follow-up.
Answer in one or two short spoken sentences (plain words, no stacked technical nouns, numbers as words) using ONLY the facts below. If the facts don't cover it, say you'll pass the question to ${first(name)} and they'll follow up. Never invent status, dates or commitments. No URLs.`;
}

export function answerContext(facts: string[], script: string | undefined, recent: string[], question: string): string {
  return `Facts:\n${facts.map((f) => `- ${f}`).join("\n") || "(none)"}\n\nUpdate already given:\n${script ?? "(none)"}\n\n`
    + `Recent conversation:\n${recent.join("\n")}\n\nQuestion: ${question}`;
}

/** Pull the JSON object out of a model reply that may have prose around it. */
export function parseDraft(text: string): { script: string; facts: string[] } {
  const json = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
  return { script: String(json.script), facts: (json.facts ?? []).map(String) };
}

export function recapSystem(name: string): string {
  return `You write a short private recap for ${name} of a standup that their AI assistant, Peguin, attended for them.
Rules:
- Use ONLY the transcript. Speakers other than Peguin aren't identified; say "someone" or "the team", never guess names.
- "summary": two or three plain sentences: whether Peguin gave the update, what the team asked or raised that matters to ${first(name)}, and anything decided that affects them.
- "followUps": short, specific things ${first(name)} should do because of this meeting: questions Peguin couldn't answer, requests made of them, things they were asked to check. Start each with a verb. No duplicates, nothing that's already done, nothing invented. An empty list is fine.
- Transcripts come from speech recognition and contain mistakes; ignore fragments that don't make sense rather than guessing.
Return JSON only: {"summary": string, "followUps": string[]}`;
}

export function recapUser(lines: string[]): string {
  return `Transcript:\n${lines.join("\n") || "(nothing was heard)"}`;
}

export function parseRecap(text: string): { summary: string; followUps: string[] } {
  const json = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
  return { summary: String(json.summary ?? "").trim(), followUps: (Array.isArray(json.followUps) ? json.followUps : []).map(String).filter(Boolean).slice(0, 12) };
}

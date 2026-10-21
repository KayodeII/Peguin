// The user's own AI, called straight from their browser with their own key:
// Claude (Anthropic SDK), OpenAI or xAI (both OpenAI-style chat APIs). Peguin's
// server is never in the path. Models come from the key's own model list.
import Anthropic from "@anthropic-ai/sdk";

export type Provider = "anthropic" | "openai" | "xai";

export const PROVIDERS: Record<Provider, { name: string; keyHint: string; keyUrl: string; base?: string }> = {
  anthropic: { name: "Claude", keyHint: "sk-ant-…", keyUrl: "https://platform.claude.com/settings/keys" },
  openai: { name: "OpenAI", keyHint: "sk-…", keyUrl: "https://platform.openai.com/api-keys", base: "https://api.openai.com/v1" },
  xai: { name: "Grok", keyHint: "xai-…", keyUrl: "https://console.x.ai", base: "https://api.x.ai/v1" },
};

/** Chat models from a key's model list, best guess first for Claude (pure). Image, audio and embedding models are left out. */
export function chatModels(provider: Provider, ids: string[]): string[] {
  if (provider === "anthropic") {
    const claude = ids.filter((id) => id.startsWith("claude-"));
    return [...claude.filter((id) => id === "claude-opus-5-5"), ...claude.filter((id) => id !== "claude-opus-5-5")];
  }
  const skip = /image|imagine|video|vision|tts|speech|voice|audio|realtime|transcribe|embed|moderation|search|whisper|dall-e|davinci|babbage/i;
  const want = provider === "xai" ? /grok/i : /^(gpt-|o\d|chatgpt)/i;
  return ids.filter((id) => want.test(id) && !skip.test(id)).sort().reverse();
}

const claude = (key: string) => new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true, maxRetries: 1 });

/** Checks the key and lists the chat models it can use. Throws a plain sentence when it can't. */
export async function listModels(provider: Provider, key: string): Promise<string[]> {
  let ids: string[];
  try {
    if (provider === "anthropic") {
      ids = [];
      for await (const m of claude(key).models.list()) ids.push(m.id);
    } else {
      const res = await fetch(`${PROVIDERS[provider].base}/models`, { headers: { authorization: `Bearer ${key}` } });
      if (res.status === 401 || res.status === 403) throw new Error("bad key");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      ids = ((await res.json()) as { data?: { id: string }[] }).data?.map((m) => m.id) ?? [];
    }
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError || (e instanceof Error && e.message === "bad key")) throw new Error(`${PROVIDERS[provider].name} didn't accept that key. Check it and paste it again.`);
    throw new Error(`Couldn't reach ${PROVIDERS[provider].name}: ${e instanceof Error ? e.message : e}`);
  }
  const models = chatModels(provider, ids);
  if (!models.length) throw new Error(`That key works, but it can't use any ${PROVIDERS[provider].name} chat models.`);
  return models;
}

/** Text deltas from OpenAI-style server-sent events. Returns what's left of an unfinished line (pure). */
export function sseDeltas(buffer: string): { deltas: string[]; rest: string } {
  const lines = buffer.split("\n");
  const rest = lines.pop() ?? "";
  const deltas: string[] = [];
  for (const line of lines) {
    const data = line.trim().replace(/^data:\s*/, "");
    if (!line.trim().startsWith("data:") || data === "[DONE]") continue;
    try {
      const d = (JSON.parse(data) as { choices?: { delta?: { content?: string } }[] }).choices?.[0]?.delta?.content;
      if (d) deltas.push(d);
    } catch { /* keep-alive or partial */ }
  }
  return { deltas, rest };
}

/** Models that take the effort setting and server-side refusal fallbacks. */
const modern = (model: string) => /^claude-(opus|sonnet|haiku|fable)-5/.test(model);
const fallbacks = (model: string) => /^claude-(opus-5|fable-5|sonnet-5-5)/.test(model);

export type Ask = { provider: Provider; key: string; model: string; system: string; user: string; signal?: AbortSignal };

/** One reply, streamed as it's written. */
export async function* ask(a: Ask): AsyncGenerator<string> {
  if (a.provider === "anthropic") {
    const params = {
      model: a.model, max_tokens: 2048, system: a.system,
      messages: [{ role: "user" as const, content: a.user }],
      ...(modern(a.model) ? { output_config: { effort: "low" as const } } : {}),
    };
    // On a safety decline, the API retries on a model chosen for that kind of decline, inside the same call.
    const stream = fallbacks(a.model)
      ? claude(a.key).beta.messages.stream({ ...params, betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" }, { signal: a.signal })
      : claude(a.key).messages.stream(params, { signal: a.signal });
    for await (const ev of stream) {
      if (ev.type === "content_block_delta" && ev.delta.type === "text_delta") yield ev.delta.text;
    }
    const final = await stream.finalMessage();
    if (final.stop_reason === "refusal") throw new Error("Claude declined to answer this one.");
    return;
  }
  const res = await fetch(`${PROVIDERS[a.provider].base}/chat/completions`, {
    method: "POST", signal: a.signal,
    headers: { authorization: `Bearer ${a.key}`, "content-type": "application/json" },
    body: JSON.stringify({ model: a.model, stream: true, messages: [{ role: "system", content: a.system }, { role: "user", content: a.user }] }),
  });
  if (!res.ok || !res.body) throw new Error(`${PROVIDERS[a.provider].name} said ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    const { deltas, rest } = sseDeltas(buffer + value);
    buffer = rest;
    yield* deltas;
  }
}

/** Claude only: a second answer after searching the web, and the site it came from. */
export async function checkOnline(a: Ask): Promise<{ answer: string; source?: string }> {
  if (a.provider !== "anthropic") throw new Error("Checking online needs Claude for now.");
  const res = await claude(a.key).messages.create({
    model: a.model, max_tokens: 2048, system: a.system,
    messages: [{ role: "user", content: a.user }],
    tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 3 }],
    ...(modern(a.model) ? { output_config: { effort: "low" as const } } : {}),
  }, { signal: a.signal });
  const reply = res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("").trim();
  const m = reply.match(/\n?\s*Source:\s*(.+)\s*$/i);
  return m ? { answer: reply.slice(0, m.index).trim(), source: m[1]!.trim() } : { answer: reply };
}

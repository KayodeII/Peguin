import { describe, expect, it, vi } from "vitest";
vi.mock("electron", () => ({ app: { getPath: () => "/tmp" }, safeStorage: {} }));
const { chatModels, checkXaiKey, grokChat, grokChatStream, responseText } = await import("../desktop/src/main/xai.js");

const reply = (status: number, body: unknown) => async () => new Response(typeof body === "string" ? body : JSON.stringify(body), { status });

describe("xAI with the owner's own key", () => {
  it("offers only chat models", () => {
    expect(chatModels(["grok-9", "grok-9-mini", "grok-imagine-image", "grok-2-vision", "grok-tts-1", "text-embedding-3"])).toEqual(["grok-9", "grok-9-mini"]);
  });
  it("checks a key by listing its models, and explains a rejected key", async () => {
    expect(await checkXaiKey("k", reply(200, { data: [{ id: "grok-9" }, { id: "grok-imagine-image" }] }) as typeof fetch)).toEqual(["grok-9"]);
    await expect(checkXaiKey("bad", reply(401, "nope") as typeof fetch)).rejects.toThrow("didn't accept that API key");
    await expect(checkXaiKey("k", reply(200, { data: [{ id: "grok-imagine-image" }] }) as typeof fetch)).rejects.toThrow("can't use any Grok chat models");
  });
  it("sends the prompt with the key and model, and returns the reply", async () => {
    const f = vi.fn(reply(200, { choices: [{ message: { content: " From your notes: shipped. " } }] }));
    expect(await grokChat("key-1", "grok-9", "hi", 5000, f as typeof fetch)).toBe("From your notes: shipped.");
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.x.ai/v1/chat/completions");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer key-1");
    expect(JSON.parse(String(init.body))).toMatchObject({ model: "grok-9", messages: [{ role: "user", content: "hi" }] });
  });
  it("reads the answer out of a web-search (Responses API) reply", () => {
    expect(responseText({ output_text: " Node 26. " })).toBe("Node 26.");
    expect(responseText({ output: [{ type: "web_search_call" }, { type: "message", content: [{ type: "output_text", text: "Node " }, { type: "output_text", text: "26." }] }] })).toBe("Node 26.");
    expect(responseText({})).toBe("");
  });
});

describe("Grok streaming", () => {
  const sse = (...events: string[]) => (async (_url: string, init: RequestInit) => {
    expect(JSON.parse(String(init.body))).toMatchObject({ stream: true });
    const enc = new TextEncoder();
    // Split mid-line, as the network does.
    const text = events.map((e) => `data: ${e}\n\n`).join("");
    return new Response(new ReadableStream({ start(c) { c.enqueue(enc.encode(text.slice(0, 25))); c.enqueue(enc.encode(text.slice(25))); c.close(); } }));
  }) as unknown as typeof fetch;
  const all = async (it: AsyncIterable<string>) => { const out: string[] = []; for await (const p of it) out.push(p); return out; };

  it("yields the reply in pieces as they arrive", async () => {
    const piece = (t: string) => JSON.stringify({ choices: [{ delta: { content: t } }] });
    expect(await all(grokChatStream("k", "grok-4", "hi", 1000, sse(piece("Shipped "), piece("the recaps."), "[DONE]")))).toEqual(["Shipped ", "the recaps."]);
  });
  it("says so when the reply is empty", async () => {
    await expect(all(grokChatStream("k", "grok-4", "hi", 1000, sse("[DONE]")))).rejects.toThrow(/empty reply/);
  });
});

import { describe, expect, it } from "vitest";
import { bySentence, parseLine } from "../desktop/src/main/claude.js";

const all = async (it: AsyncIterable<string>) => { const out: string[] = []; for await (const p of it) out.push(p); return out; };
async function* pieces(...p: string[]) { for (const x of p) yield x; }

describe("streamed answers", () => {
  it("reads text, the end, and failures from the CLI's stream-json", () => {
    const delta = (text: string) => JSON.stringify({ type: "stream_event", event: { type: "content_block_delta", index: 0, delta: { type: "text_delta", text } } });
    expect(parseLine(delta("Shipped"))).toEqual({ text: "Shipped" });
    expect(parseLine(JSON.stringify({ type: "result", subtype: "success", is_error: false, result: "Shipped" }))).toEqual({ done: true });
    expect(parseLine(JSON.stringify({ type: "result", subtype: "success", is_error: true, result: "Not logged in" }))).toEqual({ done: true, error: "Not logged in" });
    expect(parseLine(JSON.stringify({ type: "system", subtype: "init" }))).toBeNull();
    expect(parseLine("not json")).toBeNull();
  });

  it("hands over each sentence once the next one starts, then the rest", async () => {
    expect(await all(bySentence(pieces("Mujeeb shipped the rec", "aps. Next, v0.", "8.1 goes out", "! Any questions?")))).toEqual(
      ["Mujeeb shipped the recaps.", "Next, v0.8.1 goes out!", "Any questions?"]);
  });

  it("keeps a sentence whole until it's clearly over", async () => {
    // "v0." followed by a digit, and an end mark with nothing after it yet, aren't ends.
    expect(await all(bySentence(pieces("It's in v0.", "8 now.")))).toEqual(["It's in v0.8 now."]);
    expect(await all(bySentence(pieces("[warmly] Done. ", "\"Quoted.\" ", "Last")))).toEqual(["[warmly] Done.", "\"Quoted.\"", "Last"]);
  });
});

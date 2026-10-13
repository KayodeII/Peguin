import { describe, expect, it } from "vitest";
import { vocabulary, whisperPrompt } from "../desktop/src/main/speech/hints.js";

describe("speech recognition hints", () => {
  const facts = [
    "Merged PR 'Release endpoint: serve the last good release when GitHub fails' (Oct 9)",
    "Billing switched from Stripe to Paystack; D1 migration 0005 applied",
    "The Copilot uses whisper.cpp and Node.js on the Mac",
    "Merged 'Desktop: Meet joins again; Leave button in the copilot' (Oct 10)",
  ];
  it("picks names and jargon from the facts, not everyday words", () => {
    const v = vocabulary(facts);
    expect(v).toEqual(expect.arrayContaining(["GitHub", "Stripe", "Paystack", "D1", "Copilot", "Node.js"]));
    expect(v).not.toEqual(expect.arrayContaining(["Merged", "Oct", "the", "when"]));
    // Capitalised only because they start a sentence, clause or quoted title: priming them makes whisper hear them.
    for (const w of ["Desktop", "Meet", "Leave", "Billing", "Release"]) expect(v).not.toContain(w);
  });
  it("caps the list", () => {
    expect(vocabulary(Array.from({ length: 50 }, (_, i) => `Term${i}`), 10)).toHaveLength(10);
  });
  it("keeps the prompt neutral, with names, Peguin and vocabulary", () => {
    expect(whisperPrompt(["Mujeeb"])).toBe("A meeting with Mujeeb. Peguin.");
    expect(whisperPrompt(["Mujeeb", "Mujib"], ["Paystack", "Peguin", "D1"])).toBe("A meeting with Mujeeb, Mujib. Peguin, Paystack, D1.");
  });
});

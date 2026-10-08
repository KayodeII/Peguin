import { describe, expect, it } from "vitest";
import { deferredFollowUps, expired, headline, MeetingLog, mergeFollowUps, transcriptLines, worthKeeping } from "../desktop/src/main/meeting/record.js";
import { parseRecap, recapSystem, recapUser } from "../src/core/brain/prompts.js";

const meeting = () => {
  const log = new MeetingLog({ url: "https://meet.google.com/abc-defg-hij", platform: "google_meet", joinedAs: "Mujeeb Adebowale (AI)", now: 0 });
  log.joined(1000);
  log.heard("Morning all. Mujeeb, you're up.", 2000);
  log.said("update", "Hi everyone, I'm Peguin, Mujeeb's AI assistant.", 2100);
  log.heard("Is the auth migration landing this week?", 9000);
  log.asked("Is the auth migration landing this week?", 9000).answered("It's in progress, no date yet.", 9500);
  log.heard("Can Mujeeb review my PR today?", 12000);
  log.asked("Can Mujeeb review my PR today?", 12000).deferred("I'll get Mujeeb to follow up.", 12500);
  return log;
};

describe("meeting record", () => {
  it("records what was heard, what Peguin said and how each question went", () => {
    const r = meeting().end(60000);
    expect(r.updateGiven).toBe(true);
    expect(r.questions.map((q) => q.outcome)).toEqual(["answered", "deferred"]);
    expect(r.entries.filter((e) => e.who === "peguin").map((e) => (e.who === "peguin" ? e.kind : ""))).toEqual(["update", "answer", "defer"]);
    expect(worthKeeping(r)).toBe(true);
  });

  it("treats a question still pending when the call ended as one to follow up", () => {
    const log = meeting();
    log.asked("What about the invoices?", 50000);
    expect(log.end(51000).questions.at(-1)?.outcome).toBe("deferred");
  });

  it("lists every deferred question as a follow-up, without needing a model", () => {
    expect(deferredFollowUps(meeting().end())).toEqual(['Answer: "Can Mujeeb review my PR today?"']);
  });

  it("keeps every deferred question, using Claude's wording when it describes the same task", () => {
    const deferred = ['Answer: "Can Mujeeb review my refunds PR before Friday?"', 'Answer: "When does the staging cut happen?"'];
    expect(mergeFollowUps(deferred, ["Review the refunds PR before Friday, or tell its author if you can't", "review refunds PR friday", "Send Sarah the staging link"]))
      .toEqual(["Review the refunds PR before Friday, or tell its author if you can't", 'Answer: "When does the staging cut happen?"', "Send Sarah the staging link"]);
  });
  it("never loses a deferred question when Claude returns nothing", () => {
    expect(mergeFollowUps(['Answer: "Can Mujeeb review my PR today?"'], [])).toEqual(['Answer: "Can Mujeeb review my PR today?"']);
  });

  it("sums a meeting up in one line", () => {
    expect(headline(meeting().end())).toBe("Gave your update, answered 1, 1 to follow up");
    const missed = new MeetingLog({ url: "u", platform: "zoom", joinedAs: "x" }).end();
    expect(headline(missed)).toBe("Didn't get into the call");
    expect(worthKeeping(missed)).toBe(false);
  });

  it("writes transcript lines without guessing who spoke", () => {
    expect(transcriptLines(meeting().end())[0]).toBe("Someone: Morning all. Mujeeb, you're up.");
    expect(transcriptLines(meeting().end())[1]).toMatch(/^Peguin \(update\): /);
  });

  it("expires meetings after the owner's retention period", () => {
    const day = 86_400_000;
    expect(expired({ startedAt: 0 }, 30, 29 * day)).toBe(false);
    expect(expired({ startedAt: 0 }, 30, 31 * day)).toBe(true);
  });
});

describe("recap prompt", () => {
  it("keeps Claude to the transcript and never names speakers", () => {
    const s = recapSystem("Mujeeb Adebowale");
    expect(s).toContain("ONLY the transcript");
    expect(s).toContain("never guess names");
    expect(recapUser([])).toContain("(nothing was heard)");
  });
  it("parses the reply, tolerating prose around the JSON", () => {
    expect(parseRecap('Sure: {"summary": "Peguin gave the update.", "followUps": ["Review the PR", ""]} done'))
      .toEqual({ summary: "Peguin gave the update.", followUps: ["Review the PR"] });
  });
});

import { describe, expect, it } from "vitest";
import { addressesUser, isHandoff, isQuestion, mentionsName, TurnDetector } from "../src/realtime/turn.js";

const names = ["Mujeeb Adebowale", "Mujeeb", "MJ"];

describe("mentionsName", () => {
  it("matches exact and case-insensitive names", () => {
    expect(mentionsName("Okay Mujeeb, go", names)).toBe(true);
    expect(mentionsName("mj you're up", names)).toBe(true);
  });
  it("tolerates speech-to-text misspellings and splits", () => {
    expect(mentionsName("Mujib, your turn", names)).toBe(true);
    expect(mentionsName("Moo jeeb what do you have", names)).toBe(true);
    expect(mentionsName("Mujeebs update", names)).toBe(true);
  });
  it("does not fire on unrelated words", () => {
    expect(mentionsName("Let's move on to Sarah", names)).toBe(false);
    expect(mentionsName("the deployment is done", names)).toBe(false);
  });
});

describe("isHandoff", () => {
  it("short direct address is a handoff", () => {
    expect(isHandoff("Mujeeb?", names)).toBe(true);
    expect(isHandoff("Mujeeb, go.", names)).toBe(true);
  });
  it("handoff phrases with the name", () => {
    expect(isHandoff("Alright thanks Tolu, Mujeeb you're up next", names)).toBe(true);
    expect(isHandoff("What about Mujeeb, anything from him today", names)).toBe(true);
  });
  it("talking about the user is not a handoff", () => {
    expect(isHandoff("I paired with Mujeeb yesterday on the card issuing refactor", names)).toBe(false);
  });
});

describe("isQuestion", () => {
  it("detects questions with or without punctuation", () => {
    expect(isQuestion("is the PR merged?")).toBe(true);
    expect(isQuestion("when will the migration land")).toBe(true);
    expect(isQuestion("cool thanks")).toBe(false);
  });
});

describe("TurnDetector", () => {
  it("gives the update once when handed the floor, then answers follow-ups", () => {
    const t = new TurnDetector({ names });
    expect(t.onUtterance("Morning everyone, let's start with Tolu", 0).action).toBe("none");
    expect(t.onUtterance("Thanks Tolu. Mujeeb, you're up", 1000).action).toBe("give_update");
    t.setSpeaking(true, 1100);
    expect(t.onUtterance("Mujeeb, you're up", 2000).action).toBe("none"); // ignored while speaking
    t.setSpeaking(false, 30000);
    t.markUpdateGiven();
    expect(t.onUtterance("is the dispute webhook PR merged?", 30500).action).toBe("none"); // echo tail
    const d = t.onUtterance("is the dispute webhook PR merged?", 33000);
    expect(d).toEqual({ action: "answer", question: "is the dispute webhook PR merged?" });
  });

  it("does not treat the floor moving on as a follow-up", () => {
    const t = new TurnDetector({ names });
    t.markUpdateGiven();
    t.setSpeaking(false, 0);
    expect(t.onUtterance("Thanks. Sarah, what about you?", 3000).action).toBe("none");
  });

  it("only answers unnamed questions inside the follow-up window", () => {
    const t = new TurnDetector({ names, followUpWindowMs: 10000 });
    t.markUpdateGiven();
    t.setSpeaking(false, 0);
    expect(t.onUtterance("what's the ETA on the Lagos rail work?", 60000).action).toBe("none");
    expect(t.onUtterance("Mujeeb, what's the ETA on the Lagos rail work?", 61000).action).toBe("answer");
  });

  it("caps unnamed follow-ups", () => {
    const t = new TurnDetector({ names, maxFollowUps: 1 });
    t.markUpdateGiven();
    t.setSpeaking(false, 0);
    expect(t.onUtterance("is it deployed?", 5000).action).toBe("answer");
    t.setSpeaking(true, 5000); t.setSpeaking(false, 8000);
    expect(t.onUtterance("and the tests?", 10000).action).toBe("none");
  });

  it("always answers questions that name the user, however many came before", () => {
    const t = new TurnDetector({ names, maxFollowUps: 1 });
    t.markUpdateGiven();
    t.setSpeaking(false, 0);
    for (let i = 1; i <= 5; i++) {
      const now = i * 30000;
      expect(t.onUtterance(`Mujeeb, question number ${i}?`, now).action).toBe("answer");
      t.setSpeaking(true, now); t.setSpeaking(false, now + 3000);
    }
  });

  it("responds every time it's called by name after the update (real call transcript)", () => {
    const t = new TurnDetector({ names });
    t.markUpdateGiven();
    t.setSpeaking(false, 0);
    let now = 0;
    const say = (text: string) => {
      now += 10000;
      const d = t.onUtterance(text, now);
      if (d.action !== "none") { t.setSpeaking(true, now); now += 3000; t.setSpeaking(false, now); }
      return d.action;
    };
    expect(say("Okay, so Mujeeb, what's the status of the database migration?")).toBe("answer");
    expect(say("Okay, so by Kainte, Mujeeb, this is an improvement.")).toBe("none");
    expect(say("Hey Mujeeb.")).toBe("acknowledge");
    expect(say("Hey Mujeeb.")).toBe("acknowledge");
    expect(say("Hey Mujeeb, I'm starting question.")).toBe("acknowledge");
    expect(say("Mujib, Mujib, Mujib.")).toBe("acknowledge");
    expect(say("Hey Mujeeb, can you explain the migration.")).toBe("answer");
    expect(say("Mujeeb, you're up again")).toBe("give_update");
  });

  it("after an acknowledgement, the next unnamed question comes to Peguin", () => {
    const t = new TurnDetector({ names });
    t.markUpdateGiven();
    t.setSpeaking(false, 0);
    expect(t.onUtterance("Hey Mujeeb.", 60000).action).toBe("acknowledge");
    t.setSpeaking(true, 60000); t.setSpeaking(false, 62000);
    expect(t.onUtterance("what's blocking the release?", 66000).action).toBe("answer");
  });

  it("named statements late in the call are not questions", () => {
    const t = new TurnDetector({ names });
    t.markUpdateGiven();
    t.setSpeaking(false, 0);
    expect(t.onUtterance("Mujeeb did a great job on the release", 120000).action).toBe("none");
  });
});

describe("false positives", () => {
  it("being talked about or thanked is not being called", () => {
    for (const s of ["Mujeeb did a great job on the release", "Thanks Mujeeb.", "Thank you, Mujeeb.",
      "Okay, so by Kainte, Mujeeb, this is an improvement.", "I paired with Mujeeb on that yesterday."])
      expect(addressesUser(s, names), s).toBe(false);
    for (const s of ["Hey Mujeeb.", "Mujeeb, quick one", "Mujib, Mujib, Mujib.", "Okay Mujeeb, hold on", "Mujeeb"])
      expect(addressesUser(s, names), s).toBe(true);
  });

  it("thanks after the update doesn't repeat it", () => {
    const t = new TurnDetector({ names });
    t.markUpdateGiven();
    t.setSpeaking(false, 0);
    expect(t.onUtterance("Thanks Mujeeb, over to Sarah", 30000).action).toBe("none");
  });

  it("common words are not mistaken for the name", () => {
    for (const s of ["we need to merge this", "the music was loud", "my job is done", "I'm on the jib crane ticket", "move it to QA"])
      expect(mentionsName(s, names), s).toBe(false);
  });
});

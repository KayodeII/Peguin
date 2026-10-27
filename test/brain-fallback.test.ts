import { describe, expect, it, beforeEach, vi } from "vitest";

vi.mock("electron", () => ({ app: { getPath: () => "/tmp/peguin-test", isPackaged: false }, safeStorage: { isEncryptionAvailable: () => false } }));

const {
  aiCandidates,
  clearAiExhaustion,
  interpretCodexError,
  isFallbackAiError,
  isQuotaError,
  outOfQuotaMessage,
  parseResetAt,
} = await import("../desktop/src/main/brain.js");

describe("AI session-limit fallback", () => {
  beforeEach(() => clearAiExhaustion());

  it("detects Claude session limit and similar quota errors", () => {
    expect(isQuotaError("Claude CLI failed: You've hit your session limit · resets 9pm (Africa/Lagos)")).toBe(true);
    expect(isQuotaError("rate limit exceeded")).toBe(true);
    expect(isQuotaError("HTTP 429")).toBe(true);
    expect(isQuotaError("Couldn't run the Claude CLI: spawn ENOENT")).toBe(false);
  });

  it("parses reset time from Claude's message", () => {
    const now = new Date("2026-10-27T19:40:00");
    const at = parseResetAt("You've hit your session limit · resets 9pm (Africa/Lagos)", now);
    expect(at).not.toBeNull();
    const d = new Date(at!);
    expect(d.getHours()).toBe(21);
    expect(d.getDate()).toBe(27);
  });

  it("orders candidates: preferred first, then others that are available", () => {
    expect(aiCandidates("claude", ["claude", "codex", "grok"])).toEqual(["claude", "codex", "grok"]);
    expect(aiCandidates("codex", ["claude", "codex"])).toEqual(["codex", "claude"]);
    expect(aiCandidates("grok", ["grok"])).toEqual(["grok"]);
  });

  it("writes a short out-of-uses line for the cursor caption", () => {
    const one = outOfQuotaMessage(["claude"], new Error("session limit · resets 9pm (Africa/Lagos)"));
    expect(one).toMatch(/out of uses/i);
    expect(one).toMatch(/Resets 9pm/);
    expect(one).toMatch(/Codex or Grok/);
    const all = outOfQuotaMessage(["claude", "codex"], new Error("session limit · resets 9pm"));
    expect(all).toMatch(/Every AI/);
  });
});

describe("Codex error interpretation", () => {
  it("does not surface the version banner as the failure", () => {
    expect(interpretCodexError("OpenAI Codex v0.160.1\n--------\nworkdir: /tmp\n", 1)).not.toMatch(/v0\.160|CLI failed/i);
    expect(interpretCodexError("OpenAI Codex v0.160.1\n--------\n", 1)).toMatch(/didn't answer|signed in/i);
    expect(interpretCodexError("OpenAI Codex v0.160.1\n--------\n", 143)).toMatch(/too long/i);
  });

  it("reads the nested ERROR JSON message", () => {
    const err = `OpenAI Codex v0.160.1
ERROR: {"type":"error","status":400,"error":{"type":"invalid_request_error","message":"The 'gpt-x' model is not supported when using Codex with a ChatGPT account.","code":"model_not_found"}}`;
    expect(interpretCodexError(err, 1)).toMatch(/ChatGPT plan|Settings/i);
  });

  it("marks auth and empty Codex failures as worth falling back", () => {
    expect(isFallbackAiError("Codex isn't signed in. Run `codex login`")).toBe(true);
    expect(isFallbackAiError("Codex didn't answer. Check you're signed in")).toBe(true);
    expect(isFallbackAiError("Peguin needs Accessibility")).toBe(false);
  });
});

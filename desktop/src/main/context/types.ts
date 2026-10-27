import type { PromptActivity } from "../../../../src/core/brain/prompts.js";

/** "mac" is the work log (app and window titles), added by the app when the owner turns it on. */
export type SourceId =
  | "git" | "github"
  | "claude_code" | "codex" | "cursor" | "gemini" | "copilot" | "continue" | "deepseek"
  | "linear" | "jira" | "mac";
export type Activity = PromptActivity & { source: SourceId; project?: string };

/** What a source found, for the Sources screen. */
export type SourceReport = {
  id: SourceId;
  ok: boolean;
  items: number;
  summary: string;      // "14 commits in 3 repos"
  hint?: string;        // how to fix it when not ok
};

export type SourceResult = { activity: Activity[]; report: SourceReport };

import type { PromptActivity } from "../../../../src/core/brain/prompts.js";

export type SourceId = "git" | "github" | "claude_code";
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

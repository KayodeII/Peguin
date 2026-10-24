// Messages between the extension's parts: the Meet page (content script), the
// audio page (offscreen document) and the panel (side panel, where the copilot runs).
import type { Heard } from "./merge.js";
import type { WhisperModel } from "./settings.js";

export type MeetState = "lobby" | "in-call" | "ended";

/** Content script -> panel. */
export type FromMeet =
  | { type: "meet:heard"; heard: Heard[] }
  | { type: "meet:state"; state: MeetState; captions: boolean };

/** Panel -> content script (chrome.tabs.sendMessage). */
export type ToMeet =
  | { type: "meet:hello" }
  | { type: "meet:captions"; on: boolean }
  | { type: "meet:notice"; text: string }
  | { type: "meet:stop" };

/** Offscreen -> panel. */
export type FromAudio =
  | { type: "audio:heard"; heard: Heard }
  | { type: "audio:level"; level: number }
  | { type: "audio:status"; status: "loading" | "ready" | "listening" | "stopped" | "error"; detail?: string; progress?: number };

/** Panel -> offscreen. */
export type ToAudio =
  | { type: "audio:start"; streamId: string; model: WhisperModel }
  | { type: "audio:stop" };

export const isMeetUrl = (url?: string) => !!url && /^https:\/\/meet\.google\.com\/[a-z]{3,4}-[a-z]{4}-[a-z]{3,4}/.test(url);

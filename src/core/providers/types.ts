export type Platform = "zoom" | "google_meet" | "teams" | "webex" | "unknown";

export function detectPlatform(url: string): Platform {
  let host = "";
  try { host = new URL(url).hostname.toLowerCase(); } catch { return "unknown"; }
  if (host === "zoom.us" || host.endsWith(".zoom.us") || host.endsWith(".zoomgov.com")) return "zoom";
  if (host === "meet.google.com") return "google_meet";
  if (host.endsWith("teams.microsoft.com") || host.endsWith("teams.live.com")) return "teams";
  if (host.endsWith(".webex.com")) return "webex";
  return "unknown";
}

export type BotEventKind = "joining" | "waiting_room" | "in_call" | "ended" | "failed";
export type BotEvent = { botId: string; kind: BotEventKind; detail?: string };

export interface MeetingBotProvider {
  readonly name: "recall" | "attendee";
  /** Send a bot into the call. The bot loads `agentPageUrl` in a headless
   *  browser: the page's audio becomes the bot's microphone and the meeting's
   *  audio is the page's microphone input. */
  createBot(input: {
    meetingUrl: string;
    botName: string;
    agentPageUrl: string;
    webhookUrl: string;
    metadata: Record<string, string>;
  }): Promise<{ botId: string }>;
  leave(botId: string): Promise<void>;
  /** Normalise a webhook body into a bot lifecycle event (null = ignore). */
  parseWebhook(body: any): BotEvent | null;
}

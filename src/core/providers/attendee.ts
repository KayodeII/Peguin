import { config, requireKey } from "../config.js";
import type { BotEvent, BotEventKind, MeetingBotProvider } from "./types.js";

async function call(path: string, init: RequestInit = {}) {
  const res = await fetch(`${config.ATTENDEE_BASE_URL}${path}`, {
    ...init,
    headers: { Authorization: `Token ${requireKey("ATTENDEE_API_KEY")}`, "Content-Type": "application/json", ...init.headers },
  });
  if (!res.ok) throw new Error(`Attendee ${init.method ?? "GET"} ${path} failed: ${res.status} ${await res.text()}`);
  return res.status === 204 ? null : res.json().catch(() => null);
}

const STATE_MAP: Record<string, BotEventKind> = {
  joining: "joining",
  waiting_room: "waiting_room",
  joined_not_recording: "in_call",
  joined_recording: "in_call",
  joined_recording_paused: "in_call",
  leaving: "ended",
  post_processing: "ended",
  ended: "ended",
  fatal_error: "failed",
  fatal: "failed",
};

export const attendee: MeetingBotProvider = {
  name: "attendee",

  async createBot({ meetingUrl, botName, agentPageUrl, webhookUrl, metadata }) {
    const body = {
      meeting_url: meetingUrl,
      bot_name: botName,
      metadata,
      voice_agent_settings: { url: agentPageUrl },
      webhooks: [{ url: webhookUrl, triggers: ["bot.state_change"] }],
    };
    const bot = await call("/bots", { method: "POST", body: JSON.stringify(body) });
    return { botId: bot.id as string };
  },

  async leave(botId) {
    await call(`/bots/${botId}/leave`, { method: "POST" });
  },

  parseWebhook(body): BotEvent | null {
    if (body?.trigger !== "bot.state_change") return null;
    const botId = body?.bot_id;
    const kind = STATE_MAP[String(body?.data?.new_state ?? "")];
    if (!botId || !kind) return null;
    return { botId, kind, detail: body?.data?.event_type };
  },
};

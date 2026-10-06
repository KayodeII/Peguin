import { config, requireKey } from "../config.js";
import type { BotEvent, BotEventKind, MeetingBotProvider } from "./types.js";

const base = () => `https://${config.RECALL_REGION}.recall.ai/api/v1`;

async function call(path: string, init: RequestInit = {}) {
  const res = await fetch(`${base()}${path}`, {
    ...init,
    headers: { Authorization: requireKey("RECALL_API_KEY"), "Content-Type": "application/json", ...init.headers },
  });
  if (!res.ok) throw new Error(`Recall ${init.method ?? "GET"} ${path} failed: ${res.status} ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}

const EVENT_MAP: Record<string, BotEventKind> = {
  "bot.joining_call": "joining",
  "bot.in_waiting_room": "waiting_room",
  "bot.in_call_not_recording": "in_call",
  "bot.in_call_recording": "in_call",
  "bot.call_ended": "ended",
  "bot.done": "ended",
  "bot.fatal": "failed",
};

export const recall: MeetingBotProvider = {
  name: "recall",

  async createBot({ meetingUrl, botName, agentPageUrl, metadata }) {
    // Status webhooks are configured once in the Recall dashboard pointing at
    // {API_PUBLIC_URL}/webhooks/recall?token={WEBHOOK_SECRET}.
    const body = {
      meeting_url: meetingUrl,
      bot_name: botName,
      metadata,
      variant: { zoom: config.RECALL_BOT_VARIANT, google_meet: config.RECALL_BOT_VARIANT, microsoft_teams: config.RECALL_BOT_VARIANT },
      output_media: { camera: { kind: "webpage", config: { url: agentPageUrl } } },
    };
    const bot = await call("/bot/", { method: "POST", body: JSON.stringify(body) });
    return { botId: bot.id as string };
  },

  async leave(botId) {
    await call(`/bot/${botId}/leave_call/`, { method: "POST" });
  },

  parseWebhook(body): BotEvent | null {
    const kind = EVENT_MAP[body?.event];
    const botId = body?.data?.bot?.id;
    if (!kind || !botId) return null;
    return { botId, kind, detail: body?.data?.data?.sub_code ?? body?.data?.data?.code };
  },
};

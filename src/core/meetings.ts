import { config } from "./config.js";
import { sessionToken } from "./crypto.js";
import { provider } from "./providers/index.js";
import type { Meeting, User } from "./repo.js";

export const botName = (u: User) => `${u.name.split(/\s+/)[0]}${config.BOT_NAME_SUFFIX}`;

export function agentPageUrl(meetingId: string): string {
  const u = new URL("/agent", config.REALTIME_PUBLIC_URL);
  u.searchParams.set("m", meetingId);
  u.searchParams.set("t", sessionToken(meetingId));
  return u.toString();
}

export const webhookUrl = (providerName: string) =>
  `${config.API_PUBLIC_URL}/webhooks/${providerName}?token=${encodeURIComponent(config.WEBHOOK_SECRET)}`;

export async function sendBot(m: Meeting, u: User) {
  const p = provider(m.provider);
  return p.createBot({
    meetingUrl: m.meeting_url,
    botName: botName(u),
    agentPageUrl: agentPageUrl(m.id),
    webhookUrl: webhookUrl(p.name),
    metadata: { penguin_meeting_id: m.id, penguin_user_id: u.id },
  });
}

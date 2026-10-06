import { config } from "../config.js";
import { attendee } from "./attendee.js";
import { recall } from "./recall.js";
import type { MeetingBotProvider } from "./types.js";

export * from "./types.js";

const providers: Record<string, MeetingBotProvider> = { recall, attendee };

export function provider(name: string = config.BOT_PROVIDER): MeetingBotProvider {
  const p = providers[name];
  if (!p) throw new Error(`Unknown bot provider "${name}"`);
  return p;
}

import { Redis } from "ioredis";
import { config } from "./config.js";

/** BullMQ requires maxRetriesPerRequest: null on its connections. */
export function redisConnection(): Redis {
  return new Redis(config.REDIS_URL, { maxRetriesPerRequest: null });
}

/** Pub/sub channel for live events about one meeting (captions, state). */
export const meetingChannel = (meetingId: string) => `penguin:meeting:${meetingId}`;

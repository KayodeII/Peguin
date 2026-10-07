import "dotenv/config";
import { z } from "zod";

const Env = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  LOG_LEVEL: z.string().default("info"),

  DATABASE_URL: z.string().default("postgres://penguin:penguin@localhost:5432/penguin"),
  REDIS_URL: z.string().default("redis://localhost:6379"),

  // Public base URLs. The meeting-bot provider must be able to reach both
  // (use ngrok or a real domain in development).
  API_PUBLIC_URL: z.string().default("http://localhost:8080"),
  REALTIME_PUBLIC_URL: z.string().default("http://localhost:8081"),
  API_PORT: z.coerce.number().default(8080),
  REALTIME_PORT: z.coerce.number().default(8081),

  // Secrets
  ADMIN_API_KEY: z.string().min(16).default("dev-admin-key-change-me"),
  SESSION_SECRET: z.string().min(16).default("dev-session-secret-change-me"),
  WEBHOOK_SECRET: z.string().min(16).default("dev-webhook-secret-change-me"),
  // 32 bytes, base64. Generate with: openssl rand -base64 32
  ENCRYPTION_KEY: z.string().default("ZGV2LWVuY3J5cHRpb24ta2V5LWNoYW5nZS1tZS0zMmI="),

  // Meeting-bot provider: recall (managed) or attendee (self-hosted / attendee.dev)
  BOT_PROVIDER: z.enum(["recall", "attendee"]).default("recall"),
  BOT_NAME_SUFFIX: z.string().default("'s assistant (AI)"),
  RECALL_API_KEY: z.string().optional(),
  RECALL_REGION: z.string().default("us-west-2"),
  RECALL_BOT_VARIANT: z.string().default("web_4_core"),
  ATTENDEE_API_KEY: z.string().optional(),
  ATTENDEE_BASE_URL: z.string().default("https://app.attendee.dev/api/v1"),

  // AI
  ANTHROPIC_API_KEY: z.string().optional(),
  CLAUDE_MODEL: z.string().default("claude-opus-5"),
  // Speech (Deepgram: streaming speech-to-text + text-to-speech)
  DEEPGRAM_API_KEY: z.string().optional(),
  DEEPGRAM_STT_MODEL: z.string().default("nova-3"),
  DEEPGRAM_TTS_MODEL: z.string().default("aura-2-thalia-en"),

  // Capacity: how many live meetings a single realtime node accepts.
  REALTIME_MAX_SESSIONS: z.coerce.number().default(300),
  WORKER_CONCURRENCY: z.coerce.number().default(20),
});

export type Config = z.infer<typeof Env>;
export const config: Config = Env.parse(process.env);

export function requireKey<K extends keyof Config>(key: K): NonNullable<Config[K]> {
  const v = config[key];
  if (v === undefined || v === null || v === "") {
    throw new Error(`${String(key)} is not set. Add it to your .env file.`);
  }
  return v as NonNullable<Config[K]>;
}

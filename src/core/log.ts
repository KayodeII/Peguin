import { pino } from "pino";
import { config } from "./config.js";

export const log = pino({
  level: config.LOG_LEVEL,
  base: { service: process.env.PENGUIN_SERVICE ?? "penguin" },
  redact: ["token", "*.token", "authorization", "*.authorization"],
});

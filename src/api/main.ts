process.env.PENGUIN_SERVICE = "api";
import { config } from "../core/config.js";
import { pool } from "../core/db.js";
import { log } from "../core/log.js";
import { buildApp } from "./app.js";

const server = buildApp().listen(config.API_PORT, () => log.info({ port: config.API_PORT }, "api listening"));

for (const sig of ["SIGTERM", "SIGINT"] as const) {
  process.on(sig, () => server.close(() => pool.end().then(() => process.exit(0))));
}

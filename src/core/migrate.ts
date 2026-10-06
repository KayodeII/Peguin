import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { pool } from "./db.js";
import { log } from "./log.js";

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../migrations");

/** Applies migrations/*.sql in order, once each. A Postgres advisory lock keeps
 *  concurrent deploys from racing. */
export async function migrate(): Promise<void> {
  const c = await pool.connect();
  try {
    await c.query("SELECT pg_advisory_lock(727272)");
    await c.query("CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())");
    const done = new Set((await c.query("SELECT name FROM schema_migrations")).rows.map((r) => r.name));
    for (const f of (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort()) {
      if (done.has(f)) continue;
      await c.query("BEGIN");
      await c.query(await readFile(path.join(dir, f), "utf8"));
      await c.query("INSERT INTO schema_migrations (name) VALUES ($1)", [f]);
      await c.query("COMMIT");
      log.info({ migration: f }, "applied migration");
    }
  } catch (e) {
    await c.query("ROLLBACK").catch(() => {});
    throw e;
  } finally {
    await c.query("SELECT pg_advisory_unlock(727272)").catch(() => {});
    c.release();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  migrate().then(() => pool.end()).catch((e) => { log.error(e); process.exit(1); });
}

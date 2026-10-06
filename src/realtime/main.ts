process.env.PENGUIN_SERVICE = "realtime";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { WebSocketServer } from "ws";
import { config } from "../core/config.js";
import { verifySessionToken } from "../core/crypto.js";
import { pool } from "../core/db.js";
import { log } from "../core/log.js";
import { redisConnection } from "../core/redis.js";
import * as repo from "../core/repo.js";
import { MeetingSession } from "./session.js";

const pageFile = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../public/agent.html");
const pub = redisConnection();
const sub = redisConnection();
const sessions = new Map<string, MeetingSession>();
let draining = false;

/** Commands from any API node reach whichever realtime node holds the meeting. */
const cmdChannel = (id: string) => `penguin:cmd:${id}`;
sub.on("message", (channel, msg) => {
  const id = channel.slice("penguin:cmd:".length);
  const s = sessions.get(id);
  if (s) void s.command(JSON.parse(msg)).catch((e) => log.error({ err: String(e) }, "command failed"));
});

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://x");
  if (url.pathname === "/healthz") {
    res.writeHead(draining ? 503 : 200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ ok: !draining, sessions: sessions.size, capacity: config.REALTIME_MAX_SESSIONS }));
  }
  if (url.pathname === "/agent") {
    // The page the meeting bot loads. Its audio output is the bot's voice.
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
    return res.end(await readFile(pageFile));
  }
  res.writeHead(404).end();
});

const wss = new WebSocketServer({ noServer: true, maxPayload: 1 << 20 });

server.on("upgrade", async (req, socket, head) => {
  const url = new URL(req.url ?? "/", "http://x");
  const meetingId = url.searchParams.get("m") ?? "";
  const token = url.searchParams.get("t") ?? "";
  const reject = (code: number) => { socket.write(`HTTP/1.1 ${code} x\r\n\r\n`); socket.destroy(); };

  if (url.pathname !== "/ws") return reject(404);
  if (!/^[0-9a-f-]{36}$/.test(meetingId) || !verifySessionToken(meetingId, token)) return reject(401);
  // Full or draining: refuse so the load balancer retries another node.
  if (draining || sessions.size >= config.REALTIME_MAX_SESSIONS) return reject(503);
  if (!config.DEEPGRAM_API_KEY || !config.ANTHROPIC_API_KEY) {
    log.error("DEEPGRAM_API_KEY and ANTHROPIC_API_KEY must be set for live meetings");
    return reject(503);
  }

  const meeting = await repo.getMeeting(meetingId);
  const user = meeting && (await repo.getUser(meeting.user_id));
  if (!meeting || !user || meeting.status === "ended" || meeting.status === "failed") return reject(410);

  wss.handleUpgrade(req, socket, head, (ws) => {
    const prev = sessions.get(meetingId);
    if (prev) void prev.close("replaced by reconnect");
    const s = new MeetingSession(meeting, user, ws, pub);
    sessions.set(meetingId, s);
    void sub.subscribe(cmdChannel(meetingId));
    s.start();

    let alive = true;
    ws.on("pong", () => (alive = true));
    const ping = setInterval(() => { if (!alive) ws.terminate(); alive = false; ws.ping(); }, 15000);
    ws.on("close", () => {
      clearInterval(ping);
      if (sessions.get(meetingId) === s) {
        sessions.delete(meetingId);
        void sub.unsubscribe(cmdChannel(meetingId));
      }
      void s.close("page disconnected");
    });
  });
});

server.listen(config.REALTIME_PORT, () => log.info({ port: config.REALTIME_PORT }, "realtime listening"));

/** Graceful drain on deploy: stop taking new meetings, let live ones finish
 *  (standups are short), then exit. */
async function shutdown() {
  if (draining) return;
  draining = true;
  log.info({ sessions: sessions.size }, "draining");
  const deadline = Date.now() + 20 * 60 * 1000;
  while (sessions.size && Date.now() < deadline) await new Promise((r) => setTimeout(r, 2000));
  await Promise.all([...sessions.values()].map((s) => s.close("node shutdown")));
  server.close();
  await Promise.allSettled([pub.quit(), sub.quit(), pool.end()]);
  process.exit(0);
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
